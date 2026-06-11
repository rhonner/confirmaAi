# Feature: Billing (Subscription model)

> **Em construção.** Sprint 1 entregou apenas o modelo `Subscription` + enums e o backfill (todo User existente vira `FREE`/`ACTIVE`). Sprints futuros (2-5) entregam quota de pacientes, entitlements, gateway Asaas e UX.

## Status atual (Sprint 5)

| Componente                | Estado    |
| ------------------------- | --------- |
| Schema `Subscription` + enums | ✅ Sprint 1 |
| Backfill FREE/ACTIVE + trigger no signup | ✅ Sprint 1 |
| `plans.ts` (R$ 0/65/110, limites, features) | ✅ Sprint 2 |
| `entitlements.ts` + `quota.ts` | ✅ Sprint 2 — ver [`plan-quota.md`](plan-quota.md) |
| `GET /api/billing/subscription` + hooks | ✅ Sprint 2 |
| `<UsageBadge>` + `<PaywallModal>` + `<PlanCard>` + `<QuotaBanner>` | ✅ Sprint 3 |
| Páginas `/billing` + `/precos` | ✅ Sprint 3 |
| **`BillingProvider` interface + `MockProvider` + `AsaasProvider`** | ✅ Sprint 5 |
| **`POST /api/billing/checkout` (PIX + cartão)** | ✅ Sprint 5 |
| **`POST /api/billing/webhook` (HMAC + idempotência via `BillingEvent.providerEventId @unique`)** | ✅ Sprint 5 |
| **`POST /api/billing/portal` + `POST /api/billing/cancel`** | ✅ Sprint 5 |
| **Páginas `/billing/checkout` + `/billing/sucesso`** | ✅ Sprint 5 |
| **Lifecycle states + cron diário (`runBillingMaintenance`)** | ✅ Sprint 5 |
| **`POST /api/billing/mock-trigger` (dev-only)** | ✅ Sprint 5 |
| **`UsageCounter` operacional (`usage.ts`) + gate `message.send` no scheduler + badge msgs** | ✅ Sprint 6 — ver [`scheduler.md`](scheduler.md) |

## Fluxo de cobrança (Sprint 5)

### Provider abstraction

`src/lib/billing/provider.ts` define `BillingProviderImpl` — interface com `createCustomer`, `createCheckout`, `createPortalSession`, `verifyWebhookSignature`, `parseEvent`.

Implementações:
- **`MockProvider`** (`src/lib/billing/mock.ts`) — gera QR Pix fake, HMAC com pepper local. Default em `NODE_ENV != production`.
- **`AsaasProvider`** (`src/lib/billing/asaas.ts`) — Brasil-first, integra com `/api/v3/customers`, `/subscriptions`, `/payments/{id}/pixQrCode`. Ativado via `BILLING_PROVIDER=ASAAS` ou `NODE_ENV=production`.

Fábrica em `factory.ts` lê `BILLING_PROVIDER` env (`ASAAS` | `MOCK`) com fallback por `NODE_ENV`.

### Checkout

1. `POST /api/billing/checkout { plan, method }` (autenticado).
2. Cria `customer` no provider (1ª vez) ou reusa `Subscription.providerCustomerId`.
3. Provider cria assinatura recorrente; para Pix, busca QR code da primeira fatura.
4. Persiste `providerCustomerId` + `providerSubscriptionId` em `Subscription` (status NÃO muda — só após webhook).
5. Audit `billing.checkout.created`.
6. Retorna `{ sessionId, qrCodeBase64?, qrCodePayload?, paymentUrl?, expiresAt }`.

UI: `src/app/(dashboard)/billing/checkout/page.tsx` mostra QR + botão "Copiar código" + (em dev) "Simular pagamento". Polling em `useSubscription` redireciona pra `/billing/sucesso` quando vira ACTIVE.

### Webhook

`POST /api/billing/webhook` (público — recebe do provider):

1. **HMAC** via `provider.verifyWebhookSignature(rawBody, signature)`. Inválido → 401 + audit `billing.webhook.invalid_signature`.
2. **Idempotência**: `BillingEvent.create({ providerEventId })`. P2002 → no-op idempotente, retorna 200.
3. Resolve `userId` via `providerSubscriptionId` ou `providerCustomerId`.
4. Aplica `eventToSubscriptionPatch(event)` em `Subscription`:
   - `PAYMENT_RECEIVED|CONFIRMED` → `status=ACTIVE`, `currentPeriodEnd = nextDueDate`.
   - `PAYMENT_OVERDUE` → `status=PAST_DUE`.
   - `SUBSCRIPTION_DELETED|CANCELLED` → `status=CANCELED`, `cancelAtPeriodEnd=true`.
5. Se evento é PAYMENT e `payload.subscription.externalReference = "userId:plan"`, atualiza `Subscription.plan` para o tier comprado.
6. Audit `billing.payment.received` / `failed` / `subscription.canceled` / `billing.webhook.processed`.
7. Marca `BillingEvent.processedAt = now`. Falhas mantêm `processedAt = null` para reconciliação manual.

**Sempre 200 após registrar** (provider retentaria em 5xx). Falhas no apply ficam pra reconciliação.

### Lifecycle (cron diário — defesa em profundidade)

`runBillingMaintenance()` em `src/lib/services/billing-maintenance.ts`, chamado pelo `runSchedulerJobs()` (mesmo cron `/api/cron/run`):

- **`PAST_DUE` + `updatedAt < now() - 7d`** → `status=SUSPENDED` + audit `subscription.suspended`.
- **`CANCELED` + `currentPeriodEnd < now`** → downgrade para `plan=FREE, status=ACTIVE`, limpa providerIds + audit `subscription.downgraded`.

Defende contra webhooks perdidos / atrasados.

### Mock trigger (dev-only)

`POST /api/billing/mock-trigger { event }` (NODE_ENV != production):

- Resolve `Subscription` do user logado.
- Monta payload Asaas-shaped (`PAYMENT_RECEIVED` por default).
- Assina com HMAC do `MockProvider`.
- Faz fetch interno em `/api/billing/webhook` simulando provider real.

Permite exercitar todo o lifecycle sem chave Asaas.

### Validação manual no browser (Sprint 5)

Confirmado em 2026-05-07 via Chrome MCP, fluxo end-to-end:

1. ✅ `toggle-admin-plan.ts FREE` + login → header "5/5 pacientes" vermelho, banner em `/pacientes`.
2. ✅ `/billing` mostra "Faça upgrade" com 3 cards.
3. ✅ Click "Assinar Pro" → `/billing/checkout?plan=PRO` com seletor Pix/Cartão.
4. ✅ Click "Continuar com Pix" → QR code mock + "Copiar código" + aviso `[DEV] MockProvider` + botão "Simular pagamento recebido".
5. ✅ Click "Simular pagamento" → toast "Pagamento simulado processado" → polling detecta ACTIVE → redirect `/billing/sucesso` "Pagamento confirmado! Bem-vindo(a) ao plano Pro".
6. ✅ Header badge muda de "5/5" pra "Pro" pill.
7. ✅ `/billing` mostra "Plano atual: Pro / ACTIVE / Ilimitado / Próxima cobrança em 05/06/2026".
8. ✅ "Cancelar assinatura" → AlertDialog → confirma → toast verde + texto laranja "Assinatura cancelada. Você mantém o acesso até 05/06/2026" + botão "Cancelar" some.

## Rodando local: Mock vs Sandbox vs Produção

> Como apontar o `npm run dev` local para cada ambiente de cobrança. O seletor é o `factory.ts`: lê `BILLING_PROVIDER` (`ASAAS` | `MOCK`) com fallback por `NODE_ENV` (dev → Mock, production → Asaas).

### Matriz de configuração (`.env` local)

| Modo | `BILLING_PROVIDER` | `ASAAS_API_URL` | `ASAAS_API_KEY` | Webhook |
| ---- | ------------------ | ---------------- | ---------------- | ------- |
| **Mock** (default dev) | *(ausente/comentado)* | — | — | `POST /api/billing/mock-trigger` simula tudo |
| **Sandbox** | `ASAAS` | `https://sandbox.asaas.com/api/v3` | chave `$aact_hmlg_...` (já no `.env`, gerada 2026-06-10) | precisa de túnel público (ver abaixo) |
| **Produção** ⚠️ | `ASAAS` | `https://www.asaas.com/api/v3` | chave prod (na Vercel; NÃO copiar pro `.env` sem necessidade real) | já aponta pra Vercel — local NÃO recebe eventos |

### ⚠️ Gotcha das aspas (vale pra qualquer chave Asaas no `.env`)

Chaves Asaas começam com `$aact_`. O Next carrega `.env` com **dotenv-expand**, que trata `$aact...` como variável indefinida → valor vira **string vazia silenciosamente**. Sempre:

```bash
ASAAS_API_KEY='$aact_hmlg_...'   # aspas SIMPLES, obrigatório
```

(Scripts `tsx` com `dotenv` puro também leem certo com aspas simples.)

### Modo Mock (dia-a-dia)

1. `.env` sem `BILLING_PROVIDER` → `MockProvider` ativo.
2. Fluxo: `/billing/checkout` → QR fake → botão "[DEV] Simular pagamento recebido" (ou `POST /api/billing/mock-trigger { event }`) → webhook interno com HMAC mock → subscription ativa.
3. Não toca rede externa. É o modo dos testes `test:sprints`.

### Modo Sandbox (testar AsaasProvider real)

1. No `.env`, descomente `BILLING_PROVIDER=ASAAS` (as outras 2 vars já estão lá).
2. Reinicie o dev server (env só carrega no boot).
3. Checkout cria **customer/assinatura reais na sandbox** — confira em `sandbox.asaas.com` → Cobranças. Pagamento Pix sandbox é simulável pelo próprio painel.
4. **Webhook**: o retorno (`PAYMENT_RECEIVED` → ativar subscription) só chega se a sandbox alcançar seu localhost:
   ```bash
   cloudflared tunnel --url http://localhost:3000   # gera https://<aleatorio>.trycloudflare.com
   ```
   Depois cadastre em `sandbox.asaas.com` → Integrações → Webhooks: URL `https://<tunel>/api/billing/webhook`, token = o MESMO valor de `ASAAS_WEBHOOK_SECRET` do seu `.env` local, v3, sequencial + fila. Sem túnel, o pagamento sandbox acontece mas a subscription local não ativa (alternativa: simular a ativação via `mock-trigger`... não — ele assina com HMAC do Mock; com `BILLING_PROVIDER=ASAAS` a verificação rejeita. Use o túnel.)
5. **Reverter ao fim**: re-comentar `BILLING_PROVIDER` e reiniciar.

### Modo Produção a partir do local (raro — use com medo)

Cenário legítimo: debugar um problema de billing de prod sem fazer deploy.

1. Copie a chave prod TEMPORARIAMENTE: `npx vercel env pull --environment=production /tmp/prod.env` e exporte só a var necessária na sessão do shell (não grave no `.env`).
2. **Riscos reais**: customers/assinaturas/cobranças criados são REAIS (dinheiro de verdade); se o `DATABASE_URL` local apontar pro banco local, os IDs Asaas criados ficam órfãos do banco de prod.
3. O webhook de prod aponta pra `clinicaorganizada.com` — seu local **nunca** recebe os eventos; ativações dependeriam do cron de reconciliação de prod.
4. Regra prática: leitura/debug ok; **não criar checkout** apontando pra prod a partir do local. Pra testar cobrança real, use a própria produção com um Pix de R$ 1 e estorne.

### Pareamento banco × provider (não misturar)

| App local apontando pra | `DATABASE_URL` local deve ser | Por quê |
| ----------------------- | ----------------------------- | ------- |
| Mock / Sandbox | Postgres local (Docker `confirmaai-pg`) | dados de teste isolados |
| Produção (leitura/debug) | Neon prod **direta** (via env da sessão, nunca `.env`) | senão IDs Asaas e Subscriptions divergem entre bancos |

## Configuração de produção (Asaas)

Vars de env (Vercel):

```
BILLING_PROVIDER=ASAAS
ASAAS_API_URL=https://www.asaas.com/api/v3
ASAAS_API_KEY=...
ASAAS_WEBHOOK_SECRET=...
ASAAS_PRO_PLAN_ID=...      # opcional, ainda não usado
ASAAS_PREMIUM_PLAN_ID=...
```

Painel Asaas: configurar webhook URL `https://clinicaorganizada.com/api/billing/webhook` com header `asaas-access-token: <ASAAS_WEBHOOK_SECRET>`.

NF-e: ativar no painel Asaas — emitida automaticamente em cada `PAYMENT_RECEIVED`.

## Plano consolidado

Ver [`../plans/monetization-v2.md`](../plans/monetization-v2.md) — fonte de verdade do roadmap. Este arquivo será expandido a cada sprint.

## Modelos atuais

```prisma
model Subscription {
  id                     String             @id @default(cuid())
  userId                 String             @unique  // 1:1 com User
  plan                   PlanTier           @default(FREE)
  status                 SubscriptionStatus @default(ACTIVE)
  currentPeriodStart     DateTime           @default(now())
  currentPeriodEnd       DateTime?          // null para FREE
  cancelAtPeriodEnd      Boolean            @default(false)
  provider               BillingProvider?
  providerCustomerId     String?
  providerSubscriptionId String?            @unique
  adminOverrideUntil     DateTime?
  adminOverrideReason    String?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
}

enum PlanTier { FREE PRO PREMIUM }
enum SubscriptionStatus { ACTIVE PAST_DUE CANCELED SUSPENDED }
enum BillingProvider { ASAAS STRIPE PAGARME }
```

## Convenções fixadas

- **1 user = 1 subscription**. Multi-clínica por user fica para um `Workspace` futuro (não MVP).
- **FREE não tem `currentPeriodEnd`** (não tem ciclo de cobrança).
- **Sem `expiresAt` separado** — usar `currentPeriodEnd` + `status`.
- **Toda mutação em `Subscription` é auditada** automaticamente pela Prisma extension (modelo está em `AUDITED_MODELS`).

## Como estender (Sprint 2+)

Ver checklist completo em `../plans/monetization-v2.md` Sprint 2: criar `src/lib/billing/plans.ts`, `entitlements.ts`, `quota.ts`. Adicionar `PatientQuotaSlot`, alterações em `Patient`/`User`. Aplicar gates nas rotas mutadoras.
