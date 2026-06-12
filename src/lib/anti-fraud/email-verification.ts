import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Email verification: token single-use, expira em 24h.
 *
 * Em **dev sem RESEND_API_KEY**, `sendVerificationEmail` loga o link no
 * console (suficiente para validar o fluxo localmente). Em **produção sem
 * RESEND_API_KEY**, falha (caller decide se aborta o signup).
 */

const TOKEN_TTL_HOURS = 24;
const TOKEN_BYTES = 32;

export type SendResult =
  | { ok: true; mode: "REAL" | "DEV_LOGGED" }
  | { ok: false; reason: "MISCONFIGURED" | "PROVIDER_ERROR"; detail?: string };

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" };

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Gera token, persiste hash em User.emailVerificationToken e retorna token
 * em plaintext (caller envia por email). NUNCA persistir o token plaintext.
 */
export async function createVerificationToken(userId: string): Promise<string> {
  const plaintext = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60_000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationToken: hashToken(plaintext),
      emailVerificationExpiresAt: expiresAt,
    },
  });

  return plaintext;
}

export async function verifyEmailToken(plaintext: string): Promise<VerifyResult> {
  const hashed = hashToken(plaintext);
  const user = await prisma.user.findUnique({
    where: { emailVerificationToken: hashed },
  });
  if (!user) return { ok: false, reason: "NOT_FOUND" };
  if (
    !user.emailVerificationExpiresAt ||
    user.emailVerificationExpiresAt < new Date()
  ) {
    return { ok: false, reason: "EXPIRED" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  });

  return { ok: true, userId: user.id };
}

export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  token: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/api/auth/verify-email?token=${input.token}`;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "MISCONFIGURED" };
    }
    console.info(
      `[email-verification] RESEND_API_KEY ausente — link de verificação para ${input.to}: ${link}`,
    );
    return { ok: true, mode: "DEV_LOGGED" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ConfirmaAí <noreply@clinicaorganizada.com>",
        to: [input.to],
        subject: "Confirme seu email — ConfirmaAí",
        html: `
          <p>Olá ${escapeHtml(input.name)},</p>
          <p>Bem-vindo(a) ao ConfirmaAí. Para ativar sua conta, confirme seu email:</p>
          <p><a href="${link}">Confirmar meu email</a></p>
          <p>Esse link expira em ${TOKEN_TTL_HOURS}h.</p>
          <p>Se você não criou uma conta, ignore este email.</p>
        `,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: "PROVIDER_ERROR", detail: detail.slice(0, 200) };
    }
    return { ok: true, mode: "REAL" };
  } catch (err) {
    return { ok: false, reason: "PROVIDER_ERROR", detail: String(err).slice(0, 200) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
