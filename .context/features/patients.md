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

## Perfil: nascimento, sexo e identidade de gênero (2026-07-24)

> Pedido do dono em duas mensagens, com um esclarecimento importante no meio:
> *"adicionar mais campos para pacientes (genero e data de nascimento)"* e
> *"quando eu disse genero na primeira mensagem, quis dizer **sexo**, e no genero da
> segunda, todos aqueles de cisgenero, trans, e toda essas coisas"*.

**São TRÊS campos, e sexo ≠ identidade de gênero** (erro de categoria se juntar):

| Campo | Tipo | Para que serve |
| ----- | ---- | -------------- |
| `Patient.birthDate` | `String? @db.VarChar(10)` — "yyyy-MM-dd" | idade + card de aniversariantes |
| `Patient.sex` | `enum Sex?` (FEMALE/MALE/INTERSEX/NOT_INFORMED) | clínico (dosagem, faixa de referência) |
| `Patient.gender` + `genderSelfDescribed` | `enum Gender?` (10 valores) + `String? @db.VarChar(60)` | como a pessoa se identifica |

Migrations: `20260724224211_add_patient_birthdate_gender` e
`20260724230500_add_patient_sex_split_gender_identity` (a 2ª faz DROP+recreate do
enum `Gender` — seguro porque 0 de 21 pacientes tinham valor; conferido antes).

- **Nenhum é obrigatório**, em nenhum plano. `NOT_INFORMED` ("prefiro não informar")
  é **diferente** de `null` ("nunca preenchido") — a UI oferece as duas coisas.
- **Catálogo em `src/lib/gender.ts`** (fonte única dos rótulos pt-BR): `SEX_OPTIONS`,
  `GENDER_OPTIONS`, `formatSex`, `formatGender` e `normalizeGender`.
- **`birthDate` é DATA CIVIL em string**, não `DateTime`. Um aniversário não tem fuso;
  com `@db.Date` o Prisma devolve meia-noite UTC e qualquer formatação local (BRT)
  mostraria o dia anterior **para todo mundo**. Helpers puros em `src/lib/birthday.ts`
  (`isoToBr`, `brToIso`, `maskBrDate`, `ageOn`, `isBirthdayOn`, `splitBirthdays`).
  ⚠️ **NUNCA** `new Date(birthDate)`.
- **UI: input mascarado `dd/mm/aaaa`**, não `<input type="date">` — mesmo motivo do
  `TimeSelect`: o dono rejeitou o picker nativo do Android, e para nascimento é pior
  (ninguém navega calendário 40 anos para trás). O form guarda o texto mascarado e
  converte no submit (`brToIso`), igual ao CPF formatado.
- **Autodescrição**: só a opção "Prefiro me autodescrever" revela o campo livre.
  Trocar de opção **APAGA** o texto (`normalizeGender`) — privacidade, não só dado.
  ⚠️ No `PUT`, a normalização é **PÓS-MERGE** com o estado atual: normalizar o payload
  cru fazia um PUT parcial (sem a chave `gender`) apagar a identidade cadastrada
  (achado de code-review).
- **Auditoria**: `sex`, `gender` e `genderSelfDescribed` entram em `REDACTED_FIELDS`
  (`src/lib/audit/prisma-extension.ts`). ⚠️ Isso só passou a funcionar de verdade com o
  fix **diff-then-redact**: redigir ANTES do `shallowDiff` fazia
  `"[REDACTED]" === "[REDACTED]"` e a chave era **descartada** — a trilha ficava vazia
  em vez de redigida (valia para o `cpf` também). Agora registra QUE mudou, sem o valor.
- **LGPD**: os 3 campos entram no `buildAccountExport`; a Política de Privacidade deixou
  de listar as categorias de paciente de forma FECHADA, declara a base do **art. 11, II,
  "f"** (atendimento pelo profissional de saúde) e `LEGAL_VERSION`/`LEGAL_UPDATED_LABEL`
  foram para `2026-07-24` (as duas juntas — divergir é bug).
- **Export CSV** ganhou `Nascimento`, `Idade`, `Sexo`, `Genero` (nessa ordem).
- **Fora do MVP**: busca/filtro por esses campos e coluna na tabela de `/pacientes`
  (tela de balcão, visível a terceiros) — ficam no diálogo e no CSV.
- Checks `PF.1`–`PF.6` + `PF.2b` em `scripts/test-sprints.ts`; unit em
  `tests/unit/birthday.test.ts` (24) e `tests/unit/gender.test.ts` (17).

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
| GET    | `/api/patients/export`     | —                                                | CSV (`Content-Type: text/csv`) — entitlement `export.csv` (402 no Free) |

> **Export no front (2026-06-29)**: usa `<ExportCsvButton url="/api/patients/export" />` (`src/components/billing/export-csv-button.tsx`, mesmo componente da agenda). No Free, clicar abre o `PaywallModal` em vez de uma falha de download. Ver detalhe em [`appointments.md`](appointments.md) (Pontos sensíveis → Export CSV).

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
