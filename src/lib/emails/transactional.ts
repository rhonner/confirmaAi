import { sendEmail, escapeHtml, type EmailSendResult } from "@/lib/email";
import { renderEmailLayout } from "@/lib/emails/layout";

/**
 * Emails transacionais event-driven (Sprint 10 / fatia 2.2). Cada um dispara
 * uma única vez no evento correspondente (ativação, pagamento, cancelamento) —
 * sem necessidade de dedup. Reusa `renderEmailLayout`.
 *
 * `build*` são PUROS (retornam { subject, html }) → testáveis sem IO.
 * `send*` constroem e despacham via `sendEmail`.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clinicaorganizada.com";

type Built = { subject: string; html: string };

// ---- Boas-vindas (pós verificação de email) ----
export function buildWelcomeEmail(input: { name: string }): Built {
  return {
    subject: "Bem-vindo(a) à Clínica Organizada 🎉",
    html: renderEmailLayout({
      // nome cru no heading — renderEmailLayout já escapa o heading (escapar
      // aqui causaria double-escape: &amp;lt; em vez de &lt;).
      heading: `Bem-vindo(a), ${input.name}!`,
      bodyHtml: `<p>Sua conta está ativa. A partir de agora você pode cadastrar pacientes e deixar as confirmações de consulta no automático pelo WhatsApp.</p>
        <p>Para começar: conecte seu WhatsApp em <strong>Configurações</strong> e cadastre seu primeiro paciente.</p>`,
      cta: { label: "Ir para o painel", url: `${APP_URL}/dashboard` },
      footnote: "Qualquer dúvida, é só responder este email.",
    }),
  };
}

export async function sendWelcomeEmail(input: { to: string; name: string }): Promise<EmailSendResult> {
  const { subject, html } = buildWelcomeEmail({ name: input.name });
  return sendEmail({ to: input.to, subject, html });
}

// ---- Pagamento confirmado ----
export function buildPaymentConfirmedEmail(input: {
  name: string;
  planLabel: string;
  periodEndLabel?: string;
}): Built {
  const renewal = input.periodEndLabel
    ? `<p>Próxima cobrança em <strong>${escapeHtml(input.periodEndLabel)}</strong>.</p>`
    : "";
  return {
    subject: "Pagamento confirmado — Clínica Organizada",
    html: renderEmailLayout({
      heading: "Pagamento confirmado ✅",
      bodyHtml: `<p>Olá ${escapeHtml(input.name)},</p>
        <p>Recebemos seu pagamento e seu plano <strong>${escapeHtml(input.planLabel)}</strong> está ativo.</p>
        ${renewal}`,
      cta: { label: "Ver meu plano", url: `${APP_URL}/billing` },
      footnote: "Obrigado por usar a Clínica Organizada.",
    }),
  };
}

export async function sendPaymentConfirmedEmail(input: {
  to: string;
  name: string;
  planLabel: string;
  periodEndLabel?: string;
}): Promise<EmailSendResult> {
  const { subject, html } = buildPaymentConfirmedEmail(input);
  return sendEmail({ to: input.to, subject, html });
}

// ---- Cancelamento ----
export function buildSubscriptionCanceledEmail(input: {
  name: string;
  accessUntilLabel?: string;
}): Built {
  const until = input.accessUntilLabel
    ? `<p>Você mantém o acesso ao plano pago até <strong>${escapeHtml(input.accessUntilLabel)}</strong>. Depois disso a conta volta ao plano Free.</p>`
    : `<p>Sua conta voltará ao plano Free no fim do ciclo atual.</p>`;
  return {
    subject: "Assinatura cancelada — Clínica Organizada",
    html: renderEmailLayout({
      heading: "Assinatura cancelada",
      bodyHtml: `<p>Olá ${escapeHtml(input.name)},</p>
        <p>Confirmamos o cancelamento da sua assinatura. ${until}</p>
        <p>Mudou de ideia? Você pode reativar quando quiser.</p>`,
      cta: { label: "Reativar plano", url: `${APP_URL}/billing` },
      footnote: "Sentiremos sua falta — e a porta fica aberta.",
    }),
  };
}

export async function sendSubscriptionCanceledEmail(input: {
  to: string;
  name: string;
  accessUntilLabel?: string;
}): Promise<EmailSendResult> {
  const { subject, html } = buildSubscriptionCanceledEmail(input);
  return sendEmail({ to: input.to, subject, html });
}
