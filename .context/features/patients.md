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
- **Telefone**: regex `/^\+55\d{10,11}$/` (Brasil, 10 ou 11 dígitos após +55). **Único por usuário** (`@@unique([userId, phone])`). Backend persiste também `phoneCanonical` (apenas dígitos) para hashing de quota. P2002 → erro "Telefone já cadastrado para este usuário".
- **`PhoneInput` (`ui/phone-input.tsx`) — round-trip canônico ↔ display**: o `value` é sempre canônico (`+55…`) e o display é o local formatado (`(11) 99999-9999`); `onChange` devolve canônico via `toCanonicalPhone`. **Bug corrigido (2026-06-27, rodada 2 — relato da sócia "fica aplicando 5 repetidamente")**: `getLocalDigits` só removia o `55` quando o total tinha > 11 dígitos; enquanto digitando, o canônico é curto (≤ 11), então o `+55` que `toCanonicalPhone` prefixa era relido como DDD `55` e mais um `+55` era prefixado a cada tecla — digitar "1" virava "(55) 1" e os `5` acumulavam. Fix: `getLocalDigits` também tira o `55` quando o valor tem `+` explícito (canônico), preservando números de **DDD 55** digitados sem `+` (ex: Santa Maria/RS). Coberto por `tests/unit/phone.test.ts` (helpers + round-trip + DDD-55) **e** `tests/unit/phone-input.test.tsx` (componente real via Testing Library, pega regressão na fiação value↔onChange). Validado no Chrome MCP.
- **CPF** (Sprint 2 — `plan-quota.md`): validado por DV, canonicalizado (apenas dígitos). Persistido em `Patient.cpf` e `Patient.cpfHash`. **Obrigatório no plano Free** (rejeitado pelo backend com 402 + reason `CPF_REQUIRED`). Único por user (`@@unique([userId, cpfHash])`). Mudança de CPF não é permitida via PUT (só excluir/recadastrar).
- **Email** opcional, máx 320 chars, validado como email se presente.
- **Notes** opcional, máx 2000 chars.
- **Strings vazias** (`""`) em `email`/`notes` são convertidas para `undefined` antes da validação no POST.
- **Não pode deletar paciente com agendamentos futuros** (`dateTime >= now` e `status NOT IN (CANCELED, NO_SHOW)`).
- **`onDelete: Cascade`**: ao deletar um Paciente, seus Appointments (e MessageLogs) são removidos.
- **Vaga histórica preservada** (Sprint 2): deletar paciente NÃO libera vaga no plano. `PatientQuotaSlot.patientId` vira `null` (órfão). Recriar com mesmo CPF/telefone reaproveita a vaga. Ver [`plan-quota.md`](plan-quota.md).

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
