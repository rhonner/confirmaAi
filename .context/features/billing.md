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
     **⚠️ Shape real do Asaas (fix 2026-06-13)**: o payload de eventos `PAYMENT_*` NÃO traz `nextDueDate` no objeto `payment` (o campo vive na subscription, que não vem no webhook). Sem fallback, `currentPeriodEnd` ficava null → cancelamento nunca expiraria no cron (`CANCELED + currentPeriodEnd < now`). `deriveNextDueDate` em `asaas.ts` usa `payment.dueDate + 1 mês` como fallback. Regressão em `tests/unit/billing-provider.test.ts` com payload real capturado da sandbox.
   - `PAYMENT_OVERDUE` → `status=PAST_DUE`.
   - `SUBSCRIPTION_DELETED|CANCELLED` → `status=CANCELED`, `cancelAtPeriodEnd=true`.
5. Se evento é PAYMENT e `payload.subscription.externalReference = "userId:plan"`, atualiza `Subscription.plan` para o tier comprado.
6. Audit `billing.payment.received` / `failed` / `subscription.canceled` / `billing.webhook.processed`.
7. Marca `BillingEvent.processedAt = now`. Falhas mantêm `processedAt = null` para reconciliação manual.

**Sempre 200 após registrar** (provider retentaria em 5xx). Falhas no apply ficam pra reconciliação — e a partir da Sprint 9 não são silenciosas: o catch chama `captureError({ area: "webhook", tenantUserId })` (cliente pagou e plano não subiu = alerta de receita), e `GET /api/health` acende `billing: degraded` (503) se algum `BillingEvent.processedAt = null` passar de 1h. Ver [`observability.md`](observability.md).

> **Emails transacionais (Sprint 10/fatia 2.2)**: no branch `PAYMENT_RECEIVED` (status→ACTIVE) o webhook dispara `sendPaymentConfirmedEmail` em **try/catch ISOLADO** — falha de email NÃO pode cair no catch externo (senão marcaria `apply_failed`/`processedAt=null` e o /api/health acharia o webhook travado). Cancelamento via `/api/billing/cancel` dispara `sendSubscriptionCanceledEmail` (best-effort). Senders em `src/lib/emails/transactional.ts`.

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

### Validação manual no browser (Sandbox Asaas, 2026-06-13)

Ciclo completo validado em dev contra a sandbox real, via Chrome MCP:

1. ✅ `BILLING_PROVIDER=ASAAS` no `.env` + `./scripts/dev-tunnel.sh` (webhook registrado automaticamente na sandbox, túnel trycloudflare).
2. ✅ Seed user em FREE → `/billing/checkout?plan=PRO` → "Continuar com Pix" → **QR Pix real da sandbox** renderizado, SEM aviso "[DEV] MockProvider" (gate por `provider` na resposta).
3. ✅ Pagamento confirmado via `receiveInCash` na API sandbox → webhook `PAYMENT_RECEIVED` chegou pelo túnel → HMAC ok → idempotência ok → plano **PRO/ACTIVE** com `currentPeriodEnd = dueDate+1mês` → polling redirecionou pra `/billing/sucesso` ("Pagamento confirmado! Bem-vindo(a) ao plano Pro") → badge "Pro" no header.
4. ✅ Webhook sem token pelo túnel → 401 (gate HMAC).
5. ✅ Pagamento de assinatura órfã → `BillingEvent` com `userId null`, sem patch (reconciliação).

Bugs reais achados e corrigidos neste setup: (a) `$aact_` zerado pelo loader do Next mesmo com aspas simples → escape `\$`; (b) `currentPeriodEnd` null por `nextDueDate` ausente no payment → `deriveNextDueDate`; (c) aviso MockProvider em modo sandbox → gate por `provider`.

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
>
> **🥇 DECISÃO 2026-06-13 (prioridade nº 1 do roadmap — IMPLEMENTADA)**: o modo recomendado para teste manual de billing em dev é **SANDBOX**, não Mock. O go-live provou que Mock passa em tudo e a API real revela bugs de shape (5 achados em 1 dia; +2 no próprio setup do sandbox, ver "Validação manual" abaixo). Mock fica para: trabalho offline, `test:sprints`/vitest (importam `MockProvider` direto, independem da env) e o botão "Simular pagamento" (`mock-trigger`, que só funciona em modo Mock). O `.env` local já fica com `BILLING_PROVIDER=ASAAS` por padrão.

### Matriz de configuração (`.env` local)

| Modo | `BILLING_PROVIDER` | `ASAAS_API_URL` | `ASAAS_API_KEY` | Webhook |
| ---- | ------------------ | ---------------- | ---------------- | ------- |
| **Sandbox** (recomendado p/ teste manual — default atual) | `ASAAS` | `https://sandbox.asaas.com/api/v3` | chave `$aact_hmlg_...` (no `.env`, gerada 2026-06-10) | `./scripts/dev-tunnel.sh` (cloudflared + registro automático) |
| **Mock** (offline/CI/mock-trigger) | comentar a linha + reiniciar dev | — | — | `POST /api/billing/mock-trigger` simula tudo |
| **Produção** ⚠️ | `ASAAS` | `https://www.asaas.com/api/v3` | chave prod (na Vercel; NÃO copiar pro `.env` sem necessidade real) | já aponta pra Vercel — local NÃO recebe eventos |

### ⚠️ Gotcha do `$` no `.env` (CORRIGIDO 2026-06-13 — aspas simples NÃO bastam)

Chaves Asaas começam com `$aact_`. O loader do Next (`@next/env` com dotenv-expand) expande `$aact...` como variável indefinida → valor vira **string vazia silenciosamente** — **MESMO entre aspas simples** (validado empiricamente no Next 16.1.6; a crença anterior de que aspas simples protegiam valia só pra `tsx`/dotenv puro, nunca foi testada no runtime do Next). O único escape que funciona no Next:

```bash
ASAAS_API_KEY='\$aact_hmlg_...'   # barra invertida antes do $, obrigatório
```

Consumidores fora do Next precisam remover a `\` ao ler (o `dev-tunnel.sh` já faz; sintoma do erro: `Error: ASAAS_API_KEY ausente` no checkout).

### Modo Mock (offline/CI)

1. `.env` com `BILLING_PROVIDER` comentado → `MockProvider` ativo.
2. Fluxo: `/billing/checkout` → QR fake → botão "[DEV] Simular pagamento recebido" (ou `POST /api/billing/mock-trigger { event }`) → webhook interno com HMAC mock → subscription ativa.
3. Não toca rede externa. É o modo dos testes `test:sprints`.
4. O botão "Simular pagamento" só aparece quando o checkout veio do Mock — a resposta de `POST /api/billing/checkout` inclui `provider` e a UI gateia nisso (fix 2026-06-13; antes usava `NODE_ENV` e mostrava o botão mesmo em modo sandbox, onde ele falharia no HMAC).

### Modo Sandbox (recomendado p/ teste manual)

1. `.env` já tem `BILLING_PROVIDER=ASAAS` + `ASAAS_WEBHOOK_SECRET` local (token gerado 2026-06-13). Dev server rodando.
2. Em outro terminal: **`./scripts/dev-tunnel.sh`** — sobe cloudflared, captura a URL trycloudflare e **registra/atualiza o webhook "confirmaai-dev-tunnel" na sandbox via API** (token = `ASAAS_WEBHOOK_SECRET`, eventos de Cobranças, v3, sequencial). Zero passo manual no painel. `Ctrl+C` desabilita o webhook na sandbox (evita fila pausada por entregas contra túnel morto) e derruba o túnel.
3. Checkout cria **customer/assinatura reais na sandbox** — confira em `sandbox.asaas.com` → Cobranças.
4. **"Pagar" a cobrança sandbox**: pelo painel, ou via API (mais rápido):
   ```bash
   curl -X POST -H "access_token: $ASAAS_API_KEY" -H "Content-Type: application/json" \
     "https://sandbox.asaas.com/api/v3/payments/<pay_id>/receiveInCash" \
     -d '{"paymentDate":"YYYY-MM-DD","value":65.0,"notifyCustomerByEmail":false}'
   ```
   Dispara `PAYMENT_RECEIVED` (status `RECEIVED_IN_CASH`) → túnel → webhook local → plano ativa.
5. **Setup one-time já feito (2026-06-13)**: a conta sandbox precisa de **chave Pix** cadastrada, senão o checkout falha com `pixQrCode 400 invalid_action` (mesmo bug do go-live). Criada via `POST /pix/addressKeys {"type":"EVP"}`. Se criar outra conta sandbox, repetir.
6. **Fila sequencial do webhook**: se o dev server reiniciar com o túnel ativo, entregas falham e entram em retry/backoff — eventos podem atrasar alguns minutos (cheque `enabled`/`interrupted` em `GET /webhooks`). O `dev-tunnel.sh` reativa (`enabled:true, interrupted:false`) ao subir.
7. **Pagamentos de assinaturas órfãs** (de checkouts falhos) chegam mas não resolvem `userId` (sub não persistida localmente) → `BillingEvent` fica com `userId null`, sem patch. Comportamento correto: vai pra reconciliação.
8. **Limpeza**: cancele as assinaturas de teste na sandbox ao fim (`DELETE /subscriptions/<id>`) — cada checkout cria uma nova (bug conhecido do retry, fix na Sprint 10) e elas geram cobrança mensal.
9. **CPF do usuário**: o checkout Asaas exige `User.cpf` (bug conhecido, fix Sprint 10). O seed user local já tem CPF fake válido setado (40436067293).
10. **Reverter pra Mock**: comentar `BILLING_PROVIDER` e reiniciar o dev server.

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
