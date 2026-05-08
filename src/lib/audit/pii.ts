/**
 * Helpers para mascarar PII antes de gravar em `AuditLog.metadata`.
 *
 * Regra: NUNCA jogar dado bruto em metadata. Sempre passar por uma destas
 * funções. PII em `before/after` da Prisma extension é tratada por
 * `REDACTED_FIELDS` em `prisma-extension.ts`.
 */

/** Mascara um telefone preservando os 4 últimos dígitos: `+5511***1234`. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***" + digits;
  const last4 = digits.slice(-4);
  const prefix = phone.startsWith("+") ? "+" + digits.slice(0, Math.min(4, digits.length - 4)) : digits.slice(0, Math.min(4, digits.length - 4));
  return `${prefix}***${last4}`;
}

/** Mascara um email: `j***@example.com`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local?.[0] ?? "";
  return `${head}***@${domain}`;
}

/** Trunca uma mensagem livre a 60 chars + ellipsis (não logar conteúdo médico). */
export function truncateMessage(text: string | null | undefined, max = 60): string | null {
  if (!text) return null;
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}
