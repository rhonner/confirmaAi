---
title: Ressuscitar evento cancelado ao reusar um id determinístico (409 ≠ "já existe e está vivo")
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [google-calendar, idempotency, gotcha, external-write, mirror]
sources:
  - raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/patch-merge-clear-requires-explicit-empty.md
  - pages/concepts/idempotent-link-under-race.md
  - pages/synthesis/google-calendar-integration-state.md
status: stable
---

> Quando você espelha um recurso local num sistema externo usando um **id determinístico** para tornar o `insert` idempotente, um `409 Conflict` NÃO significa só "já criei isso e está tudo bem". O id pode apontar para um **tombstone apagado**. Tratar 409 como sucesso cego deixa o espelho invisível para sempre.

## Contexto (Fase C do Google Calendar)

O mirror app→Google cria um evento com id determinístico `appOriginEventId(appointmentId)` (base32hex de um hash do id do `Appointment`) → reenviar o `events.insert` bate no mesmo id → `409` → idempotente. Bom padrão. Mas ele colide com a decisão do dono de **apagar** o evento no Google quando o agendamento é cancelado:

1. Criar agendamento → `events.insert` id `cai…` → evento vivo.
2. Cancelar (status→CANCELED) → `events.delete` + limpa `googleEventId` no `Appointment`.
3. **Reabrir** (status→CONFIRMED) → `googleEventId` é `null` → o mirror faz backfill via `createGoogleEvent` → `events.insert` com o **mesmo** id determinístico.

O ponto não-óbvio: **o Google retém o evento apagado como um "tombstone" com `status:"cancelled"` e o id fica RESERVADO** (por tempo efetivamente indefinido no `primary`). O `insert` do passo 3 devolve `409` mas o evento **continua cancelado/invisível**. Se `createGoogleEvent` tratar 409 como sucesso e devolver o id, o agendamento reaberto fica ativo no app porém **sem evento visível** no Google, e todo `patch` futuro atualiza um tombstone que nunca reaparece.

## Fix

No ramo 409 do `createGoogleEvent`, em vez de sucesso cego, faça um `events.patch` (mesmo id) com um resource que inclui `status:"confirmed"`:

- Evento vivo (retry de insert cujo persist falhou) → patch é um refresh inócuo.
- Tombstone cancelado (reabertura) → `status:"confirmed"` **ressuscita** o evento.

Um único patch cobre os dois casos (sem precisar de um `events.get` para desambiguar). Complemento: `buildEventResource` passou a sempre incluir `status:"confirmed"`, então nenhum patch normal pode deixar um evento preso em `cancelled`.

## Regra geral

- **Id determinístico + delete real ⇒ reuso de id colide com tombstone.** Antes de reusar um id que pode ter sido apagado, planeje a ressurreição (update/PUT com o status "vivo"), não confie no upsert implícito do `insert`.
- **`409` de um insert idempotente é ambíguo** (existe-e-vivo vs existe-como-tombstone). Só é seguro tratá-lo como sucesso se o recurso não puder existir num estado "morto-mas-reservado".
- Alternativa de produto (não escolhida aqui, pois o dono quis "apagar"): não deletar no cancelamento — `patch status:"cancelled"` e manter o id — aí reabrir é só um patch de volta e o problema de tombstone nunca surge.

## Cross-refs

- `.context/features/google-calendar.md` § Fase C (fix #1) — detalhe operacional.
- [[patch-merge-clear-requires-explicit-empty]] — o outro gotcha de `events.patch` da mesma sessão.
- [[external-event-firewall]] — o mirror que gera esses eventos.

## Fontes

- raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
