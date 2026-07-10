---
title: Vínculo idempotente sob corrida (cheque o link antes do erro de unique)
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [pattern, concurrency, idempotency, prisma, transactions]
sources:
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/webhook-idempotency-via-unique-constraint.md
status: stable
---

> Quando uma operação "cria X e o vincula a Y idempotentemente" pode correr consigo mesma, o `catch` de violação de unique deve **primeiro** checar se o vínculo já existe (o vencedor já o criou) e devolver o resultado do vencedor — e **só então** cair nas mensagens de erro de outros uniques (ex.: paciente já cadastrado). Ordem trocada → o perdedor recebe um erro enganoso sobre um efeito que, na verdade, já aconteceu.

## Contexto

`POST /convert` (promoção de evento do Google → `Appointment`) numa tx Serializable cria, quando preciso, um **paciente novo** e depois grava o link `ExternalEvent` (`@@unique([userId, googleEventId])`). Dois requests concorrentes promovendo o **mesmo** evento com os **mesmos** dados de paciente novo:

1. R1 commita tudo (paciente P, `Appointment`, `ExternalEvent` do evento E).
2. R2 entra na tx, roda `patient.create(P)` **antes** do `externalEvent.create` → bate no unique `(userId, phone)` do Patient → **P2002 com target `phone`**.

Se o `catch` avalia a branch "paciente já existe" antes da branch "já promovido", R2 devolve *"Já existe um paciente com esse telefone — selecione-o"* — para um evento que **acabou de ser promovido** por R1. O correto é devolver o agendamento do vencedor (`alreadyPromoted:true`).

## Pontos-chave

- **Ordem no catch**: para **qualquer** `P2002` OU `P2034` (falha de serialização), rode primeiro `alreadyPromotedResponse()` (lê o `ExternalEvent` linkado); se achar, devolve o vencedor. Só depois trate P2002 de paciente / P2034 genérico.
- O erro de unique do **paciente** (não do evento) ainda é o sinal certo quando NÃO há link para aquele `googleEventId` (colisão real de paciente num evento ainda não promovido) — por isso o fall-through é preservado.
- **`create`, não `upsert`** no link: sob corrida, o `DO UPDATE` de um upsert re-apontaria `appointmentId` e orfanaria o `Appointment` do outro request. O `create` vira P2002 → tratado no catch.

## Corolário: Serializable NÃO protege um read feito fora da tx

O mesmo `/convert` faz o **check de conflito de horário** (`findConflictingAppointment`) no cliente global, **antes** de abrir a tx. Dois `/convert` simultâneos de **eventos diferentes** no mesmo horário: ambos passam o check (nada existe ainda), ambos criam `Appointment` sobrepostos. A tx Serializable **não** aborta — o predicado que precisaria ser serializado (o read de conflito) está **fora** dela, e cada tx só faz INSERTs sem read da tabela de conflito. Não há ciclo read-write para o SSI detectar.

- Isto é **classe pré-existente idêntica ao `POST /appointments`** (que nem usa tx). Aceito por design; endurecer exige constraint de exclusão no DB (mudança app-wide).
- **Lição**: envolver escritas numa tx Serializable **não** torna atômico um guard cujo read acontece antes/fora dela. Ou o read entra na tx (com o client `tx`), ou a garantia vira do DB (exclusion constraint / unique).

## Cross-refs

- `.context/features/google-calendar.md` — § Fase B (o catch do `/convert` e o comentário sobre o conflito fora da tx).
- [[webhook-idempotency-via-unique-constraint]] — o mesmo "unique + catch P2002 = idempotência sem lock", aplicado a webhooks.
- [[external-event-firewall]] — por que a promoção é a única ponte evento→`Appointment`.
