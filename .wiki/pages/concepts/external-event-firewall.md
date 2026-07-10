---
title: Firewall de eventos externos (tabela separada vs coluna source)
type: concept
created: 2026-07-05
updated: 2026-07-10
tags: [pattern, data-model, multi-tenancy, integrations, scheduler]
sources:
  - raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
  - .context/features/google-calendar.md
related:
  - .context/features/scheduler.md
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
- dashboard (`estimatedLoss`), `conflict.ts`, webhook de confirmação — todos leem `Appointment` amplamente.

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

## Quando aplicar / quando NÃO

- **Aplique** quando dados de uma fonte externa compartilham tabela com dados de domínio que alimentam jobs automáticos com efeito colateral real (mensagens, cobrança, métricas de negócio).
- **Defense-in-depth alternativa** (se a tabela separada não for viável): um booleano **positivo** `autoConfirmEnabled @default(false)` para importados, aplicado nos filtros de envio **E** no `markNoShows` juntos, com a coluna incorporada aos índices compostos. Preferir a tabela separada — o booleano ainda depende de lembrar de filtrar em N lugares.
- **NÃO** transforme em regra cega para toda tabela; o custo (duas representações + lógica de vínculo/cancelamento) só compensa quando as queries amplas têm efeito colateral perigoso.

## Cross-refs

- `.context/features/google-calendar.md` — decisão operacional + matriz de cenários (INTEG-05 é o cenário-âncora).
- `.context/features/scheduler.md` — as queries amplas que motivam o firewall.
- [[quota-ledger-immortal-slot]] — por que consumir vaga só na promoção importa.

## Fontes

- raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
