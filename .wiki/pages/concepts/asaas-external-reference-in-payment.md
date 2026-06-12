---
title: Asaas envia externalReference em payment, não em subscription
type: concept
created: 2026-06-12
updated: 2026-06-12
tags: [asaas, billing, webhook, gotcha, externalReference]
sources:
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - pages/entities/asaas-integration.md
  - pages/concepts/whatsapp-ninth-digit-jid.md
  - .context/features/billing.md
status: stable
---

> Bug crítico achado no teste de pagamento real (2026-06-12). Pagamento Pix confirmado, webhook `PAYMENT_RECEIVED` recebido e processado com 200 — **mas o plano nunca subia de FREE**. Em produção: todo cliente pagaria e continuaria sem o Pro.

## Causa

O checkout grava `externalReference = "<userId>:PRO"` na assinatura Asaas. Nos eventos de **pagamento** (`PAYMENT_CREATED/UPDATED/RECEIVED`), o Asaas devolve esse valor em **`payload.payment.externalReference`** — NÃO em `payload.subscription.externalReference` nem no topo `payload.externalReference`.

O handler do webhook só olhava as duas últimas → `planTier` saía `null` → o `prisma.subscription.update({ plan })` nunca rodava. E como FREE já é `status: ACTIVE`, o patch de status era um no-op: tudo "verde", nada mudava.

## Diagnóstico (como foi pego)

Ler a tabela `BillingEvent` em produção foi o que destravou — cada evento guarda o `payload` cru e o `userId` resolvido:
- `PAYMENT_RECEIVED`, `userId` resolvido ✅, `processed: true`, `payment.externalReference = "...:PRO"` presente
- mas `Subscription.plan` = FREE

Ou seja: webhook ok, resolução ok, processamento ok → o problema só podia estar na extração do tier. A `BillingEvent` é a fonte de verdade pra depurar billing — sempre começar por ela.

## Fix

`planTierFromPayload(payload)` em `provider.ts` procura nas 3 fontes (`payment` → `subscription` → topo), retorna `PRO|PREMIUM|null`. 5 testes de regressão com o shape real.

## Lição

Mesma família do [[whatsapp-ninth-digit-jid]]: **integração externa só revela o shape real com tráfego real**. Mock/sandbox usavam um payload "limpo" que não reproduzia onde o Asaas põe o campo. Teste de pagamento de verdade (Pix R$ 3) pagou esse e mais dois bugs (chave Pix ausente, assinatura duplicada no retry) numa tacada.

> Fonte: sessão go-live 2026-06-12; `BillingEvent` de produção.
