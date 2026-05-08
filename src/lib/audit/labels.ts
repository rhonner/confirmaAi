/**
 * Tradução PT-BR de actions de AuditLog para exibição na UI
 * (`/configuracoes/atividade`, futuros relatórios admin).
 *
 * Convenção: `<entidade>.<verbo>` em snake_case. Use `actionLabel(action)`
 * — fallback retorna a chave original.
 */
const LABELS: Record<string, string> = {
  // Auth
  "auth.login.success": "Login realizado",
  "auth.login.failed": "Tentativa de login falhou",
  "auth.logout": "Logout",
  "auth.register": "Cadastro de conta",
  "auth.password_reset_requested": "Pedido de recuperação de senha",
  "auth.password_reset_completed": "Senha redefinida",
  "auth.login.rate_limited": "Login bloqueado por excesso de tentativas",
  "auth.email_verified": "Email confirmado",
  "auth.email_verify_failed": "Falha ao confirmar email",

  // Domain entities (Prisma extension)
  "patient.create": "Paciente criado",
  "patient.update": "Paciente atualizado",
  "patient.delete": "Paciente removido",
  "appointment.create": "Agendamento criado",
  "appointment.update": "Agendamento atualizado",
  "appointment.delete": "Agendamento removido",
  "settings.update": "Configurações alteradas",
  "user.update": "Conta atualizada",

  // WhatsApp
  "whatsapp.connected": "WhatsApp conectado",
  "whatsapp.disconnected": "WhatsApp desconectado",
  "whatsapp.qrcode_requested": "QR code solicitado",
  "whatsapp.connect_failed": "Falha ao conectar WhatsApp",

  // Mensageria automática
  "message.sent": "Mensagem enviada",
  "message.send_failed": "Falha no envio de mensagem",
  "appointment.confirmed_by_patient": "Paciente confirmou pelo WhatsApp",
  "appointment.canceled_by_patient": "Paciente cancelou pelo WhatsApp",

  // Billing
  "subscription.created": "Assinatura criada",
  "subscription.upgraded": "Plano alterado para superior",
  "subscription.downgraded": "Plano alterado para inferior",
  "subscription.canceled": "Assinatura cancelada",
  "subscription.reactivated": "Assinatura reativada",
  "subscription.suspended": "Assinatura suspensa",
  "subscription.past_due": "Pagamento em atraso",
  "subscription.backfill": "Assinatura criada por migração",
  "billing.checkout.created": "Checkout iniciado",
  "billing.checkout.completed": "Checkout concluído",
  "billing.payment.received": "Pagamento recebido",
  "billing.payment.failed": "Pagamento falhou",
  "billing.webhook.processed": "Webhook processado",
  "billing.webhook.invalid_signature": "Webhook com assinatura inválida",
  "billing.webhook.parse_failed": "Webhook com payload inválido",

  // Quota / paywall
  "quota.patient_blocked": "Cadastro de paciente bloqueado por limite do plano",
  "quota.patient_reused": "Vaga de paciente reaproveitada",
  "quota.message_blocked": "Envio de mensagem bloqueado por limite do plano",
  "quota.cpf_changed": "CPF do paciente alterado (consumiu nova vaga)",
  "quota.slot_promoted_to_cpf": "Vaga do paciente promovida de telefone para CPF",
  "patient_quota.backfill": "Vagas de paciente preenchidas por migração",
  "paywall.shown": "Paywall exibido",
  "fraud.cpf_reused_owner": "CPF do dono usado em múltiplas contas",

  // Anti-fraude / signup
  "signup.attempt": "Tentativa de cadastro",
  "signup.rate_limited": "Cadastro bloqueado por taxa",
  "signup.cpf_dedup_warning": "CPF do dono já registrado em outra conta",
  "signup.disposable_email_blocked": "Email descartável bloqueado",
  "signup.honeypot_triggered": "Cadastro bloqueado por honeypot",
  "signup.recaptcha_failed": "Cadastro bloqueado pelo reCAPTCHA",
  "signup.email_send_failed": "Falha ao enviar email de verificação no cadastro",
  "webhook.evolution.invalid_secret": "Webhook do WhatsApp com chave inválida",

  // Admin
  "admin.override_set": "Override admin aplicado",
  "admin.override_cleared": "Override admin removido",
};

export function actionLabel(action: string): string {
  return LABELS[action] ?? action;
}

export function knownActions(): readonly string[] {
  return Object.keys(LABELS);
}
