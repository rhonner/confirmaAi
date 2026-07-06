/**
 * Revogação do grant OAuth do Google (endpoint oficial de revoke). Best-effort:
 * usado na exclusão de conta (LGPD) para invalidar o refresh token no lado do
 * Google — o token cifrado local é apagado separadamente. Não lança: registra e
 * retorna boolean. Ver .context/features/google-calendar.md § LGPD.
 */
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export async function revokeGoogleGrant(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      // 5s: o revoke roda inline na exclusão de conta (após o commit do soft-delete).
      // Falha/timeout não perde o token — a purga 30d retenta. Ver route.ts § teardown.
      signal: AbortSignal.timeout(5_000),
    });
    // 200 = revogado; a Google também 200 em token já inválido. 400 = token
    // desconhecido/expirado → tratamos como "já sem grant" (idempotente).
    return res.ok || res.status === 400;
  } catch (err) {
    console.error("[gcal] revokeGoogleGrant falhou (best-effort):", err);
    return false;
  }
}
