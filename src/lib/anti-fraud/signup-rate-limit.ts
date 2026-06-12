import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Rate limit dedicado para signup, baseado em `SignupAttempt`. Substitui a
 * abordagem AuditLog-based introduzida no Sprint 1 hardening (Sprint 4 promove
 * pra tabela purpose-built com indexes voltados a contagem por janela).
 *
 * Limites:
 * - 3 attempts (success ou fail) em 24h por IP.
 * - 5 attempts em 24h pelo mesmo emailHash (anti-account-stuffing).
 *
 * Em todo signup, mesmo bem-sucedido, registrar via `trackSignupAttempt()`
 * com `succeeded` apropriado. Failed attempts contam pro rate limit; bem-
 * sucedidos também (para evitar criar 5 contas seguidas).
 */

const IP_LIMIT_PER_DAY = 3;
const EMAIL_LIMIT_PER_DAY = 5;
const WINDOW_MS = 24 * 60 * 60_000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "TOO_MANY_FROM_IP" | "TOO_MANY_FROM_EMAIL"; recent: number; limit: number };

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function checkSignupRateLimit(input: {
  ipAddress: string | null;
  email: string;
}): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS);
  const emailHash = hashEmail(input.email);

  if (input.ipAddress) {
    const fromIp = await prisma.signupAttempt.count({
      where: { ipAddress: input.ipAddress, createdAt: { gt: since } },
    });
    if (fromIp >= IP_LIMIT_PER_DAY) {
      return {
        allowed: false,
        reason: "TOO_MANY_FROM_IP",
        recent: fromIp,
        limit: IP_LIMIT_PER_DAY,
      };
    }
  }

  const fromEmail = await prisma.signupAttempt.count({
    where: { emailHash, createdAt: { gt: since } },
  });
  if (fromEmail >= EMAIL_LIMIT_PER_DAY) {
    return {
      allowed: false,
      reason: "TOO_MANY_FROM_EMAIL",
      recent: fromEmail,
      limit: EMAIL_LIMIT_PER_DAY,
    };
  }

  return { allowed: true };
}

export async function trackSignupAttempt(input: {
  ipAddress: string | null;
  email: string;
  cpfHash?: string | null;
  fingerprint?: string | null;
  succeeded: boolean;
  failureReason?: string | null;
}): Promise<void> {
  await prisma.signupAttempt.create({
    data: {
      ipAddress: input.ipAddress,
      emailHash: hashEmail(input.email),
      cpfHash: input.cpfHash ?? null,
      fingerprint: input.fingerprint ?? null,
      succeeded: input.succeeded,
      failureReason: input.failureReason ?? null,
    },
  });
}
