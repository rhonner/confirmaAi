---
title: Teste de regressão deve asserir o predicado, não a chamada
type: concept
created: 2026-07-10
updated: 2026-07-24
tags: [testing, gotcha, regression, source-grep, flake, determinism]
sources:
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - raw/sessions/2026-07-24-2050-agenda-retroactive-and-month-click.md
  - raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/append-only-via-pg-trigger.md
  - pages/concepts/persist-intent-not-elapsed-time.md
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

## Corolário: o teste também precisa escolher sua fixture de forma determinística

Mesma família de defeito, do outro lado — o check não mente sobre o comportamento, mas sobre **qual linha ele pegou**.

`findFirst` **sem `orderBy`** não tem ordem garantida: o Postgres devolve o que for conveniente ao plano, e isso muda com o estado da tabela. No `scripts/test-sprints.ts`, o check 2.15 apagava "um paciente" via `findFirst` sem `orderBy`; dependendo de qual linha caía, o 2.16 seguinte estourava `P2002` no unique `[userId, cpfHash]`. Flake intermitente, sem relação com o código sob teste (2026-07-24).

- **Regra**: em teste, todo `findFirst`/`take: 1` que alimenta uma ação destrutiva ou uma asserção leva **`orderBy` explícito** (`{ createdAt: "asc" }`, `{ id: "asc" }`) — ou, melhor, filtra pela fixture que o próprio check criou.
- **Cheiro**: um check falha "às vezes" e passa ao rodar sozinho. Antes de culpar concorrência, procure seleção de linha sem ordem.
- Vale para o mesmo `test:sprints` que já precisa rodar **isolado** do vitest (contenção no Postgres local) — duas fontes distintas de não-determinismo que se confundem no sintoma.

## Corolário 2: check NEGATIVO por grep tem que ignorar comentários

Quando o check afirma uma **ausência** ("nenhuma rota volta a rejeitar conflito"), o grep no
fonte encontra a string proibida **na documentação que explica a remoção** — e o check
falha (ou, pior, some numa refatoração de comentário e passa a mentir).

Aconteceu com o `RT.3` (2026-07-24): a asserção era
`!src.includes("Conflito com agendamento")`, mas os comentários das três rotas registram
justamente *"o antigo 400 'Conflito com agendamento de X' foi removido"* — contexto que vale
manter. Fix: `stripComments()` (tira `/* */` e `// …`) antes das asserções negativas.

- **Regra**: asserção **positiva** pode ler o fonte cru; asserção **negativa** lê o fonte
  **sem comentários** — senão você está proibindo o time de documentar o que foi removido.
- **Cheiro**: um check começa a falhar depois de alguém *comentar melhor* o código.
- Complemento mais forte quando dá: prove a ausência pelo **comportamento** (criar dois
  registros sobrepostos e ver os dois nascerem, como o `RT.3` também faz), não só pelo texto.

## Cross-refs

- `.context/features/google-calendar.md` — GCAL.9 (endurecido) e a de-dup em `events/route.ts`.
- `.context/README.md` § "Definição de feito" — `test:sprints` roda isolado.
