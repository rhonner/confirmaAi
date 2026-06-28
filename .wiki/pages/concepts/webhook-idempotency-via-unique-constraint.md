---
title: Idempotência de webhook via @unique constraint
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [webhook, idempotency, postgres, billing, pattern]
sources:
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
related:
  - .context/features/billing.md
status: stable
---

> Pattern: `@unique providerEventId` + catch P2002 = idempotência sem lock distribuído nem fila externa. Usado em `BillingEvent` (Sprint 5) pra absorver retries de webhooks sem reprocessar.

## Problema

Provedores (Asaas, Stripe, etc.) **retentam** webhooks em qualquer 5xx ou timeout. Sem proteção, o mesmo evento processa N vezes e você efetua o pagamento, manda email, atualiza status — N vezes.

Soluções comuns:
- **Redis SETNX** com TTL: requer Redis.
- **Fila com dedup**: complexidade.
- **Lock pessimista**: contenção em hot path.

## Solução adotada

Tabela dedicada com `@unique` no ID do evento do provider:

```prisma
model BillingEvent {
  id              String   @id @default(cuid())
  providerEventId String   @unique  // ← chave do gambito
  // ... payload, processedAt, etc.
}
```

No handler:

```ts
try {
  const record = await prisma.billingEvent.create({
    data: { providerEventId: event.providerEventId, ... },
  });
  // primeira vez — processa
} catch (err) {
  if (err.code === "P2002") {
    // já vi esse evento — no-op idempotente
    return NextResponse.json({ received: true, duplicate: true });
  }
  throw err;
}
```

`P2002` é o código Prisma para violation of unique constraint. Postgres garante atomicidade — não há race entre `findUnique` + `create`.

## "Sempre 200 após registrar"

Padrão crítico: **uma vez gravado o `BillingEvent`, retornamos 200**, mesmo se o lifecycle apply (atualizar `Subscription.status`) falhar. Por quê?

- Provider entende 5xx como "tente de novo" → re-envia o mesmo evento.
- Mas como o `BillingEvent` está gravado, na próxima tentativa cai no `P2002` → no-op.
- Estamos numa armadilha: provider dá retry infinito porque nossa lógica falhou, mas nunca consegue reprocessar porque o registro existe.

Solução: gravar evento, marcar `processedAt = null` se apply falhou, retornar 200, e ter um job de reconciliação (cron) que pega `processedAt = null` e re-tenta o apply.

## Quando NÃO usa

- Eventos sem ID estável do provider (Asaas dá fallback `${event}:${payment.id}` quando `body.id` falta).
- Provider que NÃO retenta em erro: idempotência menos crítica, mas ainda boa prática.

## Trade-offs

| | Esta abordagem | Redis SETNX | Lock pessimista |
| - | -------------- | ----------- | --------------- |
| Setup | 0 (já tem Postgres) | sim | 0 |
| Latência | índice unique | sub-ms | depende |
| Persistência audit | sim (BillingEvent fica) | TTL | não |
| Custo | grátis | $$ | grátis (mas contenção) |

## Contra-exemplo no mesmo codebase

O webhook de **resposta do paciente** (Evolution `MESSAGES_UPSERT`) **não** aplica este padrão: não há `@unique` no id da mensagem inbound. Para paciente com 1 pendente, um retry é no-op seguro; com **≥2** pendentes, o retry confirma o próximo agendamento (duplo-confirma). Fechar exigiria persistir `data.key.id` (migration). Ver [[whatsapp-reply-fifo-match-and-ack]] § gap de idempotência.

## Wikilinks

- [[../entities/asaas-integration]]
- [[append-only-via-pg-trigger]] — irmão (mesma família "guarantees no nível DB")
- [[defense-in-depth-cron]] — reconciliação de processed=null
- [[whatsapp-reply-fifo-match-and-ack]] — contra-exemplo (webhook ainda NÃO idempotente)

> Fonte: `src/app/api/billing/webhook/route.ts`. Validado em `npm run test:sprints` (5.1).
