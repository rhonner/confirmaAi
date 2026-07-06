import { prisma } from "@/lib/prisma";
import { captureError } from "@/lib/observability";
import { decryptToken, encryptToken } from "./token-crypto";
import { GoogleOAuthError, refreshAccessToken } from "./oauth";
import type { GoogleCalendarConnection } from "@/generated/prisma/client";

/**
 * Live-fetch de eventos do Google Calendar (Fase A — overlay somente-leitura).
 *
 * FIREWALL: nada aqui escreve na tabela `Appointment` nem persiste eventos —
 * os eventos são buscados por requisição e devolvidos como DTO para exibição.
 * O scheduler (confirmações/no-show) fisicamente não enxerga esses dados.
 * Ver .context/features/google-calendar.md § firewall ExternalEvent.
 */

const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars";
const MAX_RESULTS = 250;
/** Buffer para não usar um access token à beira de expirar (skew de relógio). */
const EXPIRY_BUFFER_MS = 60_000;

export type GcalEventDTO = {
  id: string;
  title: string;
  /** ISO datetime (com offset) para eventos com hora; `yyyy-MM-dd` se allDay. */
  start: string;
  /** Idem. Para allDay, o `end` do Google é EXCLUSIVO (dia seguinte). */
  end: string;
  allDay: boolean;
  /** Link para abrir o evento no Google Calendar (read-only na nossa UI). */
  htmlLink: string | null;
};

export type GcalFetchResult =
  | { ok: true; events: GcalEventDTO[]; truncated: boolean }
  | { ok: false; reason: "NOT_CONNECTED" | "NEEDS_RECONSENT" | "UPSTREAM_ERROR" };

/** Formato bruto (parcial) de um item do events.list. */
export type RawGoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  visibility?: string;
  eventType?: string;
  htmlLink?: string;
};

/**
 * Tipos de evento que fazem sentido como "compromisso" no overlay. Filtra
 * outOfOffice, focusTime, workingLocation e birthday (matriz de cenários,
 * grupo "formato do evento") — ruído para um profissional de agenda.
 */
const OVERLAY_EVENT_TYPES = new Set(["default", "fromGmail"]);

/**
 * Mapeia um item bruto do Google para o DTO do overlay. Retorna `null` para
 * eventos que não devem aparecer (cancelados, tipos filtrados, sem horário).
 * Puro — coberto por testes unitários.
 */
export function mapGoogleEvent(raw: RawGoogleEvent): GcalEventDTO | null {
  if (!raw.id) return null;
  // Soft-deleted no Google continua vindo na listagem como "cancelled".
  if (raw.status === "cancelled") return null;
  if (raw.eventType && !OVERLAY_EVENT_TYPES.has(raw.eventType)) return null;

  const allDay = !!raw.start?.date;
  const start = raw.start?.dateTime ?? raw.start?.date;
  const end = raw.end?.dateTime ?? raw.end?.date;
  if (!start || !end) return null;

  // Privado/confidencial: mostra o bloco ocupado sem vazar o título (o dono do
  // tenant pode compartilhar a tela com paciente/equipe).
  const isPrivate = raw.visibility === "private" || raw.visibility === "confidential";
  const title = isPrivate ? "Ocupado" : raw.summary?.trim() || "(Sem título)";

  return {
    id: raw.id,
    title,
    start,
    end,
    allDay,
    htmlLink: raw.htmlLink ?? null,
  };
}

/** Access token ainda utilizável (com buffer)? Puro — testado. */
export function accessTokenIsFresh(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() > EXPIRY_BUFFER_MS;
}

async function markNeedsReconsent(userId: string, detail: string): Promise<void> {
  try {
    await prisma.googleCalendarConnection.update({
      where: { userId },
      data: { status: "NEEDS_RECONSENT", lastError: detail.slice(0, 500) },
    });
  } catch {
    // Best-effort: a linha pode ter sumido no meio do caminho (disconnect
    // concorrente → P2025). O contrato "nunca lança" do fetch prevalece.
  }
}

/** Motivos de 403 que são throttling transitório — NÃO são revogação de acesso. */
const TRANSIENT_403_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
]);

/**
 * Um 403 do events.list pode ser permissão revogada OU rate-limit transitório
 * (mesmo status HTTP). Classifica pelo `reason` do corpo de erro do Google.
 * Puro — testado. Em dúvida (corpo ilegível), trata como problema de
 * permissão: pedir reconsent é recuperável; esconder um grant morto não é.
 */
export function is403Transient(body: unknown): boolean {
  const errors = (body as { error?: { errors?: Array<{ reason?: string }> } })?.error?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.some((e) => e.reason && TRANSIENT_403_REASONS.has(e.reason));
}

/**
 * Garante um access token válido, renovando (e persistindo) se preciso.
 * Lança GoogleOAuthError(INVALID_GRANT) se o grant foi revogado — o chamador
 * transiciona a conexão para NEEDS_RECONSENT.
 */
async function ensureAccessToken(
  conn: GoogleCalendarConnection,
  opts?: { forceRefresh?: boolean },
): Promise<string> {
  if (!opts?.forceRefresh && conn.accessTokenEnc && accessTokenIsFresh(conn.accessTokenExpiresAt)) {
    try {
      return decryptToken(conn.accessTokenEnc);
    } catch {
      // Access token ilegível (chave rotacionada) → cai no refresh abaixo.
    }
  }
  let refreshToken: string;
  try {
    refreshToken = decryptToken(conn.refreshTokenEnc);
  } catch (err) {
    // Refresh token ilegível é problema PERMANENTE (chave rotacionada/blob
    // corrompido) — sem reconexão não há recuperação. Roteia para
    // NEEDS_RECONSENT (não para "degraded", que soa transitório).
    throw new GoogleOAuthError("INVALID_GRANT", `refresh token ilegível: ${err}`);
  }
  const refreshed = await refreshAccessToken(refreshToken);
  await prisma.googleCalendarConnection.update({
    where: { userId: conn.userId },
    data: {
      accessTokenEnc: encryptToken(refreshed.accessToken),
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      // Rotação de refresh token: persistir o novo quando o Google devolver.
      ...(refreshed.refreshToken
        ? { refreshTokenEnc: encryptToken(refreshed.refreshToken) }
        : {}),
      status: "CONNECTED",
      lastError: null,
    },
  });
  return refreshed.accessToken;
}

async function listEventsOnce(
  accessToken: string,
  calendarId: string,
  window: { timeMin: Date; timeMax: Date },
): Promise<Response> {
  const url = new URL(`${EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", window.timeMin.toISOString());
  url.searchParams.set("timeMax", window.timeMax.toISOString());
  // singleEvents expande recorrências em instâncias (inclusive exceções de série).
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(MAX_RESULTS));
  url.searchParams.set(
    "fields",
    "items(id,status,summary,start,end,visibility,eventType,htmlLink),nextPageToken",
  );
  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
}

/**
 * Busca os eventos do Google do tenant na janela dada. Nunca lança: devolve
 * um resultado discriminado que a rota traduz em resposta amigável.
 *
 * O gate de plano (`gcal.sync`) é responsabilidade do CHAMADOR — esta função
 * só cuida de token + fetch + mapeamento.
 */
export async function fetchGoogleEventsForUser(
  userId: string,
  window: { timeMin: Date; timeMax: Date },
): Promise<GcalFetchResult> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!conn || conn.status === "REVOKED") return { ok: false, reason: "NOT_CONNECTED" };
  if (conn.status === "NEEDS_RECONSENT") return { ok: false, reason: "NEEDS_RECONSENT" };

  try {
    let accessToken = await ensureAccessToken(conn);
    let res = await listEventsOnce(accessToken, conn.calendarId, window);

    // 401 com token "fresco" = access token invalidado fora do fluxo (troca de
    // senha, revogação parcial). Uma renovação forçada resolve; se o refresh
    // token também morreu, o refresh lança INVALID_GRANT (tratado abaixo).
    if (res.status === 401) {
      accessToken = await ensureAccessToken(conn, { forceRefresh: true });
      res = await listEventsOnce(accessToken, conn.calendarId, window);
    }

    if (res.status === 403) {
      // 403 é ambíguo no Google: rate-limit transitório OU permissão
      // revogada. Só o segundo caso pede reconsent — flipar a conexão num
      // throttle passageiro forçaria um novo OAuth em toda a base à toa.
      const body = await res.json().catch(() => null);
      if (is403Transient(body)) {
        await captureError(new Error("gcal events.list 403 transitório (rate limit)"), {
          area: "request",
          tenantUserId: userId,
          extra: { route: "gcal/events", status: 403 },
        });
        return { ok: false, reason: "UPSTREAM_ERROR" };
      }
      await markNeedsReconsent(userId, "events.list 403 (permissão)");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    if (res.status === 401) {
      await markNeedsReconsent(userId, "events.list 401");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    if (!res.ok) {
      await captureError(new Error(`gcal events.list ${res.status}`), {
        area: "request",
        tenantUserId: userId,
        extra: { route: "gcal/events", status: res.status },
      });
      return { ok: false, reason: "UPSTREAM_ERROR" };
    }

    const json = (await res.json().catch(() => ({}))) as {
      items?: RawGoogleEvent[];
      nextPageToken?: string;
    };
    const events = (json.items ?? [])
      .map(mapGoogleEvent)
      .filter((e): e is GcalEventDTO => e !== null);
    return { ok: true, events, truncated: !!json.nextPageToken };
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === "INVALID_GRANT") {
      // Grant revogado externamente (cenário OAUTH-06) → pede reconexão na UI.
      await markNeedsReconsent(userId, "invalid_grant no refresh");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    await captureError(err, {
      area: "request",
      tenantUserId: userId,
      extra: { route: "gcal/events" },
    });
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
}
