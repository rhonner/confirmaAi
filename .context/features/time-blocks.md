# Feature: Horário bloqueado (TimeBlock)

> Reservar um período na agenda **sem paciente** (almoço, reunião, férias, folga).
> Aparece na agenda como bloco hachurado e é espelhado no Google Calendar como um
> evento SEM convidados. Feature 2026-07-24.

## Decisão que governa tudo: NÃO é um Appointment (firewall)

Um bloqueio é modelado numa tabela **separada** (`TimeBlock`), não como `Appointment`
com paciente nulo. Motivo: o scheduler (`sendConfirmations`/`sendReminders`/`markNoShows`
em `src/lib/services/scheduler.ts`) varre **somente** `Appointment`. Se um bloqueio
entrasse ali, herdaria o maquinário automático (viraria alvo de WhatsApp para número
inexistente e seria varrido para `NO_SHOW`, corrompendo a métrica de faltas — que é o
produto). Mesmo princípio de firewall do `ExternalEvent`. **Invariante duro (check TB.2):
`scheduler.ts` NUNCA referencia `TimeBlock`.**

Além disso, `Appointment.patientId` é FK obrigatória — um "agendamento sem paciente"
quebraria conflito, dashboard, confirmação e todo o resto. Tabela separada é mais limpa.

## Bloqueio é SUAVE (só avisa, não impede)

Ao criar/arrastar um agendamento que **sobrepõe** um bloqueio, a UI abre um **modal de
confirmação** ("Horário bloqueado — quer agendar mesmo assim?"). O bloqueio **não impede**
o agendamento; é um lembrete. A detecção de sobreposição é **client-side** (o backend não
mostra modal) sobre os bloqueios já carregados na janela visível da agenda.

## Arquivos

| Camada                | Caminho                                                        |
| --------------------- | -------------------------------------------------------------- |
| Modelo Prisma         | `TimeBlock` em `prisma/schema.prisma`                          |
| Migration             | `prisma/migrations/20260724160036_add_time_block/`             |
| Validação Zod         | `src/lib/validations/time-block.ts`                            |
| Rota lista/criar      | `src/app/api/time-blocks/route.ts` (GET por range + POST)      |
| Rota item             | `src/app/api/time-blocks/[id]/route.ts` (PUT, DELETE)          |
| Hooks React Query     | `src/hooks/use-api.ts` → `useTimeBlocks`, `useCreateTimeBlock`, `useUpdateTimeBlock`, `useDeleteTimeBlock` + type `TimeBlock` |
| Tipo                  | `TimeBlockResponse` em `src/lib/types/api.ts`                  |
| Espelho no Google     | `syncTimeBlockCreate/Update/Delete` + `blockEventInput` em `src/lib/services/google/mirror.ts` |
| UI (agenda)           | Botão "Bloquear horário" + diálogo criar/editar + AlertDialog de exclusão + modal de aviso em `src/app/(dashboard)/agenda/page.tsx`; render arrastável em `src/components/agenda/day-grid.tsx` |
| Checks de regressão   | `TB.1`, `TB.1b`, `TB.2`, `TB.3` em `scripts/test-sprints.ts`   |

## Modelo `TimeBlock`

```prisma
model TimeBlock {
  id               String   @id @default(cuid())
  userId           String
  dateTime         DateTime
  durationMinutes  Int      @default(60)
  title            String   @default("Bloqueado")
  googleEventId    String?    // id do evento espelho (null = ainda não espelhado)
  googleCalendarId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId]) @@index([dateTime])
}
```
- **NÃO** está em `AUDITED_MODELS` (dado operacional do próprio tenant, sem PII de terceiros).
- `title` opcional na UI → o default do schema `"Bloqueado"` aplica quando omitido.
- Duração até **1440 min** (dia inteiro), para permitir bloquear férias/feriado.

## Regras de negócio

- **Multi-tenancy**: tudo filtrado por `userId: session.user.id` (create/list/update/delete).
  PUT/DELETE verificam ownership (`findFirst { id, userId }`) antes de mutar.
- **GET valida datas**: `?startDate/endDate/date` (yyyy-MM-dd, dia local `America/Sao_Paulo`
  via `startOfDayInAppTz`/`endOfDayInAppTz`). Data malformada → **400** (não 500 — a rota
  parseia com guarda `isNaN(getTime())`, achado do code-review 2026-07-24).
- **Espelho no Google (Fase C)**: best-effort via `after()` (nunca quebra a mutação). Gate =
  `mirroringEnabled` (conexão `CONNECTED` + `hasWriteScope` + `gcal.push` PREMIUM). Reusa as
  primitivas de `calendar.ts`: id determinístico `appOriginEventId(blockId)` + tag
  `extendedProperties.private.confirmaaiOrigin="app"` → o evento do bloqueio **nunca reaparece
  no overlay** (o `mapGoogleEvent` dropa origem-app) — sem loop. Evento **sem `attendees`**
  (o paciente não é convidado; aliás não há paciente). DELETE lê o `googleEventId` ANTES do
  hard-delete. `title` = summary do evento no Google.
- **Sem colisão de id com Appointment**: `appOriginEventId(id) = "cai"+sha256(id)`; ids de
  `TimeBlock` e `Appointment` são cuids distintos → hashes distintos.

## Integração na agenda (`agenda/page.tsx`)

- Botão **"Bloquear horário"** (outline, ícone de cadeado) ao lado de "Novo Agendamento".
- Diálogo próprio (estado local, sem RHF): Título opcional (placeholder "Bloqueado"), Data,
  Horário (`TimeSelect`), Duração (15 min … Dia inteiro). "Bloquear" desabilitado até haver
  data+hora. Editar reusa o mesmo diálogo (com "Excluir").
- **`useTimeBlocks({startDate, endDate})`** busca a MESMA janela dos agendamentos. Bloqueios
  NÃO passam pelos filtros de status/paciente (são contexto estrutural).
- **Render**: modo **Dia** = bloco hachurado arrastável na grade (`day-grid.tsx`, ver
  `agenda-day-grid.md`); modo **Semana** = linha hachurada na lista (clique → editar); modo
  **Mês** = (ainda não renderizado — ver Débito; mas o **aviso** de sobreposição já funciona
  lá, porque o arraste entre dias do Mês reusa `rescheduleAppointment`).
- **Aviso de sobreposição** (`overlappingBlockFor` + estado `blockedConfirm`): no `onSubmit`
  de criar/editar agendamento (quando horário/duração é novo ou mudou) e no arraste
  (`rescheduleAppointment`). O `AlertDialog` usa botões `<Button>` puros (não
  `AlertDialogAction/Cancel`) para NÃO fechar via Radix — só o `setBlockedConfirm(null)`
  fecha; `onOpenChange(false)` (ESC/backdrop) é tratado como "Voltar". `proceed` aplica a
  ação; `onDismiss` reverte (no arraste, invalida `["appointments"]` para o card voltar ao
  lugar). **Editar só observações NÃO reabre o aviso** (guard `scheduleChanged`).

## Validação manual no browser (2026-07-24 — Chrome MCP, dev :3001, conta PREMIUM)

Walk-through completo: criar bloqueio ("Almoço" 12:00) → toast + bloco hachurado; arrastar
bloqueio 12:00→09:00 (persistiu); criar bloqueio ("Bloqueado" 10:00) e agendar Ana Costa
10:00 em cima → **modal "Horário bloqueado"** → "Agendar mesmo assim" → criado (agendamento
e bloqueio lado a lado por colunas de sobreposição); arrastar agendamento 10:00→12:30
(persistiu, SEM diálogo espúrio); estender agendamento por resize (12:30→14:00); arrastar
sobre bloqueio + "Voltar" → agendamento permaneceu no lugar (nada mutado); tap num bloqueio
→ diálogo de edição pré-preenchido; "Excluir" → confirmação → removido. GET com
`?startDate=abc` → 400. Dados de teste revertidos ao fim.

## Code-review adversarial (workflow, 5 dimensões × verificação, 2026-07-24)

8 CONFIRMED / 2 refutados. Fixes aplicados: (#1) GET valida datas → 400; (#2) arraste decide
pela **mudança real do valor com snap** (não pixel) — micro-tremor de toque vira edição, não
reagendamento no-op; `touch-action: pan-y` deixa rolar a página no touch; `pointercancel`
aborta; (#3) clique-fantasma pós-arraste suprimido (`suppressClickRef`); (#4/#6/#8) props do
DayGrid **memoizadas** no pai (senão o `pending` anti-flicker era limpo a cada re-render).
Ver `agenda-day-grid.md`.

## ⚠️ Débito / limitações aceitas

1. **Mês não renderiza bloqueios** ainda (só Dia e Semana) — embora o **aviso** de
   sobreposição já dispare ao arrastar um agendamento entre dias no Mês (validado E2E em
   2026-07-24). Follow-up: passar `blocksByDay` ao `MonthView` como chips/pontos cinza.
2. **Aviso só cobre a janela carregada**: agendar (pelo formulário) numa **data fora** do
   intervalo visível da agenda não dispara o aviso (os bloqueios daquela data não estão
   carregados). O agendamento é criado normalmente. Aceito — o aviso é conveniência suave;
   endurecer exigiria checar sobreposição no backend (POST /appointments).
3. **Mirror de bloqueio NÃO validado E2E com credencial Google real** (a conta de teste não
   estava conectada). O código reusa as primitivas já validadas da Fase C; validar quando
   houver conta PREMIUM conectada com escopo de escrita.

## Como estender

- **Renderizar no Mês**: passar `blocksByDay` ao `MonthView` + render de chip cinza.
- **Recorrência de bloqueio** (ex.: almoço todo dia): novo modelo/série (mesma discussão de
  recorrência de `Appointment`).
- **Aviso server-side**: mover a detecção de sobreposição para `POST /appointments` com um
  flag `confirmBlocked` no body (hoje é client-side).

## Fluxos relacionados

- [features/appointments.md](appointments.md) — grade Dia arrastável + aviso de sobreposição.
- [features/agenda-day-grid.md](agenda-day-grid.md) — o componente de grade e a interação.
- [features/google-calendar.md](google-calendar.md) — o espelho reusa `mirror.ts`/`calendar.ts`.
