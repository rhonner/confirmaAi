import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { captureError } from "@/lib/observability";
import { decryptToken, encryptToken } from "./token-crypto";
import { GoogleOAuthError, hasWriteScope, refreshAccessToken } from "./oauth";
import type { GoogleCalendarConnection } from "@/generated/prisma/client";

/**
 * Cliente HTTP do Google Calendar. Leitura (Fase A/B — overlay + prefill da
 * promoção) e ESCRITA de eventos (Fase C — espelhar agendamentos no Google).
 *
 * FIREWALL: nada aqui toca a tabela `Appointment`. As funções de escrita só
 * falam com a API do Google e com `GoogleCalendarConnection` (token). A
 * orquestração que lê o agendamento e persiste `googleEventId` fica em
 * `mirror.ts` — que também IGNORA agendamentos promovidos DO Google (com
 * `ExternalEvent`), preservando o firewall nos dois sentidos. O scheduler
 * (confirmações/no-show) continua sem enxergar nada disto.
 * Ver .context/features/google-calendar.md § firewall / Fase C.
 */

const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars";
const MAX_RESULTS = 250;
/** Buffer para não usar um access token à beira de expirar (skew de relógio). */
const EXPIRY_BUFFER_MS = 60_000;
/** Fuso das clínicas (BR). Eventos espelhados carregam este timeZone. */
const APP_TIMEZONE = "America/Sao_Paulo";

/**
 * Marcador (extendedProperties.private) que identifica um evento criado por NÓS
 * (espelho de um Appointment, Fase C). É a blindagem id-independente do loop: o
 * overlay descarta eventos com esta tag (mapGoogleEvent/Detail → null), então o
 * evento que criamos NUNCA reaparece como bloco promovível — mesmo que a
 * persistência do `googleEventId` no Appointment tenha falhado.
 */
export const APP_ORIGIN_TAG = "confirmaaiOrigin";
export const APP_ORIGIN_VALUE = "app";

/** O bruto do Google é um evento de origem-app (criado pelo nosso mirror)? Puro. */
export function isAppOriginRaw(raw: RawGoogleEvent): boolean {
  return raw.extendedProperties?.private?.[APP_ORIGIN_TAG] === APP_ORIGIN_VALUE;
}

/**
 * Id determinístico do evento no Google derivado do `appointmentId`. base32hex
 * (a-v + 0-9): usamos hex (⊂ base32hex) para caber na regra do Google (5–1024
 * chars). Torna o `events.insert` IDEMPOTENTE — reenviar o mesmo insert bate no
 * mesmo id → Google devolve 409 (tratado como sucesso), sem duplicar o evento.
 * Puro — testado.
 */
export function appOriginEventId(appointmentId: string): string {
  return "cai" + createHash("sha256").update(appointmentId).digest("hex");
}

export type AppointmentEventInput = {
  appointmentId: string;
  userId: string;
  summary: string;
  description?: string | null;
  start: Date;
  durationMinutes: number;
};

/**
 * Monta o recurso de evento do Google a partir de um Appointment. Sem
 * `attendees` DE PROPÓSITO: incluir o paciente como convidado faria o Google
 * enviar convite/e-mail a ele — o espelho é privado, não uma notificação.
 * Puro — testado.
 */
export function buildEventResource(input: AppointmentEventInput): Record<string, unknown> {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  return {
    id: appOriginEventId(input.appointmentId),
    // status "confirmed" EXPLÍCITO: no insert é o default (inócuo), mas num patch
    // ele RESSUSCITA um evento que ficou "cancelled" — o caso da reabertura de um
    // agendamento cancelado/no-show cujo evento foi apagado (o Google reserva o id
    // do evento apagado como tombstone; recriá-lo por insert dá 409 e ele fica
    // invisível — resolver exige update com status:confirmed). Ver Fase C.
    status: "confirmed",
    summary: input.summary,
    // description SEMPRE presente (vazia quando sem observações): events.patch tem
    // merge semantics — OMITIR a chave NÃO limpa o campo. Para apagar a observação
    // no app refletir no Google, é preciso enviar "" explicitamente.
    description: input.description ?? "",
    start: { dateTime: input.start.toISOString(), timeZone: APP_TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: APP_TIMEZONE },
    extendedProperties: {
      private: {
        [APP_ORIGIN_TAG]: APP_ORIGIN_VALUE,
        confirmaaiAppointmentId: input.appointmentId,
        confirmaaiUserId: input.userId,
      },
    },
  };
}

export type GcalWriteFailReason =
  | "NOT_CONNECTED"
  | "NO_WRITE_SCOPE"
  | "NEEDS_RECONSENT"
  | "UPSTREAM_ERROR";

export type GcalMutationResult =
  | { ok: true; eventId: string | null }
  | { ok: false; reason: GcalWriteFailReason };

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

/**
 * DTO detalhado de UM evento (events.get) — usado só na promoção (Fase B) para
 * pré-preencher o diálogo. Traz `description` + e-mails de convidados, que o
 * DTO do overlay não carrega. Privado/confidencial → sem vazar descrição/nomes.
 */
export type GcalEventDetailDTO = {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
  attendeeEmails: string[];
  isPrivate: boolean;
};

export type GcalEventByIdResult =
  | { ok: true; event: GcalEventDetailDTO }
  | { ok: false; reason: "NOT_CONNECTED" | "NEEDS_RECONSENT" | "NOT_FOUND" | "UPSTREAM_ERROR" };

/** Formato bruto (parcial) de um item do events.list / events.get. */
export type RawGoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  visibility?: string;
  eventType?: string;
  htmlLink?: string;
  attendees?: Array<{ email?: string }>;
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
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
  // Firewall Fase C: eventos que NÓS criamos (espelho de Appointment) nunca
  // aparecem no overlay — senão o dia mostraria o Appointment E o bloco Google,
  // e o evento seria "promovível" (loop → agendamento duplicado).
  if (isAppOriginRaw(raw)) return null;
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

/**
 * Mapeia o evento bruto (events.get) para o DTO detalhado da promoção.
 * Retorna `null` para cancelado / sem horário. Redige descrição e convidados
 * quando o evento é privado/confidencial (mesma regra de `mapGoogleEvent`).
 * Puro — testado.
 */
export function mapGoogleEventDetail(raw: RawGoogleEvent): GcalEventDetailDTO | null {
  if (!raw.id) return null;
  // Firewall Fase C: não deixa a promoção (prefill) enxergar nosso próprio
  // espelho — evita promover um evento origem-app e duplicar o Appointment.
  if (isAppOriginRaw(raw)) return null;
  if (raw.status === "cancelled") return null;

  const allDay = !!raw.start?.date;
  const start = raw.start?.dateTime ?? raw.start?.date;
  const end = raw.end?.dateTime ?? raw.end?.date;
  if (!start || !end) return null;

  const isPrivate = raw.visibility === "private" || raw.visibility === "confidential";
  const title = isPrivate ? "Ocupado" : raw.summary?.trim() || "(Sem título)";

  return {
    id: raw.id,
    title,
    description: isPrivate ? null : raw.description?.trim() || null,
    start,
    end,
    allDay,
    htmlLink: raw.htmlLink ?? null,
    attendeeEmails: isPrivate
      ? []
      : (raw.attendees ?? []).map((a) => a.email).filter((e): e is string => !!e),
    isPrivate,
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
    "items(id,status,summary,start,end,visibility,eventType,htmlLink,extendedProperties),nextPageToken",
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

async function getEventOnce(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<Response> {
  const url = new URL(
    `${EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  );
  url.searchParams.set(
    "fields",
    "id,status,summary,description,visibility,eventType,start,end,htmlLink,attendees(email),extendedProperties",
  );
  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
}

/**
 * Busca UM evento por id (events.get) com descrição + convidados — usado só na
 * promoção (Fase B) para pré-preencher o diálogo. Mesmo contrato "nunca lança"
 * e mesmo tratamento de token/401/403/invalid_grant do `fetchGoogleEventsForUser`.
 * Gate de plano é do CHAMADOR.
 */
export async function fetchGoogleEventById(
  userId: string,
  eventId: string,
): Promise<GcalEventByIdResult> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!conn || conn.status === "REVOKED") return { ok: false, reason: "NOT_CONNECTED" };
  if (conn.status === "NEEDS_RECONSENT") return { ok: false, reason: "NEEDS_RECONSENT" };

  try {
    let accessToken = await ensureAccessToken(conn);
    let res = await getEventOnce(accessToken, conn.calendarId, eventId);

    if (res.status === 401) {
      accessToken = await ensureAccessToken(conn, { forceRefresh: true });
      res = await getEventOnce(accessToken, conn.calendarId, eventId);
    }

    if (res.status === 404) return { ok: false, reason: "NOT_FOUND" };
    if (res.status === 403) {
      const body = await res.json().catch(() => null);
      if (is403Transient(body)) {
        await captureError(new Error("gcal events.get 403 transitório (rate limit)"), {
          area: "request",
          tenantUserId: userId,
          extra: { route: "gcal/event-signals", status: 403 },
        });
        return { ok: false, reason: "UPSTREAM_ERROR" };
      }
      await markNeedsReconsent(userId, "events.get 403 (permissão)");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    if (res.status === 401) {
      await markNeedsReconsent(userId, "events.get 401");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    if (!res.ok) {
      await captureError(new Error(`gcal events.get ${res.status}`), {
        area: "request",
        tenantUserId: userId,
        extra: { route: "gcal/event-signals", status: res.status },
      });
      return { ok: false, reason: "UPSTREAM_ERROR" };
    }

    const raw = (await res.json().catch(() => ({}))) as RawGoogleEvent;
    const event = mapGoogleEventDetail(raw);
    if (!event) return { ok: false, reason: "NOT_FOUND" };
    return { ok: true, event };
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === "INVALID_GRANT") {
      await markNeedsReconsent(userId, "invalid_grant no refresh");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    await captureError(err, {
      area: "request",
      tenantUserId: userId,
      extra: { route: "gcal/event-signals" },
    });
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
}

// ===========================================================================
// ESCRITA (Fase C — espelhar Appointment no Google). Mesmo contrato dos fetch:
// nunca lança, devolve resultado discriminado, e transiciona NEEDS_RECONSENT
// só quando o grant realmente morreu (403 de permissão / invalid_grant), nunca
// num throttle transitório. Gate de PLANO é do chamador (mirror.ts).
// ===========================================================================

async function insertEventOnce(
  accessToken: string,
  calendarId: string,
  resource: Record<string, unknown>,
): Promise<Response> {
  const url = `${EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events`;
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(resource),
    signal: AbortSignal.timeout(8_000),
  });
}

async function patchEventOnce(
  accessToken: string,
  calendarId: string,
  eventId: string,
  resource: Record<string, unknown>,
): Promise<Response> {
  const url = `${EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(resource),
    signal: AbortSignal.timeout(8_000),
  });
}

async function deleteEventOnce(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<Response> {
  const url = `${EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
}

/**
 * Runner comum das escritas: carrega a conexão, exige status CONNECTED + escopo
 * de escrita, garante access token, faz a chamada, retry 1× em 401, classifica
 * 403 (transitório vs permissão). Nunca lança. Devolve a Response bruta em
 * sucesso (401/403 já tratados) para o chamador interpretar os status finais
 * (200/204/404/409/410 têm significados diferentes por operação).
 */
async function performGoogleWrite(
  userId: string,
  call: (accessToken: string, calendarId: string) => Promise<Response>,
  route: string,
): Promise<{ ok: true; res: Response } | { ok: false; reason: GcalWriteFailReason }> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!conn || conn.status === "REVOKED") return { ok: false, reason: "NOT_CONNECTED" };
  if (conn.status === "NEEDS_RECONSENT") return { ok: false, reason: "NEEDS_RECONSENT" };
  // Grant legado só-leitura (pré-Fase C) não pode escrever: no-op até reconectar.
  if (!hasWriteScope(conn.scopes)) return { ok: false, reason: "NO_WRITE_SCOPE" };

  try {
    let accessToken = await ensureAccessToken(conn);
    let res = await call(accessToken, conn.calendarId);

    if (res.status === 401) {
      accessToken = await ensureAccessToken(conn, { forceRefresh: true });
      res = await call(accessToken, conn.calendarId);
    }

    if (res.status === 403) {
      const body = await res.json().catch(() => null);
      if (is403Transient(body)) {
        await captureError(new Error(`gcal ${route} 403 transitório (rate limit)`), {
          area: "request",
          tenantUserId: userId,
          extra: { route: `gcal/${route}`, status: 403 },
        });
        return { ok: false, reason: "UPSTREAM_ERROR" };
      }
      await markNeedsReconsent(userId, `${route} 403 (permissão)`);
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    if (res.status === 401) {
      await markNeedsReconsent(userId, `${route} 401`);
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    return { ok: true, res };
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === "INVALID_GRANT") {
      await markNeedsReconsent(userId, "invalid_grant no refresh");
      return { ok: false, reason: "NEEDS_RECONSENT" };
    }
    await captureError(err, { area: "request", tenantUserId: userId, extra: { route: `gcal/${route}` } });
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
}

/**
 * Cria o evento espelho no Google. O id é determinístico (idempotente).
 *
 * 409 (id já existe) NÃO é tratado como sucesso cego: pode ser um insert
 * re-tentado (evento vivo — a persistência do id falhou antes) OU um tombstone
 * "cancelled" de um cancelamento anterior (o Google reserva o id do evento
 * apagado). Nos DOIS casos um events.patch com status:"confirmed" resolve —
 * refresca o vivo e RESSUSCITA o cancelado. Sem isso, reabrir um agendamento
 * cancelado deixaria o evento invisível pra sempre (achado do code-review).
 */
export async function createGoogleEvent(
  userId: string,
  input: AppointmentEventInput,
): Promise<GcalMutationResult> {
  const resource = buildEventResource(input);
  const eventId = resource.id as string;
  const r = await performGoogleWrite(userId, (t, cal) => insertEventOnce(t, cal, resource), "events.insert");
  if (!r.ok) return r;
  const { res } = r;
  if (res.status === 409) {
    // Patch direto ao id (sem passar por patchGoogleEvent p/ evitar recursão do
    // fallback 404→insert): status:"confirmed" no resource ressuscita tombstone.
    const p = await performGoogleWrite(
      userId,
      (t, cal) => patchEventOnce(t, cal, eventId, resource),
      "events.insert.resurrect",
    );
    if (!p.ok) return p;
    if (p.res.ok) return { ok: true, eventId };
    await captureError(new Error(`gcal insert-resurrect ${p.res.status}`), {
      area: "request",
      tenantUserId: userId,
      extra: { route: "gcal/events.insert.resurrect", status: p.res.status },
    });
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
  if (!res.ok) {
    await captureError(new Error(`gcal events.insert ${res.status}`), {
      area: "request",
      tenantUserId: userId,
      extra: { route: "gcal/events.insert", status: res.status },
    });
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, eventId: json.id ?? eventId };
}

/** Atualiza o evento espelho. 404/410 (sumiu no Google) → recria via insert. */
export async function patchGoogleEvent(
  userId: string,
  eventId: string,
  input: AppointmentEventInput,
): Promise<GcalMutationResult> {
  const resource = buildEventResource(input);
  const r = await performGoogleWrite(
    userId,
    (t, cal) => patchEventOnce(t, cal, eventId, resource),
    "events.patch",
  );
  if (!r.ok) return r;
  const { res } = r;
  if (res.status === 404 || res.status === 410) return createGoogleEvent(userId, input);
  if (!res.ok) {
    await captureError(new Error(`gcal events.patch ${res.status}`), {
      area: "request",
      tenantUserId: userId,
      extra: { route: "gcal/events.patch", status: res.status },
    });
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
  return { ok: true, eventId };
}

/** Apaga o evento espelho. 204/200 = apagado; 404/410 = já não existe → idempotente. */
export async function deleteGoogleEvent(
  userId: string,
  eventId: string,
): Promise<GcalMutationResult> {
  const r = await performGoogleWrite(
    userId,
    (t, cal) => deleteEventOnce(t, cal, eventId),
    "events.delete",
  );
  if (!r.ok) return r;
  const { res } = r;
  if (res.ok || res.status === 404 || res.status === 410) return { ok: true, eventId: null };
  await captureError(new Error(`gcal events.delete ${res.status}`), {
    area: "request",
    tenantUserId: userId,
    extra: { route: "gcal/events.delete", status: res.status },
  });
  return { ok: false, reason: "UPSTREAM_ERROR" };
}
