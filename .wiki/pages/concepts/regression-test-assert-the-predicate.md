---
title: Teste de regressão deve asserir o predicado, não a chamada
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [testing, gotcha, regression, source-grep]
sources:
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/append-only-via-pg-trigger.md
status: stable
---

> Um check de regressão que faz **grep da chamada** (`externalEvent.findMany`) mas não do **predicado que carrega o comportamento** (`!promotedIds.has`) é tautológico: passa mesmo se o comportamento for invertido ou removido. Asserte a linha load-bearing, ou observe a saída real.

## Contexto

A de-dup do overlay (Fase B) esconde os eventos do Google já promovidos: a rota faz `externalEvent.findMany(...)` e depois `events.filter((e) => !promotedIds.has(e.id))`. O primeiro `check` (GCAL.9) validava a de-dup por (a) uma query Prisma **re-implementada** no próprio teste e (b) `source.includes("externalEvent.findMany")`.

Nenhuma das duas observa o **filtro** que efetivamente esconde os eventos. Duas regressões passariam verdes:
- Inverter o filtro para `promotedIds.has(e.id)` → o overlay esconderia os eventos **certos** e mostraria só os promovidos.
- Remover a linha do `.filter` (mantendo o `findMany`) → eventos promovidos **duplicam** no overlay.

Em ambos, `"externalEvent.findMany"` continua presente e a query re-implementada continua retornando o promovido → GCAL.9 fica verde enquanto o comportamento que ele **nomeia** está quebrado. O único caso que pegava era apagar o bloco inteiro.

## Pontos-chave

- **Grep da chamada ≠ grep do predicado.** A chamada (`findMany`, `fetch`, `map`) raramente é o que quebra numa regressão; o **predicado/condição** é (`!x.has(...)`, `>= limit`, `status === PENDING`). Asserte esse.
  ```ts
  // fraco: passa com filtro invertido/removido
  src.includes("externalEvent.findMany")
  // forte: um filtro invertido (sem "!") ou removido derruba o check
  src.includes("externalEvent.findMany") && src.includes("!promotedIds.has")
  ```
- **Re-implementar a query no teste** prova que o DB tem os dados, não que a **rota** os usa. Se não dá para invocar a rota, ao menos ancore no predicado real por grep.
- **Cheiro**: o nome do check afirma um comportamento observável ("esconde eventos promovidos") mas as asserções só tocam pré-condições (dados existem, função é chamada). Feche a distância entre o nome e a asserção.
- Melhor ainda quando barato: **observe a saída real** (invoque o handler / faça a request) em vez de inspecionar o source.

## Cross-refs

- `.context/features/google-calendar.md` — GCAL.9 (endurecido) e a de-dup em `events/route.ts`.
