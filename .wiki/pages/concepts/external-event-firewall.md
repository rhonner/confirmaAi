---
title: Firewall de eventos externos (tabela separada vs coluna source)
type: concept
created: 2026-07-05
updated: 2026-07-24
tags: [pattern, data-model, multi-tenancy, integrations, scheduler]
sources:
  - raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
  - raw/sessions/2026-07-24-2050-agenda-retroactive-and-month-click.md
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
  - raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
  - .context/features/google-calendar.md
  - .context/features/time-blocks.md
related:
  - .context/features/scheduler.md
  - pages/concepts/persist-intent-not-elapsed-time.md
  - pages/concepts/quota-ledger-immortal-slot.md
  - pages/concepts/idempotent-link-under-race.md
  - pages/concepts/revive-cancelled-event-on-id-reuse.md
status: stable
---

> Registros vindos de uma fonte externa (ex: eventos do Google Calendar) devem viver numa **tabela separada e somente-leitura**, não como linhas na tabela de domínio com uma coluna `source`. Assim as queries amplas do sistema **fisicamente não os enxergam** — a segurança é estrutural, não um filtro que alguém precisa lembrar de aplicar.

## Contexto

Ao trazer eventos do Google Calendar para dentro do ConfirmaAí, a tentação é inseri-los na tabela `Appointment` com um discriminador `source = GOOGLE`. Isso é uma armadilha porque os pontos mais perigosos do sistema são **queries cross-tenant amplas** que filtram só por status/data:

- `sendConfirmations` / `sendReminders` (`src/lib/services/scheduler.ts`) — `where { status: PENDING, confirmationSentAt: null, user.whatsappStatus: CONNECTED }` → **mandaria WhatsApp** para o telefone anexado (lixo/errado).
- `markNoShows` — `updateMany where { dateTime < now, status: PENDING }` (global, nem junta `user`) → marcaria todo evento passado importado como **NO_SHOW falso**, corrompendo a métrica de faltas que é o produto.
- dashboard (`estimatedLoss`), `conflict.ts` (deletado em 2026-07-24 — sobreposição virou permitida), webhook de confirmação — todos leem `Appointment` amplamente.

## Pontos-chave

- **Coluna `source` = dívida distribuída**: exige adicionar `source != GOOGLE` (ou `patientId not null`) em **todas** essas queries. Esquecer **uma** silenciosamente vaza spam de WhatsApp ou corrompe métricas.
- **Tabela separada = firewall físico**: o scheduler/dashboard só consultam `Appointment`; uma `ExternalEvent` nunca aparece a menos que explicitamente unida. Impossível esquecer um filtro que não precisa existir.
- **Promoção explícita como única ponte**: um evento externo só vira `Appointment` (e só então pode mandar WhatsApp / consumir vaga de quota) via ação **manual** do usuário, que passa pelo caminho normal (`reserveSlotInTx` 1×, telefone válido exigido). Ver [[quota-ledger-immortal-slot]].
- **Idempotência no vínculo**: a promoção é idempotente em `ExternalEvent.appointmentId @unique` (duplo-clique não cria 2 agendamentos nem queima 2 vagas vitalícias).

## Estado: implementado na Fase B (2026-07-10)

O padrão saiu do design para o código:
- **`ExternalEvent`** existe (migration `20260710170250_add_external_event`), mas é populado **lazy só na promoção** (não há full-sync que insira eventos). O scheduler **nunca** o menciona — regressão `GCAL.10` falha se mencionar.
- **Promoção** = `POST /convert` (idempotente, tx Serializable, quota + conflito), matching telefone→CPF→patientId. Ver [[idempotent-link-under-race]] para a corrida.
- **De-dup do overlay**: a rota de eventos filtra os já promovidos (`!promotedIds.has(e.id)`) para não mostrar o bloco Google **e** o `Appointment` no mesmo dia. É a face de leitura do firewall: o promovido migra de "evento externo" para "domínio".
- Validado E2E (Chrome MCP, credencial real): promover → `Appointment` PENDING → some do overlay; o evento **continua intacto no Google** (escopo readonly, promoção não escreve nada lá).

## Estendido à Fase C (2026-07-10) — firewall nos DOIS sentidos

A Fase C passou a **escrever** no Google (espelhar `Appointment`→evento). Isso abre um novo caminho de loop: o evento que NÓS criamos volta na listagem do overlay e poderia ser "promovido" a um segundo `Appointment` (create→mirror→promote→…). O firewall foi estendido para cobrir o sentido inverso:

- **Tag de origem-app**: o evento espelho carrega `extendedProperties.private.confirmaaiOrigin="app"`. `mapGoogleEvent`/`mapGoogleEventDetail` retornam `null` para eventos com essa tag → **somem do overlay** (não viram bloco promovível). É a blindagem **id-independente** (funciona mesmo se a persistência do `googleEventId` falhou).
- **De-dup por `Appointment.googleEventId`**: a rota `events` também esconde eventos cujo id bate num `googleEventId` de algum `Appointment` do tenant (backstop do drop por tag).
- **`/convert` rejeita origem-app**: promover um evento cujo id já está gravado num `Appointment` é bloqueado (defesa contra chamada direta à API que não passa pelo overlay).
- **Mirror ignora promovidos**: `mirror.ts` pula qualquer `Appointment` que tenha `ExternalEvent` vinculado — nunca reescreve/apaga o evento ORIGINAL que o usuário criou no Google (só espelha agendamentos nativos). O sentido Google→app continua **manual** (Fase B).
- O scheduler segue sem enxergar nada (GCAL.7/10 intactos). Detalhe operacional + os 3 fixes de review em `.context/features/google-calendar.md` § Fase C; ver também [[revive-cancelled-event-on-id-reuse]].

## Refinamento (2026-07-24) — **só-leitura ≠ inerte**, e o firewall também vale para bloqueios

Duas extensões do mesmo padrão, no dia em que a agenda virou grade arrastável:

- **`TimeBlock` é tabela separada pela mesma razão.** Horário bloqueado (almoço, reunião, férias) poderia ter sido "um `Appointment` sem `patientId`" — e aí toda query ampla do scheduler precisaria lembrar de `patientId != null`. Tabela própria = o scheduler **fisicamente não vê** bloqueios. O firewall não é sobre "dado externo"; é sobre **qualquer linha que não deve alimentar jobs com efeito colateral**.
- **Não-arrastável não quer dizer não-clicável.** Enquanto o evento do Google foi tratado como *inerte* na UI (um `<div>` mudo), o feedback do dono foi direto: "clico neles e nada acontece". O firewall restringe **mutação** (só `Appointment`/`TimeBlock` se movem; o evento externo nunca é arrastado nem editado in-place), não **interação**. O evento passou a ser `<button>` com duas saídas: **promovível** → diálogo de promoção (a ponte manual de sempre); **não promovível** → abre no Google (`window.open`, `noopener`).
- **A regra de "pode promover?" mora numa função só** (`canPromoteGoogleEvent`), usada pelas três visões. Dia inteiro não promove (a duração viraria mentira silenciosa) e "Ocupado" não promove (placeholder sem nada para pré-preencher). Grades apenas **reportam o id**; a política vive no pai — é o que impede a regra de divergir por visão.

Detalhe operacional em `.context/features/agenda-day-grid.md` § "Clique num evento do Google" e `.context/features/time-blocks.md`.

## Quando aplicar / quando NÃO

- **Aplique** quando dados de uma fonte externa compartilham tabela com dados de domínio que alimentam jobs automáticos com efeito colateral real (mensagens, cobrança, métricas de negócio).
- **Defense-in-depth alternativa** (se a tabela separada não for viável): um booleano **positivo** `autoConfirmEnabled @default(false)` para importados, aplicado nos filtros de envio **E** no `markNoShows` juntos, com a coluna incorporada aos índices compostos. Preferir a tabela separada — o booleano ainda depende de lembrar de filtrar em N lugares.
  - **A alternativa deixou de ser hipótese (2026-07-24)**: `Appointment.retroactive` é exatamente esse booleano, e foi a escolha **certa** porque a linha **é de domínio** — o agendamento lançado no passado aparece na agenda junto dos outros, é editável e conta nas métricas pelo status. Tabela separada obrigaria a duplicar leitura, edição e métricas. Ou seja: **tabela separada quando a linha não pertence ao domínio; flag quando pertence, mas não deve alimentar jobs.** O custo previsto aqui (lembrar de filtrar em N lugares) foi pago com check de regressão sobre o predicado dos jobs (`RT.1`/`RT.2`). Ver [[persist-intent-not-elapsed-time]].
- **NÃO** transforme em regra cega para toda tabela; o custo (duas representações + lógica de vínculo/cancelamento) só compensa quando as queries amplas têm efeito colateral perigoso.

## Cross-refs

- `.context/features/google-calendar.md` — decisão operacional + matriz de cenários (INTEG-05 é o cenário-âncora).
- `.context/features/scheduler.md` — as queries amplas que motivam o firewall.
- [[quota-ledger-immortal-slot]] — por que consumir vaga só na promoção importa.

## Fontes

- raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
