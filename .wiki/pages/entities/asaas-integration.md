---
title: Asaas — gateway de cobrança brasileiro
type: entity
created: 2026-05-07
updated: 2026-06-13
tags: [asaas, billing, pagamento, pix, brasil]
sources:
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - .context/features/billing.md
status: stable
---

> Provedor escolhido pra cobrança recorrente no ConfirmaAí. Brasil-first (Pix nativo, NF-e integrada), API REST simples, taxas competitivas (~1.99% Pix / ~3.99% cartão). Implementação em `src/lib/billing/asaas.ts` atrás da interface `BillingProviderImpl`.

## Endpoints que usamos

| Endpoint | Uso |
| -------- | --- |
| `POST /customers` | Cria customer no signup do checkout (1ª vez por User). Body: `{ name, email, cpfCnpj, externalReference: userId }` |
| `POST /subscriptions` | Cria assinatura recorrente. Body: `{ customer, billingType: PIX\|CREDIT_CARD, cycle: MONTHLY, value, nextDueDate, externalReference: "userId:plan" }` |
| `GET /subscriptions/{id}/payments` | Lista cobranças geradas (pegamos a primeira pra QR Pix) |
| `GET /payments/{id}/pixQrCode` | Retorna `{ encodedImage: base64, payload: "00020126360014..." (copia-e-cola), expirationDate }` |

**Não usamos:** Asaas tem checkout-link próprio mas pra Pix preferimos exibir QR direto na nossa UI. Pra cartão, redirecionamos pra `/c/{subscriptionId}`.

## Auth

Header `access_token: $ASAAS_API_KEY` (não Bearer). Configurar via env. Sandbox e prod usam URLs distintas — `https://sandbox.asaas.com/api/v3` vs `https://www.asaas.com/api/v3`.

## Webhooks

Asaas envia evento como POST com header `asaas-access-token: $ASAAS_WEBHOOK_SECRET`. **Não usa HMAC do body** — o secret IS a auth (timing-safe equal). Eventos relevantes: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`. Fluxo idempotente — ver [[../concepts/webhook-idempotency-via-unique-constraint]].

## Configurar webhook no painel

Em produção: configurar URL `https://clinicaorganizada.com/api/billing/webhook` com header customizado `asaas-access-token` igual ao `ASAAS_WEBHOOK_SECRET` do .env. Asaas retentará em 5xx — por isso nosso webhook **sempre retorna 200 após registrar o BillingEvent** (ver pattern relacionado).

## Não tem "Customer Portal" estilo Stripe

Asaas não oferece um portal hospedado equivalente ao da Stripe. Nossa `createPortalSession` retorna a URL pública do customer (`/c/{customerId}`) — mas funcionalidade limitada. Em produção, considerar página interna que use a API direto pra cancel/troca de método.

## NF-e e Pessoa Física (decisão 2026-06-10)

- **Asaas aceita conta PF** (CPF) — receber Pix/cartão recorrente funciona sem CNPJ. Decisão: **começar a vender como PF** pra validar; IR via carnê-leão.
- **NF-e exige CNPJ** — indisponível até abrir empresa. Ok pros primeiros clientes; gargalo pra escalar B2B (clínicas pedem nota). Quando houver CNPJ: ativar no painel (emissão automática a cada `PAYMENT_RECEIVED`), 1 config, zero código. Sprint 11 (LGPD/legal) finaliza.
- **MEI provavelmente não cobre SaaS** (CNAEs de software fora da lista) — caminho provável é ME no Simples; confirmar com contador.

## Sandbox (2026-06-10, operacional desde 2026-06-13)

- Conta sandbox criada a partir da prod (Integrações → Início → "Criar conta Sandbox"); login compartilhado, dados isolados.
- Chave `confirmaai-dev-local` no `.env` local. **Gotcha (SUPERSEDE 2026-06-13)**: chaves Asaas começam com `$aact_` — aspas simples **NÃO bastam** no runtime do Next 16 (`@next/env`/dotenv-expand expande mesmo entre aspas simples → string vazia silenciosa, sintoma `ASAAS_API_KEY ausente`). O escape obrigatório é `\$aact_...`. A claim anterior ("aspas simples obrigatórias") só valia pra `tsx`/dotenv puro e nunca tinha sido testada no Next — consumidores fora do Next agora precisam remover a `\` ao ler (o `dev-tunnel.sh` faz).
- Gerar chave exige **2FA por SMS** mesmo na sandbox (celular do dono).
- `https://sandbox.asaas.com/api/v3` — mesma API; chaves sandbox não funcionam em prod e vice-versa. Chaves sem uso por 3 meses são desabilitadas.
- **Webhook sandbox AUTOMATIZADO** (2026-06-13): `./scripts/dev-tunnel.sh` sobe cloudflared e registra/atualiza o webhook "confirmaai-dev-tunnel" via `POST/PUT /webhooks` (token = `ASAAS_WEBHOOK_SECRET` local); no exit, desabilita (`enabled:false`) pra fila sequencial não pausar contra túnel morto.
- **Chave Pix obrigatória na conta** (one-time): sem ela, `pixQrCode` → `400 invalid_action` (mesmo bug do go-live). Criada via API: `POST /pix/addressKeys {"type":"EVP"}`.
- **"Pagar" cobrança sandbox via API**: `POST /payments/{id}/receiveInCash` → status `RECEIVED_IN_CASH` → dispara `PAYMENT_RECEIVED` real no webhook (o `mapPaymentStatus` precisa tratar `RECEIVED_IN_CASH`... na prática o handler keia pelo eventType, então funciona).
- **Fila de entrega é lenta/sequencial**: entregas podem atrasar minutos (retry/backoff), especialmente após o dev server reiniciar com túnel ativo. Checar `GET /webhooks` → `interrupted`.
- **Guia operacional completo** (rodar local contra Mock/Sandbox/Prod, matriz de envs, túnel, pareamento banco×provider): `.context/features/billing.md` § "Rodando local: Mock vs Sandbox vs Produção".

## Shape real dos webhooks de pagamento (bugs que o Mock mascarou)

1. `externalReference` vem em `payment.externalReference`, não em `subscription`/topo — ver [[../concepts/asaas-external-reference-in-payment]] (bug do go-live).
2. **`nextDueDate` NÃO existe no objeto `payment`** (vive na subscription, que não vem no webhook). Sem fallback, `currentPeriodEnd` ficava null na ativação → cancelamento nunca expiraria no cron. Fix 2026-06-13: `deriveNextDueDate` = `payment.dueDate + 1 mês`. Achado no primeiro teste sandbox — terceira confirmação de que o Mock esconde bugs de shape.

## Estado da conta de produção (2026-06-10)

- Conta criada pelo usuário. `ASAAS_WEBHOOK_SECRET` já gerada e na Vercel (cópia em `/tmp/claude-501/asaas_webhook_secret.txt` da sessão).
- Pendente (manual do usuário): gerar `ASAAS_API_KEY` e configurar o webhook no painel.
- ⚠️ Painel Asaas **não é automatizável** pelo agente — ver [[../concepts/claude-chrome-sensitive-domains]].

## Configuração de env (prod)

```
BILLING_PROVIDER=ASAAS
ASAAS_API_URL=https://www.asaas.com/api/v3
ASAAS_API_KEY=<chave>
ASAAS_WEBHOOK_SECRET=<token>
```

## Wikilinks

- [[../concepts/webhook-idempotency-via-unique-constraint]]
- [[../concepts/dev-fallback-without-secrets]]
- [[../concepts/defense-in-depth-cron]]
- [[../synthesis/monetization-v2-state]]

> Fonte: `src/lib/billing/asaas.ts`. Validado em sandbox; produção ativa após Sprint 5.
