import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, escapeHtml, type EmailSendResult } from "@/lib/email";
import { renderEmailLayout } from "@/lib/emails/layout";

/**
 * Reset de senha com token ASSINADO STATELESS (Sprint 10 / fatia 2).
 *
 * Por que stateless (sem coluna nova / sem migration): o HMAC usa
 * `NEXTAUTH_SECRET + hash atual da senha` como chave. Assim que a senha muda,
 * o hash muda → tokens antigos param de validar = **single-use** sem precisar
 * persistir/invalidar nada. Expira em 1h. Padrão clássico (Django).
 *
 * `makeResetToken` e `parseAndVerify` são PUROS (testáveis sem DB);
 * `verifyResetToken` busca o user e delega.
 */
const TTL_MS = 60 * 60_000; // 1h

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET ausente — não dá pra assinar token de reset");
  return s;
}

function sign(body: string, passwordHash: string): string {
  return createHmac("sha256", secret() + passwordHash).update(body).digest("base64url");
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** PURA: gera o token dado o id + hash atual da senha. */
export function makeResetToken(userId: string, passwordHash: string, now: number = Date.now()): string {
  const body = `${userId}.${now + TTL_MS}`;
  return `${b64(body)}.${sign(body, passwordHash)}`;
}

export type ResetVerify =
  | { ok: true; userId: string }
  | { ok: false; reason: "MALFORMED" | "EXPIRED" | "INVALID" | "NOT_FOUND" };

/** PURA: valida assinatura + expiração dado o hash da senha. Sem DB. */
export function parseAndVerify(
  token: string,
  passwordHash: string,
  now: number = Date.now(),
): ResetVerify {
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
  const userId = body.slice(0, dot);
  const exp = Number(body.slice(dot + 1));
  if (!userId || !Number.isFinite(exp)) return { ok: false, reason: "MALFORMED" };
  if (exp < now) return { ok: false, reason: "EXPIRED" };

  const expected = Buffer.from(sign(body, passwordHash));
  const got = Buffer.from(parts[1]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { ok: false, reason: "INVALID" };
  }
  return { ok: true, userId };
}

/** Busca o user (por id embutido no token) e valida contra o hash atual. */
export async function verifyResetToken(token: string, now: number = Date.now()): Promise<ResetVerify> {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" };
  let userId: string;
  try {
    const body = unb64(parts[0]);
    userId = body.slice(0, body.lastIndexOf("."));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (!userId) return { ok: false, reason: "MALFORMED" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) return { ok: false, reason: "NOT_FOUND" };

  return parseAndVerify(token, user.password, now);
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  token: string;
}): Promise<EmailSendResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/redefinir-senha?token=${encodeURIComponent(input.token)}`;

  // Dev sem chave: link no console pra completar o fluxo localmente.
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.info(`[password-reset] link para ${input.to}: ${link}`);
  }

  return sendEmail({
    to: input.to,
    subject: "Redefinir sua senha — Clínica Organizada",
    html: renderEmailLayout({
      heading: "Redefinir senha",
      bodyHtml: `<p>Olá ${escapeHtml(input.name)},</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo — o link vale por <strong>1 hora</strong>.</p>`,
      cta: { label: "Redefinir minha senha", url: link },
      footnote:
        "Se você não pediu isso, ignore este email — sua senha continua a mesma.",
    }),
  });
}
