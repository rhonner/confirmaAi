/**
 * Envio de email transacional via Resend (HTTP puro, sem SDK).
 *
 * Em **dev sem RESEND_API_KEY**, loga o conteúdo no console e retorna
 * `mode: "DEV_LOGGED"` (suficiente pra validar fluxos localmente). Em
 * **produção sem RESEND_API_KEY**, falha com `MISCONFIGURED` — o caller
 * decide se o fluxo aborta ou segue.
 */

export type EmailSendResult =
  | { ok: true; mode: "REAL" | "DEV_LOGGED" }
  | { ok: false; reason: "MISCONFIGURED" | "PROVIDER_ERROR"; detail?: string };

const FROM = "Clínica Organizada <noreply@clinicaorganizada.com>";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "MISCONFIGURED" };
    }
    console.info(
      `[email] RESEND_API_KEY ausente — email para ${input.to} (${input.subject}) logado em vez de enviado.`,
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
        from: FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
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

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
