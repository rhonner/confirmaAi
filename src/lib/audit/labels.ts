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
  "auth.password_reset_failed": "Falha ao redefinir senha",
  "auth.login.rate_limited": "Login bloqueado por excesso de tentativas",
  "auth.email_verified": "Email confirmado",
  "auth.email_verify_failed": "Falha ao confirmar email",

  // Domain entities (Prisma extension)
  "user.create": "Conta criada",
  "user.delete": "Conta removida",
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
  "whatsapp.disconnected_with_pending": "WhatsApp desconectado (com agendamentos pendentes)",
  "whatsapp.qrcode_requested": "QR code solicitado",
  "whatsapp.connect_failed": "Falha ao conectar WhatsApp",
  "evolution.health_failed": "Health-check do WhatsApp (Evolution) falhou",

  // Mensageria automática
  "cron.run": "Execução do agendador (cron)",
  "message.sent": "Mensagem enviada",
  "message.send_failed": "Falha no envio de mensagem",
  "appointment.confirmed_by_patient": "Paciente confirmou o agendamento",
  "appointment.canceled_by_patient": "Paciente cancelou o agendamento",
  "appointment.auto_canceled": "Cancelado automaticamente (sem confirmação até o prazo)",

  // Billing
  "subscription.created": "Assinatura criada",
  // Mutações auto-auditadas pela extensão Prisma (modelo Subscription)
  "subscription.create": "Assinatura registrada",
  "subscription.update": "Assinatura atualizada",
  "subscription.upsert": "Assinatura atualizada",
  "subscription.delete": "Assinatura removida",
  "subscription.upgraded": "Plano alterado para superior",
  "subscription.downgraded": "Plano alterado para inferior",
  "subscription.canceled": "Assinatura cancelada",
  "subscription.reactivated": "Assinatura reativada",
  "subscription.suspended": "Assinatura suspensa",
  "subscription.past_due": "Pagamento em atraso",
  "subscription.backfill": "Assinatura criada por migração",
  "billing.checkout.created": "Checkout iniciado",
  "billing.checkout.completed": "Checkout concluído",
  "billing.checkout.cpf_added": "CPF adicionado no checkout",
  "billing.subscription.replaced": "Assinatura pendente substituída",
  "billing.subscription.orphan_cancel_failed": "Falha ao cancelar assinatura órfã",
  "billing.webhook.stale_ignored": "Webhook de assinatura antiga ignorado",
  "account.reset": "Conta Free resetada",
  "account.reset_blocked": "Reset de conta bloqueado",
  "account.deleted": "Conta excluída (soft delete)",
  "account.purged": "Dados de pacientes da conta excluída foram apagados (purga 30d)",
  "account.exported": "Dados da conta exportados (LGPD)",
  "billing.dunning.sent": "Email de cobrança (dunning) enviado",
  "billing.usage.threshold_notified": "Aviso de uso próximo do limite enviado",
  "billing.checkout.qr_refreshed": "QR Pix do checkout regenerado",
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

  // Google Calendar
  "gcal.connected": "Google Agenda conectada",
  "gcal.disconnected": "Google Agenda desconectada",
  "gcal.promoted": "Evento do Google promovido a agendamento",
  "gcal.pushed": "Agendamento espelhado no Google Agenda",
};

export function actionLabel(action: string): string {
  return LABELS[action] ?? action;
}

export function knownActions(): readonly string[] {
  return Object.keys(LABELS);
}
