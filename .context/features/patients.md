# Feature: Pacientes

> CRUD de pacientes vinculados a um usuário (clínica). Cada paciente tem nome + WhatsApp obrigatórios. Suporta paginação, busca e exportação CSV.

## Arquivos que compõem a feature

| Camada              | Caminho                                                |
| ------------------- | ------------------------------------------------------ |
| Rota lista/criar    | `src/app/api/patients/route.ts`                        |
| Rota item           | `src/app/api/patients/[id]/route.ts`                   |
| Rota export         | `src/app/api/patients/export/route.ts`                 |
| Validação Zod       | `src/lib/validations/patient.ts`                       |
| Hook React Query    | `src/hooks/use-api.ts` → `usePatients`, `usePatientsPaginated`, `useCreatePatient`, `useUpdatePatient`, `useDeletePatient` |
| Página              | `src/app/(dashboard)/pacientes/page.tsx`               |
| Componentes         | `src/components/forms/patient-form-dialog.tsx`, `patient-combobox.tsx`, `src/components/ui/phone-input.tsx` |
| CSV helper          | `src/lib/csv.ts`                                       |
| Tipo                | `PatientResponse` em `src/lib/types/api.ts`            |
| Modelo Prisma       | `Patient` em `prisma/schema.prisma`                    |

## Regras de negócio

- **Nome**: 3–200 chars.
- **Telefone**: regex `/^\+55\d{10,11}$/` (Brasil, 10 ou 11 dígitos após +55). **Único por usuário** (`@@unique([userId, phone])`). P2002 → erro "Telefone já cadastrado para este usuário".
- **Email** opcional, máx 320 chars, validado como email se presente.
- **Notes** opcional, máx 2000 chars.
- **Strings vazias** (`""`) em `email`/`notes` são convertidas para `undefined` antes da validação no POST.
- **Não pode deletar paciente com agendamentos futuros** (`dateTime >= now` e `status NOT IN (CANCELED, NO_SHOW)`).
- **`onDelete: Cascade`**: ao deletar um Paciente, seus Appointments (e MessageLogs) são removidos.

## Endpoints

| Método | Path                       | Body / Query                                     | Resposta                            |
| ------ | -------------------------- | ------------------------------------------------ | ----------------------------------- |
| GET    | `/api/patients`            | `?search=&page=&limit=` (paginado se `page` presente) | `ApiResponse<PatientResponse[]>` ou `PaginatedResponse<PatientResponse>` |
| POST   | `/api/patients`            | `CreatePatientInput`                             | `ApiResponse<PatientResponse>` 201  |
| GET    | `/api/patients/[id]`       | —                                                | `ApiResponse<PatientResponse>`      |
| PUT    | `/api/patients/[id]`       | `UpdatePatientInput`                             | `ApiResponse<PatientResponse>`      |
| DELETE | `/api/patients/[id]`       | —                                                | `ApiResponse<null>`                 |
| GET    | `/api/patients/export`     | —                                                | CSV (`Content-Type: text/csv`)      |

### Enriquecimento de listagem

A rota lista enriquece cada paciente com:
- `_count.appointments` (total de agendamentos via `include`)
- `noShowCount` (count de status=`NO_SHOW`, calculado via `groupBy` em batch — evita N+1)

## Pontos sensíveis

- **Multi-tenancy**: `where.userId = session.user.id` SEMPRE.
- **Busca**: `name` e `email` com `mode: "insensitive"`; `phone` com `contains` (case já é só dígitos).
- **Paginação**: `limit` clampado a `[1, 100]`, default 20.
- **Search debounced** no frontend com `useDebounce` (`src/hooks/use-debounce.ts`).
- **Combobox de paciente** (`patient-combobox.tsx`) usa `cmdk`; selecionável em formulário de agendamento.

## Como estender

- **Adicionar campo (ex: `birthdate`)**: schema Prisma → migrate → `createPatientSchema`/`updatePatientSchema` → `PatientResponse` (já é `Patient` direto, atualiza automaticamente) → form `patient-form-dialog.tsx` → CSV em `src/lib/csv.ts` se quiser exportar.
- **Filtros adicionais na listagem**: parse em `searchParams` e adicionar em `where` no GET.
