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
- **`notes`**: máx 2000 chars, opcional.
- **`onDelete: Cascade`**: ao deletar um Appointment, seus `MessageLog`s são removidos.

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

- **Date string `yyyy-MM-dd`** é interpretada como **dia LOCAL** (00:00:00 → 23:59:59.999), não UTC. Necessário para timezones a oeste de UTC (Brasil) — sem isso, agendamentos depois da meia-noite UTC eram perdidos.
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
