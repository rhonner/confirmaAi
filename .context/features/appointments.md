# Feature: Agendamentos

> CRUD de agendamentos com detecção de conflito por sobreposição de horário, status workflow, e visualização semanal/diária.

## Arquivos que compõem a feature

| Camada              | Caminho                                                |
| ------------------- | ------------------------------------------------------ |
| Rota lista/criar    | `src/app/api/appointments/route.ts`                    |
| Rota item           | `src/app/api/appointments/[id]/route.ts`               |
| Rota export         | `src/app/api/appointments/export/route.ts`             |
| Validação Zod       | `src/lib/validations/appointment.ts`                   |
| Service conflito    | `src/lib/services/conflict.ts`                         |
| Hook React Query    | `src/hooks/use-api.ts` → `useAppointments`, `useCreateAppointment`, `useUpdateAppointment`, `useDeleteAppointment` |
| Página              | `src/app/(dashboard)/agenda/page.tsx`                  |
| Tipo                | `AppointmentResponse` em `src/lib/types/api.ts`        |
| Modelo Prisma       | `Appointment` em `prisma/schema.prisma`                |

## Regras de negócio

- **Status (enum `AppointmentStatus`)**: `PENDING` → `CONFIRMED` | `NOT_CONFIRMED` | `CANCELED` | `NO_SHOW`.
- **Default**: `PENDING`. Default `durationMinutes`: `30`.
- **Range de duração**: 5–480 minutos.
- **Não permite agendar no passado**: `dateTime < now` → `400 "Não é possível agendar no passado"`.
- **Conflito**: detectado por `findConflictingAppointment` em `src/lib/services/conflict.ts`. Sobreposição `[start, end)`. Ignora `CANCELED` e `NO_SHOW`. Janela de busca: 480 min antes do `start` (maior duração permitida).
- **Conflito retorna `400 "Conflito com agendamento de <nome do paciente>"`**.
- **Update mexe em conflito apenas se `dateTime` ou `durationMinutes` mudarem** (otimização, ignora outras edições).
- **`patientId`** ao criar/editar é validado: deve pertencer ao mesmo usuário.
- **`notes`**: máx 2000 chars, opcional. **UI (2026-06-27, feedback da sócia)**: o `<Textarea>` de Observações em `agenda/page.tsx` agora tem `maxLength={2000}` (impede digitar/colar além do limite já de cara, antes só validava no submit), `className="max-h-40 resize-none overflow-y-auto"` (texto grande **rola dentro** do campo em vez de estourar o Dialog — bug do `field-sizing-content` sem `max-h`), contador `X/2000` (vermelho ao atingir o limite) e exibição de `errors.notes`. O schema local do form também ganhou `.max(2000)`. O `DialogContent` da agenda ganhou `max-h-[85vh] overflow-y-auto` (defesa em profundidade). Validado no Chrome MCP: colar ~2500 chars → campo rola internamente, contador 2519/2000 em vermelho, Dialog intacto.
- **`onDelete: Cascade`**: ao deletar um Appointment, seus `MessageLog`s são removidos.
- **Visualização Dia/Semana (2026-06-27, rodada 2 do feedback da sócia)**: `agenda/page.tsx` tem um toggle **Dia ⇄ Semana** (`viewMode`, padrão `week`, persistido em `localStorage["agenda-view-mode"]` via efeito — não no init, p/ não quebrar hydration). No modo **Dia** renderiza só o dia âncora (`anchorDate`), "Hoje" foca o dia atual sem scroll (a dor relatada: no modo Semana o dia de hoje fica no fim e exige scroll), navegação `Anterior/Próximo` anda de dia em dia, label vira "sábado, 27 de junho" (`first-letter:uppercase`), empty-state "Nenhum agendamento neste dia". No modo **Semana** é o comportamento antigo (7 cards, navegação por `addWeeks`). A query usa `startDate===endDate` (dia) vs intervalo da semana. Bônus: "Novo Agendamento" no modo Dia já abre com a Data = dia visto. Validado no Chrome MCP (toggle, navegação, Hoje, criação/edição/exclusão).

## Endpoints

| Método | Path                            | Body / Query                                                                                  | Resposta                                                          |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/appointments`             | `?date=YYYY-MM-DD` ou `?startDate=&endDate=` (dia local), `?status=`, `?patientId=`, `?page=&limit=` | `ApiResponse<AppointmentResponse[]>` ou `PaginatedResponse<...>` |
| POST   | `/api/appointments`             | `CreateAppointmentInput`                                                                      | `ApiResponse<AppointmentResponse>` 201                            |
| GET    | `/api/appointments/[id]`        | —                                                                                             | `ApiResponse<AppointmentResponse>`                                |
| PUT    | `/api/appointments/[id]`        | `UpdateAppointmentInput`                                                                      | `ApiResponse<AppointmentResponse>`                                |
| DELETE | `/api/appointments/[id]`        | —                                                                                             | `ApiResponse<null>`                                               |
| GET    | `/api/appointments/export`      | —                                                                                             | CSV                                                               |

## Pontos sensíveis

- **Date string `yyyy-MM-dd`** é interpretada como **dia em `America/Sao_Paulo`** (00:00:00 → 23:59:59.999 BRT), via `startOfDayInAppTz`/`endOfDayInAppTz` de `@/lib/timezone`. **Não** usar `new Date(y, m, d, 0, 0, 0, 0)` — em runtime UTC (Vercel) isso vira meia-noite UTC = 21:00 BRT do dia anterior, drift de 3h.
- **Export CSV**: `dt.toLocaleDateString/Time` antigos não passavam `timeZone` e renderizavam em UTC no Vercel. Hoje usa `formatInTimeZone(dt, APP_TIMEZONE, ...)` para data e hora.
- **Export CSV é entitlement pago** (`checkEntitlement(userId, "export.csv")` → 402 `PLAN_REQUIRED` no Free). **Front (2026-06-29, feedback da sócia)**: o botão deixou de ser um `<a href download>` cru — virou `src/components/billing/export-csv-button.tsx` (`<ExportCsvButton url="/api/appointments/export" />`, mesmo componente em `pacientes/page.tsx`). Antes, no Free, o browser mostrava uma falha de download genérica ("Erro de servidor desconhecido"). Agora o clique faz `fetch`: `401` → `signOut` (igual ao `fetchApi`); `402` → abre `PaywallModal` (variant **soft**, dismissível) com reason/upgrade do corpo (reason validado contra a lista conhecida do modal p/ não crashar em `meta.title`); `ok` → baixa via Blob (filename do `Content-Disposition`); erro → toast amigável. Botão mostra spinner "Exportando…" (`aria-busy`) durante o fetch. Usuário Free vê **cadeado** (gate em `!usage.isLoading` p/ PRO não ver cadeado piscando no load). Achados endereçados na code-review xhigh 2026-06-29. Validado no Chrome MCP (Free→paywall 402, Pro→download 200).
- **`dateTime`** chega como ISO string (`z.string().datetime()`); convertido com `new Date(dateTime)`.
- **Includes padrão**: `patient { id, name, phone }` e `messageLogs` (orderBy `sentAt: desc`).
- **Multi-tenancy**: tudo filtrado por `userId: session.user.id`.
- **Lifecycle automático**:
  - `confirmationSentAt` → setado pelo cron `sendConfirmations` (ver `features/scheduler.md`).
  - `reminderSentAt` → setado pelo cron `sendReminders`.
  - `confirmedAt` + `status=CONFIRMED` → setado pelo webhook quando paciente responde "1/sim/...".
  - `status=CANCELED` → setado pelo webhook quando paciente responde "2/não/...".
  - `status=NO_SHOW` → setado pelo cron `markNoShows` para `PENDING` cuja `dateTime < now`.

## Fluxos relacionados

- [flows/confirmation-flow.md](../flows/confirmation-flow.md) — fluxo completo de confirmação.

## Como estender

- **Novo status**: adicionar no enum `AppointmentStatus` no Prisma → migrate → `appointmentStatusValues` em validations → tratar nas UIs (`getStatusColor`/`getStatusLabel` em `agenda/page.tsx` e `dashboard/page.tsx`).
- **Recorrência**: requer novo modelo (`AppointmentSeries` ou similar) + lógica para gerar instâncias. Mexe em conflict, dashboard, scheduler.
- **Relembrar de novos campos**: passar pelo Zod schema E pelo `updateData` no PUT (atualização parcial explícita, não `...validation.data`).
