---
title: Defesa em profundidade via cron diário
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [cron, defense-in-depth, billing, reliability, pattern]
sources:
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
related:
  - .context/features/billing.md
  - .context/features/scheduler.md
status: stable
---

> Pattern: cron diário que **reconcilia estado** baseado em invariantes temporais, servindo como backstop contra eventos perdidos do gateway. Aplicado em `runBillingMaintenance()` (Sprint 5) — mas o pattern é genérico.

## Problema

Webhooks falham silenciosamente:
- Provider tem outage e nunca entrega.
- Ngrok cai em dev e perdemos eventos.
- HMAC inválido transitório → 401 → provider para de retentar após N tentativas.
- Bug no nosso código ignora um evento.

Confiar **apenas** em webhook em tempo real cria uma ponta solta.

## Solução: invariantes temporais aplicadas por cron

Definir invariantes que dependem só do **estado local + tempo**:

| Invariante | Aplicação no cron diário |
| ---------- | ------------------------ |
| `Subscription.status = PAST_DUE` há > 7 dias → SUSPENDED | Atualiza + audit `subscription.suspended` |
| `Subscription.status = CANCELED + currentPeriodEnd < now` → downgrade FREE | Update plan + limpa providerIds + audit `subscription.downgraded` |
| `BillingEvent.processedAt = null` (Sprint 7+) → reaplica patch | Reconciliação de eventos cujo apply falhou |
| `MessageLog` órfão sem appointment (não fazemos hoje) | Cleanup |

Cada invariante:
1. É **idempotente** — rodar 2x é no-op.
2. É **gated por status atual** — só age se a entrada estiver no estado errado.
3. **Audita a transição** — não silenciosamente.

Implementação: `src/lib/services/billing-maintenance.ts` + chamada em `runSchedulerJobs()` (mesmo cron `/api/cron/run`, economiza invocação Vercel).

## Por que rodar diariamente (não a cada minuto)?

- Tradeoff custo × frescor. Pra billing, atraso de 24h pra detectar PAST_DUE perdido é aceitável (usuário ainda tem grace).
- Cron de minutos × eventos raros = trabalho desperdiçado.
- Diário é fácil de monitorar — uma execução, fácil ver no log se rodou/falhou.

## Quando NÃO usar (rodar mais frequente ou tempo real):

- Operações com SLA segundos (status do agendamento, presença online).
- Sinais que afetam UX imediato (notificação push, feed de chat).

## Princípio mais geral

Se um evento de provedor externo é a **única** fonte de uma transição de estado, você tem dependência fraca. Sempre que possível, derive a transição de `(state, time)` localmente — provider vira **otimização** (deixa o estado correto rapidamente) em vez de **dependência crítica**.

## Wikilinks

- [[../entities/asaas-integration]]
- [[webhook-idempotency-via-unique-constraint]]
- [[append-only-via-pg-trigger]] — outro "guarantee no nível DB"

> Fonte: `src/lib/services/billing-maintenance.ts`. Validado em `npm run test:sprints` (5.5, 5.6).
