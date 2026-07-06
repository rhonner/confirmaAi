---
title: Firewall de eventos externos (tabela separada vs coluna source)
type: concept
created: 2026-07-05
updated: 2026-07-05
tags: [pattern, data-model, multi-tenancy, integrations, scheduler]
sources:
  - raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
  - .context/features/google-calendar.md
related:
  - .context/features/scheduler.md
  - pages/concepts/quota-ledger-immortal-slot.md
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
