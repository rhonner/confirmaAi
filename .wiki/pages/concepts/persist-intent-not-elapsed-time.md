---
title: Grave a intenção, não deduza do relógio
type: concept
created: 2026-07-24
updated: 2026-07-24
tags: [data-model, pattern, scheduler, time, gotcha, metrics]
sources:
  - raw/sessions/2026-07-24-2050-agenda-retroactive-and-month-click.md
  - .context/features/appointments.md
  - .context/features/scheduler.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/move-across-days-via-local-components.md
  - pages/concepts/regression-test-assert-the-predicate.md
status: stable
---

# Grave a intenção, não deduza do relógio

> Quando um registro pode nascer **no passado de propósito**, essa intenção precisa ser **persistida no momento da escrita**. Derivar de `dateTime < now` na leitura colapsa dois casos de negócio **opostos** — "lancei no passado" e "marquei para o futuro e o horário passou" — e o segundo é justamente o que o produto mede.

## O caso concreto

A agenda passou a permitir lançar agendamento com data/hora que já passou, "simplesmente para organização" (pedido do dono, 2026-07-24). A tentação é não guardar nada: *"é passado se `dateTime < now`, calculo na leitura"*.

Isso quebra o produto. As duas linhas abaixo são **indistinguíveis** na leitura e exigem tratamento oposto:

| Linha | `dateTime < now` | O que o sistema deve fazer |
| ----- | ---------------- | -------------------------- |
| Lançada hoje para a terça passada (registro histórico) | ✅ | **Nada.** Não é falta; não mandar WhatsApp de algo que já aconteceu |
| Lançada semana passada para hoje 14h, e agora são 15h | ✅ | **Marcar `NO_SHOW`** — é a falta que o produto existe para medir |

O predicado só sabe *quanto tempo passou*; ele não sabe **o que a pessoa quis dizer**. Um flag gravado na escrita sabe: `retroactive = dateTime < now` **no instante do create/update**.

## A regra

1. **Decida na escrita, no servidor.** `isRetroactive(dateTime, now?)` numa função só (`src/lib/retroactive.ts`), chamada pelas três rotas que escrevem horário (create, update quando reescreve `dateTime`, promoção de evento externo). O campo **não** entra no schema Zod de input — cliente não declara sua própria intenção.
2. **Reavalie quando o horário for reescrito.** Mover para o futuro **limpa** o flag e devolve o registro à automação; mover para o passado marca. O flag descreve o horário atual, não a data de criação.
3. **Comparação estrita** (`<`): agendar para "agora" é agendamento normal, não registro histórico.
4. **O flag precisa ter dentes.** Um selo que só pinta a UI é decorativo: o valor está nos filtros dos jobs (aqui, `retroactive: false` em `markNoShows` e na query de confirmação). Sem isso o cron marcaria o registro histórico como falta em ≤ 30 min.

## Por que não uma tabela separada

O reflexo, dado o [[external-event-firewall]], seria tabela própria. Não serve: o registro retroativo **é** de domínio — aparece na agenda junto dos outros, é editável, e **conta nas métricas pelo status** (se o profissional marcar "Faltou", é uma falta real, só registrada depois). Tabela separada exigiria duplicar leitura, edição e métricas.

Então este é o caso em que a *"alternativa defense-in-depth"* daquela página (um booleano na tabela de domínio) é a opção **certa** — assumindo o custo que ela previa: **lembrar de filtrar em N lugares**. Mitigação obrigatória: um check de regressão que asserte o predicado nos jobs (`RT.1`/`RT.2` em `scripts/test-sprints.ts`) — ver [[regression-test-assert-the-predicate]].

## Cheiro geral (fora deste projeto)

Sempre que ouvir *"dá para deduzir do timestamp"*, pergunte se o predicado distingue **intenção** de **decurso de tempo**. Famílias comuns do mesmo erro:

- `deleted = deletedAt != null` (ok) × "estava ativo quando isso aconteceu" (precisa de histórico).
- "É lançamento retroativo" × "venceu" — em cobrança, contabilidade, ponto eletrônico.
- "Importado" × "criado aqui" (é o mesmo raciocínio do [[external-event-firewall]], com tabela em vez de flag).
- Backfill/seed que nasce "atrasado" e é varrido por um job de SLA no primeiro run.

Regra de bolso: **estado derivável do relógio é derivável; intenção não.** Se dois futuros diferentes produzem o mesmo predicado hoje, o predicado não é a verdade — é uma coincidência.

## Cross-refs

- `.context/features/appointments.md` § Retroativo — campo, migration, UI do selo e reversibilidade.
- `.context/features/scheduler.md` § `markNoShows` — o filtro como invariante (`RT.1`).
- [[external-event-firewall]] — a mesma preocupação (query ampla com efeito colateral), resolvida por tabela quando a linha **não** é de domínio.

## Fontes

- raw/sessions/2026-07-24-2050-agenda-retroactive-and-month-click.md
