import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token ASSINADO STATELESS para o link de confirmação/cancelamento do paciente
 * (Feature "Confirmação por link"). Mesmo padrão do reset de senha
 * (`anti-fraud/password-reset.ts`): HMAC-SHA256, base64url, sem tabela nova.
 *
 * - Chave = `NEXTAUTH_SECRET + "confirm-link"` (label de contexto p/ não reusar
 *   o segredo cru). O `appointmentId` no corpo torna cada token único.
 * - Expiração embutida (`exp` = deadline = `dateTime - reminderHoursBefore`).
 * - **Uso único** NÃO é do token: é garantido pelo ESTADO do agendamento — a
 *   página/rota só age se `status === PENDING`. Confirmou/cancelou → o link para.
 *
 * `makeConfirmationToken` e `verifyConfirmationToken` são PUROS (sem DB) —
 * testáveis isoladamente. A rota/página é que carrega o Appointment.
 */

const CONTEXT = "confirm-link";

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET ausente — não dá pra assinar token de confirmação");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret() + CONTEXT).update(body).digest("base64url");
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/**
 * PURA: gera o token para um agendamento com expiração absoluta (ms epoch).
 * `expMs` costuma ser o deadline (dateTime - reminderHoursBefore).
 */
export function makeConfirmationToken(appointmentId: string, expMs: number): string {
  const body = `${appointmentId}.${Math.floor(expMs)}`;
  return `${b64(body)}.${sign(body)}`;
}

export type ConfirmationVerify =
  | { ok: true; appointmentId: string; exp: number }
  | { ok: false; reason: "MALFORMED" | "EXPIRED" | "INVALID" };

/** PURA: valida assinatura + expiração. Sem DB. */
export function verifyConfirmationToken(
  token: string,
  now: number = Date.now(),
): ConfirmationVerify {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" };

  let body: string;
  try {
    body = unb64(parts[0]);
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  const dot = body.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "MALFORMED" };
  const appointmentId = body.slice(0, dot);
  const exp = Number(body.slice(dot + 1));
  if (!appointmentId || !Number.isFinite(exp)) return { ok: false, reason: "MALFORMED" };

  // Assinatura ANTES da expiração: um token adulterado nunca deve ser tratado
  // como "só expirado". timingSafeEqual exige buffers do mesmo tamanho.
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(parts[1]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { ok: false, reason: "INVALID" };
  }

  if (exp < now) return { ok: false, reason: "EXPIRED" };

  return { ok: true, appointmentId, exp };
}
