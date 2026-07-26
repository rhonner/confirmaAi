---
type: session
date: 2026-07-25 00:28
branch: main
status: ingested
files_touched:
  - scripts/test-sprints.ts
  - src/app/(dashboard)/agenda/page.tsx
  - src/app/api/appointments/route.ts
  - src/app/api/integrations/google-calendar/event-signals/route.ts
  - src/hooks/use-api.ts
  - src/lib/services/google/calendar.ts
  - src/lib/services/google/promote-signals.ts
  - src/lib/validations/appointment.ts
  - tests/unit/gcal-calendar.test.ts
  - tests/unit/gcal-convert.test.ts
  - tests/unit/month-view-drag.test.tsx
---

# Sessão 2026-07-25-0028 — 4 fixes do code-review da agenda (commit `812289e`)

> ⚠️ Corpo reconstruído na ingestão de 2026-07-26 a partir do commit `812289e`, do
> `.context/` e da memória do projeto — o hook criou o arquivo só com o snapshot de
> arquivos. O detalhe operacional canônico está em `.context/features/appointments.md`
> § Retroativo e `.context/features/agenda-day-grid.md` § "Clique num evento do Google".

## Objetivo

Fechar os achados do code-review adversarial da rodada de 2026-07-24 (grade arrastável +
regras novas de agenda). **Sem migration** — só código e testes.

## Resultado — os 4 fixes

1. **Promoção decide por `isPrivate`, nunca pelo rótulo "Ocupado"** (o mais importante).
   `GcalEventDTO` passou a **exportar** `isPrivate: boolean` — o mapper já o calculava a
   partir de `visibility` e **descartava**. `canPromoteGoogleEvent` e `parseEventSignals`
   leem o booleano. Antes, comparar o título acoplava política a **copy pt-BR**: renomear
   "Ocupado" faria evento particular virar promovível **e** o `parseEventSignals` sugerir o
   próprio rótulo como nome do paciente → paciente "Ocupado" → **vaga vitalícia de quota
   queimada**. → [[redacted-label-is-copy-not-contract]]
2. **Retroativo nasce classificado.** O `Select` de status apareceu no diálogo de
   **criação** (antes só na edição) com default **"Confirmado"** e **sem "Pendente"**;
   `createAppointmentSchema` ganhou `status` opcional e o `POST` só o honra quando
   `retroactive` é true (futuro ignora e nasce `PENDING`). Motivo: `PENDING` é
   **transitório** num agendamento normal e **terminal** num retroativo (o cron pula
   retroativo) — cada backfill deixado em Pendente entrava no denominador de
   `noShowRate`/`confirmationRate` e diluía a métrica para sempre.
3. **Toast só na transição** ao arrastar para o passado: `rescheduleAppointment` compara o
   estado anterior com `isRetroactive(newStart)` e avisa **uma vez**, não a cada arraste.
4. **Fallback sem `htmlLink`**: `htmlLink` é `string | null`, então o handler do clique
   ganhou `else` com `toast.info` — um `if` sem `else` recriaria o "clico e não acontece
   nada" que originou a feature.

## Gate

`tsc` · vitest **444/444** · `build` · `test:sprints` **174/174**, com 2 checks novos:
**`MV.4`** (asserção **negativa** sobre o fonte sem comentários — o guard não pode voltar a
olhar o rótulo) e **`RT.6`** (status inicial do retroativo). Ver
[[regression-test-assert-the-predicate]].

## O que ficou pendente

Walk-through no browser — o gate prova estrutura e servidor, não a tela. Feito na sessão
seguinte: `raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md`.

> Fonte: commit `812289e` + `.context/features/{appointments,agenda-day-grid}.md`.
