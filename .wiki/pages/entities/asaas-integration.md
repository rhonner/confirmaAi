---
title: Asaas — gateway de cobrança brasileiro
type: entity
created: 2026-05-07
updated: 2026-05-07
tags: [asaas, billing, pagamento, pix, brasil]
sources:
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
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

## NF-e

Ativada no painel Asaas: emissão automática a cada `PAYMENT_RECEIVED`. Inclui razão social, CNPJ do tenant — configurado uma vez por conta Asaas (não por subscription nossa). Sprint 8 (LGPD/legal) finaliza essa parte.

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
