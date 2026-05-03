# Roadmap: Monetização (assinaturas + uso) com Auditoria como fundação

> Plano consolidado para transformar o ConfirmaAí em SaaS pago com sistema autobloqueante por uso, **com auditoria completa desde o dia zero**. Auditoria foi promovida de "fase operacional" para **Fase 1** — implementar billing sem trilha auditável é dívida técnica imediata.

## Princípios

1. **Auditoria primeiro.** Toda ação financeira/operacional precisa de "quem fez o quê, quando, em qual entidade".
2. **Single Postgres** (sem stack separada de observability). Custo controlado para R$97/mês × N tenants pequenos.
3. **Provedor de pagamento encapsulado** atrás de interface (Stripe ↔ Asaas trocável em 1 arquivo).
4. **Bloqueio duro no MVP** (atinge limite, scheduler para). Overage só na v2.
5. **Não auditar leituras** (GETs). Volume × valor não compensa.

---

## Fase 0 — Decisões de produto

- [ ] Unidade cobrada: **mensagens WhatsApp enviadas/mês** (custo variável real).
- [ ] Estrutura de planos sugerida:
  - **Trial** 14 dias, 50 mensagens incluídas, sem cartão.
  - **Starter** R$ 97/mês, 500 mensagens, 1 número WhatsApp.
  - **Pro** R$ 197/mês, 2.000 mensagens, suporte prioritário.
- [ ] Comportamento ao limite: **bloqueio duro** (MVP). Scheduler para; UI mostra paywall.
- [ ] Provedor: **Asaas** (Brasil-first, Pix nativo, NF-e integrada) ou **Stripe** (se quiser internacionalizar).
- [ ] Dunning: 3 retries em 7 dias antes de suspender.
- [ ] Multi-WhatsApp: **não** no MVP (mantém schema 1:1 com `User.evolutionInstanceName`).
- [ ] Cancelamento: ao fim do ciclo (não imediato).

## Fase 0.5 — Decisões de auditoria

- [ ] Auditar: toda mutação (CREATE/UPDATE/DELETE) em `Patient`, `Appointment`, `Settings`, `User`, `Subscription` + eventos de domínio (LOGIN, LOGIN_FAILED, LOGOUT, WHATSAPP_CONNECTED, WHATSAPP_DISCONNECTED, MESSAGE_SENT, MESSAGE_RECEIVED, BILLING_EVENT, QUOTA_BLOCKED, PAYMENT_FAILED).
- [ ] **NÃO** auditar leituras.
- [ ] Retenção: **90 dias hot** no Postgres → `DELETE` (MVP). Arquivamento frio em R2/S3 só quando volume justificar (~10k+ tenants).
- [ ] PII/LGPD: paciente/usuário deletado → job de redaction substitui `phone`/`email` por hash, preserva metadados.
- [ ] Tamper-evidence: `AuditLog` append-only via permissão Postgres (role da app sem `UPDATE/DELETE`; só job de retenção tem). Hash-chain é overkill no MVP.
- [ ] Atores: `USER`, `SYSTEM` (cron), `WEBHOOK` (Evolution/Stripe), `ADMIN` (suporte).

---

## Fase 1 — Modelagem (audit-first)

### Modelos novos no `prisma/schema.prisma`

```prisma
enum PlanTier { TRIAL STARTER PRO }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE CANCELED SUSPENDED }
enum ActorType { USER SYSTEM WEBHOOK ADMIN }

model Subscription {
  id                     String             @id @default(cuid())
  userId                 String             @unique
  plan                   PlanTier           @default(TRIAL)
  status                 SubscriptionStatus @default(TRIALING)
  currentPeriodStart     DateTime           @default(now())
  currentPeriodEnd       DateTime
  trialEndsAt            DateTime?
  cancelAtPeriodEnd      Boolean            @default(false)
  providerCustomerId     String?
  providerSubscriptionId String?            @unique
  adminOverrideUntil     DateTime?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
  user                   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UsageCounter {
  id               String   @id @default(cuid())
  userId           String
  periodStart      DateTime
  periodEnd        DateTime
  messagesSent     Int      @default(0)
  messagesIncluded Int
  overageQty       Int      @default(0)
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, periodStart])
  @@index([userId, periodEnd])
}

model BillingEvent {
  id          String   @id @default(cuid())
  userId      String?
  provider    String   // "asaas" | "stripe"
  eventType   String
  providerEventId String @unique  // idempotência
  payload     Json
  processedAt DateTime?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
}

model AuditLog {
  id            String    @id @default(cuid())
  createdAt     DateTime  @default(now())
  actorType     ActorType
  actorId       String?
  tenantUserId  String?
  action        String    // "patient.create", "appointment.update", "auth.login.failed"
  entityType    String?
  entityId      String?
  ipAddress     String?
  userAgent     String?
  beforeJson    Json?     // só campos alterados (diff), não objeto inteiro
  afterJson     Json?
  metadata      Json?
  @@index([tenantUserId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([action, createdAt(sort: Desc)])
}
```

### Checklist

- [ ] Adicionar enums e modelos acima.
- [ ] Manter `MessageLog` e `BillingEvent` separados (event-tables de domínio). `AuditLog` é trilha cross-cutting.
- [ ] Migrate.
- [ ] Criar `src/lib/audit/context.ts` — `AsyncLocalStorage<AuditContext>` com `{ actorType, actorId, ipAddress, userAgent }`.
- [ ] Middleware Next.js popula context no início de cada request.
- [ ] Criar `src/lib/audit/prisma-extension.ts` — Prisma client extension que intercepta `create/update/delete` em modelos auditáveis e grava `AuditLog` com diff de campos alterados.
- [ ] Criar `src/lib/audit/log.ts` — `audit.log({ action, entity?, before?, after?, metadata? })` para eventos não-DB.
- [ ] Criar `src/lib/billing/plans.ts` com config (preço, includedMessages, features booleanas).
- [ ] Criar `.context/features/billing.md` e `.context/features/audit.md`. Atualizar índice do `.context/README.md`.
- [ ] Criar role Postgres `app_runtime` (sem `UPDATE/DELETE` em `AuditLog`); `app_retention` com permissão de delete só para o job.

## Fase 2 — Metering + auditoria do envio

- [ ] `src/lib/billing/usage.ts` — `incrementUsage(userId)` com `upsert` atômico em `UsageCounter` da janela atual.
- [ ] No `sendConfirmations`/`sendReminders` de `src/lib/services/scheduler.ts`, **dentro do branch de sucesso**: `MessageLog.create` (já existe) + `audit.log({ actorType: SYSTEM, action: "message.sent", entityType: "Appointment", entityId, metadata: { type, instanceName } })` + `incrementUsage(userId)`.
- [ ] No branch de **falha**: `audit.log({ action: "message.send_failed", metadata: { reason } })`. Hoje só logamos no console — corrigir.
- [ ] No webhook Evolution: `audit.log({ actorType: WEBHOOK, action: "appointment.confirmed_by_patient" | "appointment.canceled_by_patient", entityId })`.
- [ ] `GET /api/billing/usage` retorna `{ included, used, remaining, periodEndsAt }`.
- [ ] Hook `useUsage()` em `src/hooks/use-api.ts`.
- [ ] Atualizar `.context/features/scheduler.md` e `.context/features/webhook-evolution.md`.

## Fase 3 — Enforcement (auto-bloqueio) audited

- [ ] `src/lib/billing/entitlements.ts` — `canSendMessage(userId): { allowed, reason }`. Reasons: `QUOTA_EXCEEDED | TRIAL_EXPIRED | PAYMENT_PAST_DUE | SUSPENDED`.
- [ ] Gate em `scheduler.ts` antes de `sendWhatsAppMessage`. Se `!allowed`: **NÃO** marcar `confirmationSentAt` (retomamos quando reabilitar).
- [ ] Em `canSendMessage`, quando bloqueia: `audit.log({ actorType: SYSTEM, action: "billing.send_blocked", tenantUserId, metadata: { reason, plan, used, limit } })`.
- [ ] Frontend: `useEntitlements()`, `<UsageBadge>` no header, render condicional de botões.
- [ ] Página `/(dashboard)/billing` com plano atual, uso, barra, botão upgrade.
- [ ] Modal/banner de paywall.
- [ ] Atualizar `.context/flows/confirmation-flow.md` com o gate.

## Fase 4 — Provedor de pagamento

- [ ] Criar produtos/preços no painel do provedor. IDs em `src/lib/billing/plans.ts`.
- [ ] `POST /api/billing/checkout` — cria Checkout Session, retorna URL.
- [ ] `POST /api/billing/portal` — Customer Portal Session (autoatendimento).
- [ ] `POST /api/billing/webhook` — eventos:
  - `checkout.completed` → cria/atualiza `Subscription`.
  - `subscription.updated` → atualiza status, `currentPeriodEnd`, `cancelAtPeriodEnd`.
  - `subscription.deleted` → `CANCELED`.
  - `invoice.paid` → reset `UsageCounter` para novo período.
  - `invoice.payment_failed` → `PAST_DUE` + email.
- [ ] Verificar HMAC do webhook (sem isso, qualquer um forja status).
- [ ] Persistir todo evento em `BillingEvent` antes de processar (idempotência por `providerEventId`).
- [ ] **Adicional**: cada evento processado também gera `AuditLog` com `actorType: WEBHOOK`.
- [ ] HMAC inválido: `audit.log({ action: "billing.webhook_invalid_signature" })`. **Crítico** para detectar fraude.
- [ ] Encapsular provedor em `src/lib/billing/provider.ts` interface (`createCheckout`, `createPortal`, `verifyWebhook`). Trocar provedor = 1 arquivo.
- [ ] Vars de ambiente do provedor.

## Fase 5 — Lifecycle audited

- [ ] **Trial**: criado no signup com `trialEndsAt = now + 14d`, `messagesIncluded = 50`. Cron diário expira.
- [ ] **Active**: feliz.
- [ ] **Past due**: 3 retries automáticos. Banner amarelo. Scheduler ainda envia (grace 7d) — configurável.
- [ ] **Suspended**: scheduler para. UI vira paywall global exceto `/billing` e `/login`.
- [ ] **Canceled at period end**: continua até `currentPeriodEnd`.
- [ ] Job diário em `scheduler.ts` (mesmo cron) para: expirar trials, suspender past_due > 7d, resetar usage no rollover (defesa contra webhook perdido).
- [ ] Cada transição de status gera `audit.log` com `before/after` em `metadata`.
- [ ] Override admin (`adminOverrideUntil`): toda alteração manual com `actorType: ADMIN`, `actorId`, `metadata.reason` obrigatório.
- [ ] Emails (Resend ou similar): boas-vindas, trial expirando em 3d, pagamento falhou, cobrança ok, suspensão.

## Fase 6 — UX

- [ ] Header com badge de uso `247/500` colorido.
- [ ] Onboarding banner adiciona passo "Escolha seu plano" antes do trial expirar.
- [ ] `/billing`: plano + próxima cobrança + método de pagamento + tabela de uso histórico + botões "Mudar plano" / "Gerenciar pagamento" / "Cancelar".
- [ ] Modal de paywall claro: "Você usou 500/500. Faça upgrade para Pro ou aguarde X dias."
- [ ] Feature gates visuais (botão desabilitado + tooltip).
- [ ] `/precos` página pública.
- [ ] **`/configuracoes/atividade`**: histórico do próprio user via `AuditLog WHERE tenantUserId = session.user.id`. Filtros, export CSV. Argumento de venda + LGPD.
- [ ] Tradução de actions técnicas para PT humano em `src/lib/audit/labels.ts`.

## Fase 7 — Admin & operacional

- [ ] `/admin/audit` (allowlist por email): busca cross-tenant por `entityId`, `actorId`, `action`, intervalo.
- [ ] `/admin` dashboard: MRR, churn, trial→paid conversion, lista PAST_DUE.
- [ ] Alerta brute-force: `auth.login.failed` > 10 em 5min mesmo email → audit + email para o cliente.
- [ ] Métricas derivadas de AuditLog: `quota_blocked`/dia → calibrar limites de plano.
- [ ] **Retention job** (cron diário): `DELETE FROM "AuditLog" WHERE createdAt < now() - INTERVAL '90 days'`. Dump para R2/S3 desligado no MVP.
- [ ] **Redaction job** (disparado no DELETE cascade): `UPDATE` em `AuditLog` substituindo PII por hash. Único caso onde role com UPDATE é necessário.
- [ ] Modo cortesia: `Subscription.adminOverrideUntil`.

## Fase 8 — LGPD & legal

- [ ] Termos de Uso e Política de Privacidade (`/termos`, `/privacidade`). Aceite explícito no signup.
- [ ] `GET /api/account/export` retorna inclusive histórico de `AuditLog` filtrado por `tenantUserId` (portabilidade).
- [ ] `DELETE /api/account` dispara cascade + redaction. Não delete `AuditLog` (legítimo interesse), apenas hash de PII.
- [ ] Documentar política de retenção em `/privacidade`.
- [ ] NF-e: emissão automática a cada `invoice.paid` (Asaas/Pagar.me fazem nativo; Stripe + Bling/Conta Azul).
- [ ] Razão social, CNPJ, endereço no rodapé.
- [ ] Política de reembolso (7 dias por CDC).

---

## Sequência sugerida

| Semana | Entregável                                                                          |
| ------ | ----------------------------------------------------------------------------------- |
| 1      | Fase 0 + 0.5 decisões + Fase 1 modelos                                              |
| 2      | Prisma extension + AsyncLocalStorage + retrofit auditoria nas features atuais       |
| 3      | Fase 2 metering + audit + endpoint usage + UI badge                                 |
| 4      | Fase 3 enforcement + paywall                                                        |
| 5      | Fase 4 provedor + webhooks + Fase 5 lifecycle                                       |
| 6      | Fase 6 UX (`/billing`, `/atividade`) + Fase 7 admin + retention job                 |
| 7      | Fase 8 LGPD + soft launch                                                           |

---

## Riscos críticos

1. Idempotência de webhook por `providerEventId`.
2. Timezone: `currentPeriodEnd` sempre UTC.
3. Race scheduler vs webhook de pagamento — gate na entrada resolve.
4. Rollover do `UsageCounter` perdido — cron diário de defesa em profundidade.
5. Vendor lock-in — provider encapsulado.
6. Single-process scheduler — Redis lock antes de escalar (já documentado em `features/scheduler.md`).
7. **Não auditar GETs** (volume 100x writes).
8. `before/after` em `AuditLog` só com campos alterados (diff em código, não no DB).
9. `metadata` JSONB sem index salvo necessidade — index custa em writes.
10. Postgres native partitioning quando `AuditLog` > 5GB.
