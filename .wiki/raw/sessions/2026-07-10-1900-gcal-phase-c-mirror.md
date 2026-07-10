---
type: session
date: 2026-07-10 19:00
branch: main
status: ingested
tags: [google-calendar, phase-c, mirror, oauth-write-scope, e2e]
files_touched:
  - prisma/schema.prisma (+ migration 20260710195220_add_appointment_google_event)
  - src/lib/services/google/oauth.ts
  - src/lib/services/google/calendar.ts
  - src/lib/services/google/mirror.ts (novo)
  - src/lib/billing/entitlements.ts
  - src/lib/audit/labels.ts
  - src/app/api/appointments/route.ts
  - src/app/api/appointments/[id]/route.ts
  - src/app/api/patients/[id]/route.ts
  - src/app/api/integrations/google-calendar/{events,convert,status}/route.ts
  - src/hooks/use-api.ts
  - src/components/settings/google-calendar-connection.tsx
  - src/lib/legal/content.ts
  - scripts/test-sprints.ts
  - scripts/gcal-list-raw.ts (novo)
  - tests/unit/gcal-calendar.test.ts
  - tests/unit/gcal-oauth.test.ts
  - .context/features/google-calendar.md
  - .context/README.md
---

# Sessão 2026-07-10-1900 — Google Calendar Fase C (espelhar Appointment → Google)

## Objetivo da sessão

Implementar a **Fase C**: um `Appointment` criado/editado/cancelado/excluído no ConfirmaAí é espelhado como evento no Google Calendar do tenant (pedido do dono ao notar que a integração era mão-única Google→app).

## Resultado

Fase C implementada, gate verde, code-review adversarial + 3 fixes, e **validada E2E com credencial REAL e escopo de ESCRITA** (Chrome MCP, wcwecalc). Não commitada (dono via `gh`). Detalhe operacional completo em `.context/features/google-calendar.md` § Fase C — este raw é só o resumo cruzado.

## Decisões (do dono, via AskUserQuestion)

1. Escreve na **agenda principal** (`primary`) → escopo só `calendar.events` (sem seletor de calendário, que exigiria `calendar.readonly` extra).
2. **Ligado automaticamente ao conectar** (sem toggle opt-in).
3. **Só ações no app (v1)** — webhook (confirmação do paciente) e cron (no-show) não mexem no evento (fica p/ B2; evita chamadas ao Google no ack do webhook e no orçamento de 45s do cron — pergunta do dono "o que é o orçamento de 45s" respondida no chat).
4. Cancelar/excluir/no-show → **apaga** o evento no Google.

## Decisões / aprendizados

- **Arquitetura**: primitivos de escrita em `calendar.ts` (não tocam `Appointment` → mantém o check de firewall GCAL.7); orquestração em `mirror.ts` (novo) via `next/server` `after()` → best-effort pós-resposta, nunca quebra/500 a mutação nem lança. Ver [[external-event-firewall]] (estendido à Fase C).
- **Escopo OAuth** `calendar.events.readonly` → `calendar.events` (write): `hasCalendarScope` aceita os dois (leitura), `hasWriteScope` só o de escrita. O maior risco de regressão era `hasCalendarScope` chocar exato no literal readonly → todo consent de escrita seria falso scope-mismatch (pego pelo mapa de leitura pré-implementação).
- **Anti-loop nos dois sentidos**: tag `extendedProperties.private.confirmaaiOrigin=app` (dropada em `mapGoogleEvent`) + de-dup por `Appointment.googleEventId` + `/convert` rejeita origem-app; mirror ignora promovidos (`ExternalEvent`).
- **Id determinístico** (`appOriginEventId` = base32hex de sha256(appointmentId)) → insert idempotente (409).
- **2 gotchas do Google API** viraram conceitos: [[revive-cancelled-event-on-id-reuse]] (409 na reabertura ≠ vivo; ressuscitar tombstone via `patch status:"confirmed"`) e [[patch-merge-clear-requires-explicit-empty]] (`events.patch` merge → `description:""` p/ limpar).
- **Processo**: workflow de "understand" (7 readers) mapeou o código ANTES de codar; implementação direta (edições interdependentes = não é fan-out); workflow de code-review adversarial (7 dim × verificação) achou 3 bugs reais (todos corrigidos) + 2 falso-positivos; E2E real fechou.
- **Verificação E2E server-to-server**: `scripts/gcal-list-raw.ts` usa o token da conexão + `events.list?privateExtendedProperty=confirmaaiOrigin=app&showDeleted=true` → confere create/patch/delete direto na API do Google (vê tombstones), mais confiável que raspar a UI do calendar.google.com.

## Gate

tsc · vitest **357** · build · test:sprints **143/143** (GCAL.12–15 novos). Rodar `test:sprints` isolado (contenção no DB local com o vitest de integração).

## E2E real (Chrome MCP, dev :3001, wcwecalc, escopo de ESCRITA — dono deu o consent)

Reconexão (readonly→write) → card "espelhados automaticamente". Conferido contra a Google Agenda real: create (form) → evento confirmed/TZ/summary/desc/tag/id; cancelar → apagado + `googleEventId` limpo; reabrir → **ressuscitado**; reagendar+limpar-obs → movido + desc limpa; excluir → removido; renomear paciente → summary atualizado; de-dup ao vivo (espelho nunca vira bloco "Promover"). Dados de teste revertidos; conexão da wcwecalc deixada CONNECTED com escopo de escrita (refresh 7d).

## Para ingerir na wiki

- [x] +2 concepts: `revive-cancelled-event-on-id-reuse`, `patch-merge-clear-requires-explicit-empty`
- [x] atualizado `external-event-firewall` (firewall nos 2 sentidos)
- [x] atualizado synthesis `google-calendar-integration-state` (Fase C done)

## Addendum — debug pós-implementação (gotcha de suporte)

O dono reportou "criei um agendamento e não espelhou". Investigado: **espelhou sim** — o `Appointment` mais recente tinha `googleEventId` gravado e o evento estava vivo na agenda da wcwecalc (confirmado via `scripts/gcal-list-raw.ts`). Dois aprendizados operacionais (comportamentos CORRETOS que parecem bug):

1. **No-op silencioso em grant só-leitura (legado):** agendamentos criados ANTES do reconsent com escopo de escrita ficam sem espelho (mirror faz no-op, sem `hasWriteScope`); backfill é preguiçoso (só ao editar). Não é bug — é a fronteira do timestamp do reconsent.
2. **Evento na conta CONECTADA ≠ conta de login/padrão do navegador:** o espelho vai pro `primary` da conta Google conectada (wcwecalc), não da conta ativa do Chrome (rhonner/u0). Olhar a conta errada = falso "não espelhou". Reforça [[claude-chrome-per-profile-extension]].

Registrado em `.context/features/google-calendar.md` § "Diagnóstico / gotchas de suporte (Fase C)". Sem página de conceito nova (gotcha de conta já coberto).
