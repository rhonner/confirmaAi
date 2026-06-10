---
title: Contador de uso com período lazy (sem job de reset)
type: concept
created: 2026-06-10
updated: 2026-06-10
tags: [billing, quota, usage, scheduler, pattern]
sources:
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - pages/concepts/quota-ledger-immortal-slot.md
  - pages/concepts/defense-in-depth-cron.md
  - .context/features/scheduler.md
status: stable
---

> Pattern da Sprint 6 (`src/lib/billing/usage.ts`): contador de mensagens **por período** sem nenhum job de "reset mensal". A virada de período é a **criação lazy de uma nova linha**, keyed por `@@unique([userId, periodStart])`.

## Como funciona

1. `currentPeriodFor(sub)` decide o período corrente:
   - Pago com `currentPeriodEnd > now` → ciclo de cobrança real.
   - FREE (sem ciclo) **ou ciclo expirado** → mês calendário UTC.
2. `getCurrentUsage()` faz `upsert` da linha do período (cria zerada na 1ª leitura; `update` refresca `messagesIncluded` se o plano mudou no meio do ciclo).
3. `incrementMessagesSent()` = `UPDATE ... increment` atômico — seguro com runs concorrentes.

## Por que não ter job de reset

- **Menos um job pra falhar** — alinhado à premissa "rodar sozinho".
- **Auto-cura contra webhook de renovação perdido**: se o Asaas não avisou a renovação e `currentPeriodEnd` ficou no passado, o fallback de mês calendário assume — o contador **continua girando** em vez de congelar no ciclo velho (que bloquearia o tenant pra sempre ou liberaria infinito, dependendo do estado).
- Linhas antigas ficam como histórico de uso por período (de graça).

## Pega-ratão de quem for mexer

- O gate do scheduler usa **cache por execução** (`Map<userId, remaining>`) e decrementa localmente após cada envio — não re-consulta o banco por appointment. Se criar novo caminho de envio, **incremente o contador E o cache**.
- Bloqueio gera `MessageLog { status: QUOTA_BLOCKED }` **deduplicado** por (appointment, type) — sem isso o mesmo appointment bloqueado gera log novo a cada 30 min.

> Fonte: raw/sessions/2026-06-10-sprint6-and-golive.md. Operacional em `.context/features/scheduler.md`.
