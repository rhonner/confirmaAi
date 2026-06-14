/**
 * Allowlist de administradores por email (Sprint 10).
 *
 * O modelo `User` não tem campo `role` — admin é definido pela env
 * `ADMIN_EMAILS` (lista separada por vírgula). Mantém o painel admin fora
 * do alcance de qualquer tenant comum sem migração de schema.
 *
 * Prod: setar `ADMIN_EMAILS` na Vercel. Dev: no `.env` local.
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
