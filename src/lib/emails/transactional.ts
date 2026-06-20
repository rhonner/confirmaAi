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

// ---- Dunning (cobrança em atraso — dias 1/3/7, Sprint 10/fatia 2.3) ----
type DunningStage = "DAY_1" | "DAY_3" | "DAY_7";

export function buildDunningEmail(input: {
  name: string;
  planLabel: string;
  stage: DunningStage;
  suspendsInDays: number;
}): Built {
  const name = escapeHtml(input.name);
  const plan = escapeHtml(input.planLabel);
  if (input.stage === "DAY_1") {
    return {
      subject: "Não conseguimos confirmar seu pagamento — Clínica Organizada",
      html: renderEmailLayout({
        heading: "Pagamento pendente",
        bodyHtml: `<p>Olá ${name},</p>
          <p>Não conseguimos confirmar o pagamento da sua assinatura <strong>${plan}</strong>. Pode ter sido um problema temporário com o cartão ou o Pix.</p>
          <p>Para manter seu acesso ativo, é só regularizar o pagamento.</p>`,
        cta: { label: "Regularizar pagamento", url: `${APP_URL}/billing` },
        footnote: "Se você já pagou, pode ignorar este aviso.",
      }),
    };
  }
  if (input.stage === "DAY_3") {
    return {
      subject: "Pagamento ainda pendente — atualize sua forma de pagamento",
      html: renderEmailLayout({
        heading: "Seu pagamento continua pendente",
        bodyHtml: `<p>Olá ${name},</p>
          <p>Ainda não recebemos o pagamento da sua assinatura <strong>${plan}</strong>. Para não perder o acesso, atualize sua forma de pagamento ou refaça o Pix.</p>`,
        cta: { label: "Atualizar pagamento", url: `${APP_URL}/billing` },
        footnote: "Precisa de ajuda? É só responder este email.",
      }),
    };
  }
  // DAY_7 — aviso de suspensão iminente
  const when =
    input.suspendsInDays <= 0 ? "hoje" : input.suspendsInDays === 1 ? "amanhã" : `em ${input.suspendsInDays} dias`;
  return {
    subject: "⚠️ Sua conta será suspensa — regularize o pagamento",
    html: renderEmailLayout({
      heading: "Sua conta será suspensa",
      bodyHtml: `<p>Olá ${name},</p>
        <p>O pagamento da sua assinatura <strong>${plan}</strong> segue pendente. Para evitar a <strong>suspensão da sua conta (${when})</strong>, regularize agora — depois disso as confirmações automáticas param.</p>`,
      cta: { label: "Regularizar agora", url: `${APP_URL}/billing` },
      footnote: "Assim que o pagamento for confirmado, seu acesso volta automaticamente.",
    }),
  };
}

export async function sendDunningEmail(input: {
  to: string;
  name: string;
  planLabel: string;
  stage: DunningStage;
  suspendsInDays: number;
}): Promise<EmailSendResult> {
  const { subject, html } = buildDunningEmail(input);
  return sendEmail({ to: input.to, subject, html });
}

// ---- Perto do limite de mensagens (80% / 100%, Sprint 10/fatia 2.3) ----
export function buildUsageLimitEmail(input: {
  name: string;
  threshold: 80 | 100;
  messagesSent: number;
  messagesIncluded: number;
}): Built {
  const name = escapeHtml(input.name);
  const usage = `${input.messagesSent} de ${input.messagesIncluded}`;
  if (input.threshold >= 100) {
    return {
      subject: "Você atingiu o limite de mensagens do seu plano",
      html: renderEmailLayout({
        heading: "Limite de mensagens atingido",
        bodyHtml: `<p>Olá ${name},</p>
          <p>Você usou <strong>${usage}</strong> mensagens do seu plano neste período. Novas confirmações automáticas ficam pausadas até a virada do período ou um upgrade de plano.</p>`,
        cta: { label: "Ver planos", url: `${APP_URL}/billing` },
        footnote: "Faça upgrade para continuar enviando confirmações sem interrupção.",
      }),
    };
  }
  return {
    subject: "Você está perto do limite de mensagens",
    html: renderEmailLayout({
      heading: "Você está perto do limite",
      bodyHtml: `<p>Olá ${name},</p>
        <p>Você já usou <strong>${usage}</strong> mensagens do seu plano neste período. Ao atingir o limite, as confirmações automáticas pausam até a virada do período.</p>`,
      cta: { label: "Ver meu plano", url: `${APP_URL}/billing` },
      footnote: "Considere um upgrade se costuma enviar muitas confirmações.",
    }),
  };
}

export async function sendUsageLimitEmail(input: {
  to: string;
  name: string;
  threshold: 80 | 100;
  messagesSent: number;
  messagesIncluded: number;
}): Promise<EmailSendResult> {
  const { subject, html } = buildUsageLimitEmail(input);
  return sendEmail({ to: input.to, subject, html });
}
