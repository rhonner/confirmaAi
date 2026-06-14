import { escapeHtml } from "@/lib/email";

/**
 * Shell HTML de emails transacionais (Sprint 10 / fatia 2).
 *
 * Layout único e branded reutilizado por todos os emails (reset de senha,
 * boas-vindas, pagamento, cancelamento, dunning). `bodyHtml` é HTML já seguro
 * — o CALLER escapa dados do usuário (use `escapeHtml`). `cta.label` é
 * escapado aqui por garantia.
 *
 * HTML inline (sem CSS externo) porque clientes de email ignoram <style>/classes.
 */
const BRAND = "Clínica Organizada";
const PRIMARY = "#0d9488"; // teal — alinhado à UI do app
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clinicaorganizada.com";

export function renderEmailLayout(opts: {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${opts.cta.url}" style="background:${PRIMARY};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">${escapeHtml(opts.cta.label)}</a>
       </td></tr>`
    : "";
  const footnote = opts.footnote
    ? `<p style="color:#6b7280;font-size:13px;line-height:1.5;margin:20px 0 0;">${opts.footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:${PRIMARY};padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">${BRAND}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${escapeHtml(opts.heading)}</h1>
          <div style="color:#374151;font-size:15px;line-height:1.6;">${opts.bodyHtml}</div>
          <table role="presentation" cellpadding="0" cellspacing="0"><tbody>${cta}</tbody></table>
          ${footnote}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f3f4f6;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">${BRAND} · <a href="${APP_URL}" style="color:#9ca3af;">clinicaorganizada.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
