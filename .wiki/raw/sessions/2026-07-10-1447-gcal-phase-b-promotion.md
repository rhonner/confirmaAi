---
type: session
date: 2026-07-10 14:47
branch: main
status: ingested
files_touched:
  - prisma/schema.prisma
  - scripts/test-sprints.ts
  - src/app/(dashboard)/agenda/page.tsx
  - src/app/api/integrations/google-calendar/events/route.ts
  - src/components/forms/patient-form-dialog.tsx
  - src/hooks/use-api.ts
  - src/lib/audit/labels.ts
  - src/lib/services/google/calendar.ts
  - prisma/migrations/20260710170250_add_external_event/
  - src/app/api/integrations/google-calendar/convert/
  - src/app/api/integrations/google-calendar/event-signals/
  - src/lib/services/google/promote-signals.ts
  - tests/unit/gcal-convert.test.ts
---

# Sessão 2026-07-10-1447 — Google Calendar Fase B: promoção manual (evento → agendamento)

## Objetivo da sessão

Implementar e validar a **Fase B** da integração Google Calendar: transformar um evento
do Google (que na Fase A era só um bloco read-only no overlay) em um **`Appointment`
gerenciado** ("Promover"), com matching de paciente e pré-preenchimento — a resposta
operacional à pergunta do dono "como um evento do Google vira paciente/agendamento?".

## Resultado

**Fase B (promoção manual) implementada, revisada e validada E2E.** Entregue:
- Modelo **`ExternalEvent`** (migration `20260710170250_add_external_event`) — persistido
  **lazy só na promoção** (não há full-sync). Link 1:1 idempotente com `Appointment`
  (`@@unique([userId, googleEventId])`, `appointmentId @unique`, cascade nos dois lados).
- **`POST /convert`** — gate `gcal.convert`; resolve paciente (patientId → telefone → CPF →
  criar novo via quota); cria `Appointment` PENDING + `ExternalEvent`; tx Serializable;
  idempotente sob corrida.
- **`POST /event-signals`** + `promote-signals.ts` (puro) + `fetchGoogleEventById`/
  `mapGoogleEventDetail` — extrai nome/telefone/e-mail do evento (`events.get` real) p/
  pré-preencher o diálogo; nunca vaza descrição crua; privado → sem sinais de nome.
- **De-dup do overlay** (`events/route.ts`) — evento promovido some do overlay.
- **UI**: botão "Promover" no `GoogleEventBlock` + diálogo modo-promoção + prefill do
  `PatientFormDialog` (`defaultValues`); hooks `useGoogleEventSignals`/`useGoogleCalendarConvert`.
- **Firewall estendido**: `scheduler.ts` nunca toca `ExternalEvent` (GCAL.10).

**Gate 100% verde:** tsc · vitest **343** · build · **test:sprints 139/139** (GCAL.8–11 novos).

**Code-review adversarial** (workflow: 7 dimensões × verificação independente, 11 agentes):
4 achados CONFIRMED, 0 refutados. Dimensões de firewall/de-dup, multi-tenancy, quota/matching
e privacidade/sinais **não acharam nada**. 3 corrigidos + 1 documentado (ver decisões).

**E2E real** (Chrome MCP, dev :3001, credencial wcwecalc): prefill nome+telefone via
`events.get` real, criar paciente → auto-seleção → promover → PENDING, de-dup no overlay,
firewall (evento intacto no Google). DB conferido (TZ 17:30 BRT = 20:30 UTC). Dados revertidos.

**Não commitado** (dono faz via `gh`). **Sync contínuo (B2) NÃO iniciado.**

## Decisões / aprendizados

- **`ExternalEvent` é populado LAZY (só na promoção), não por sync.** Full-sync incremental
  fica para B2. O comentário no schema deixa explícito para não induzir a achar que há pull.
- **Firewall vale para a Fase B também:** o scheduler nunca lê `ExternalEvent`. Um evento só
  recebe WhatsApp/no-show DEPOIS de virar `Appointment` por promoção — que é o desejado.
- **Idempotência de corrida (fix do review):** no catch do `/convert`, para qualquer
  P2002/P2034 checar `alreadyPromotedResponse()` ANTES das mensagens de conflito de paciente.
  Sem isso, o perdedor de uma corrida que recria o mesmo paciente novo (P2002 telefone) recebia
  "paciente já existe" para um evento que, na verdade, acabara de ser promovido pelo vencedor.
- **Guard de sinais assíncronos obsoletos (fix do review):** o `onSuccess` do `event-signals`
  repovoava `newPatientDefaults` mesmo se o usuário já tivesse trocado/fechado o evento →
  vazava nome/telefone de um evento abandonado para outro fluxo ("Novo Agendamento" limpo).
  Fix: `ref` espelhando `promoteEvent`; só aplica se `promoteEventRef.current?.id === event.id`.
- **Teste de regressão não pode ser tautológico (fix do review):** GCAL.9 fazia grep de
  `externalEvent.findMany` — um filtro invertido passaria. Agora assere o predicado real
  `!promotedIds.has`.
- **Double-booking por corrida (documentado, não corrigido):** o conflito de horário é
  checado FORA da tx (cliente global) → a tx Serializable NÃO protege contra dois `/convert`
  simultâneos de eventos diferentes no mesmo horário. É **classe pré-existente idêntica ao
  `POST /appointments`**; endurecer exige constraint de exclusão no DB (mudança app-wide).
  Comentário no código deixa a limitação explícita para não confundir o wrapper Serializable
  com proteção de double-booking.
- **Frontend usa só o caminho `patientId` do convert** (cria o paciente antes via
  `PatientFormDialog` e vincula). O caminho `patient:{...}` interno do convert existe para a
  API mas não é exercido pela UI hoje.
- **Aprendizado de E2E (Google Calendar UI):** criar evento via URL-template
  `calendar/u/2/r/eventedit?text=...&dates=...&ctz=America/Sao_Paulo` é bem mais confiável que
  digitar no popup de criação rápida (que teve problema de foco). `u/2` seleciona a conta
  wcwecalc no perfil Chrome. Confirmar a conta pelo avatar/"Minhas agendas: WeCalc".
- **Não apagar evento do Google com convidados** (ex.: "teste2" tem rhonner.matheus como
  guest) — deletar dispararia e-mail de cancelamento ao convidado. Deixado intacto.

## Para ingerir na wiki

- [ ] Conceito: **promoção manual evento→agendamento** (design + por que não auto-criar
      paciente; matching por telefone→CPF→patientId).
- [ ] Conceito/atualização: **firewall `ExternalEvent`** estendido à Fase B (scheduler nunca lê).
- [ ] Conceito: **idempotência de promoção sob corrida** (checar já-promovido antes de erro
      de paciente; P2002/P2034).
- [ ] Conceito: **guard de resposta assíncrona obsoleta** (padrão ref-espelho p/ mutobserver
      que sobrevive a troca de contexto na UI).
- [ ] Gotcha: **teste de regressão tautológico** (grep de chamada ≠ grep do predicado que
      carrega o comportamento).
- [ ] Gotcha (pré-existente, reconfirmado): **conflito de horário fora da tx** — Serializable
      não protege double-booking; vale p/ `/convert` e `POST /appointments`.
- [ ] Gotcha de E2E: criar evento no Google Calendar via URL-template (confiável) + não
      apagar eventos com convidados.
- [ ] Atualizar synthesis de estado do Google Calendar: Fase B (promoção) done; B2 (sync
      contínuo) pendente.

## Addendum — 2º code-review (xhigh, antes do commit)

Rodado um 2º review (workflow xhigh, 20 agentes) sobre o diff completo (a 1ª rodada foi antes dos 3 fixes). Resultado: **1 falso-positivo + 3 fixes menores + 2 limitações documentadas**.
- **Falso-positivo (descartado):** "promover evento de dia-inteiro cria agendamento à meia-noite/120min". Não procede — dia-inteiro renderiza no bloco pinado SEM `canPromote`/`onPromote`; só eventos cronometrados têm "Promover", então `handleOpenPromote` nunca roda para dia-inteiro. (Dois verificadores discordaram; o que confirmou não checou o split pinado×grade. Resolvido lendo o código: `agenda/page.tsx` ~956 vs ~962.)
- **Fixes aplicados:** (a) `suggestedEmail` era parseado mas **nunca** chegava ao form de novo paciente → `newPatientDefaults` agora carrega `email`; (b) título só-prefixo ("Consulta 11 99999-8888" ou "Consulta") sugeria "Consulta" como nome → `AGENDA_PREFIX` agora usa `(\s+|$)` (+2 testes); (c) mensagem de colisão de paciente duplicada em 2 branches do `/convert` → helper `patientCollisionResponse`.
- **Limitações aceitas/documentadas** (§ Limitações conhecidas no `.context`): evento não-privado literalmente "Ocupado" não mostra "Promover"; telefone só-na-descrição some se abrir "Novo Paciente" antes do enrich assíncrono.
- Gate reconfirmado: tsc · vitest **345** · build · sprints **139/139**. (Obs: rodar `test:sprints` concorrente com o vitest de integração dá erro de Prisma por contenção no DB local — rodar isolado.)

## Arquivos modificados (snapshot do hook)

  - prisma/schema.prisma
  - scripts/test-sprints.ts
  - src/app/(dashboard)/agenda/page.tsx
  - src/app/api/integrations/google-calendar/events/route.ts
  - src/components/forms/patient-form-dialog.tsx
  - src/hooks/use-api.ts
  - src/lib/audit/labels.ts
  - src/lib/services/google/calendar.ts
  - prisma/migrations/20260710170250_add_external_event/
  - src/app/api/integrations/google-calendar/convert/
  - src/app/api/integrations/google-calendar/event-signals/
  - src/lib/services/google/promote-signals.ts
  - tests/unit/gcal-convert.test.ts
