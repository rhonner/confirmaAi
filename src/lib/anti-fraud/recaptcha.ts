/**
 * Verificação de token reCAPTCHA v3 (server-side).
 *
 * Configuração esperada (env):
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY  → site key (front)
 *   RECAPTCHA_SECRET_KEY            → secret (back)
 *
 * Em **dev sem chaves**, `verifyRecaptchaToken` retorna `{ ok: true, mode: "DEV_BYPASS" }`
 * e loga aviso. Isso permite trabalhar localmente sem registrar na Google.
 * Em **produção sem chaves**, falha hard (`{ ok: false, reason: "MISCONFIGURED" }`).
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;

export type RecaptchaResult =
  | { ok: true; score: number; mode: "REAL" | "DEV_BYPASS" }
  | { ok: false; reason: "MISCONFIGURED" | "MISSING_TOKEN" | "INVALID" | "LOW_SCORE"; score?: number };

export async function verifyRecaptchaToken(
  token: string | null | undefined,
  expectedAction = "signup",
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProd) return { ok: false, reason: "MISCONFIGURED" };
    console.warn("[recaptcha] RECAPTCHA_SECRET_KEY ausente — bypass em dev");
    return { ok: true, score: 1, mode: "DEV_BYPASS" };
  }

  if (!token) return { ok: false, reason: "MISSING_TOKEN" };

  try {
    const params = new URLSearchParams({ secret, response: token });
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = (await res.json()) as {
      success: boolean;
      score?: number;
      action?: string;
      "error-codes"?: string[];
    };

    if (!data.success) return { ok: false, reason: "INVALID" };
    if (data.action && data.action !== expectedAction) {
      return { ok: false, reason: "INVALID" };
    }
    const score = typeof data.score === "number" ? data.score : 0;
    if (score < MIN_SCORE) return { ok: false, reason: "LOW_SCORE", score };

    return { ok: true, score, mode: "REAL" };
  } catch (err) {
    console.error("[recaptcha] verify error:", err);
    return { ok: false, reason: "INVALID" };
  }
}
