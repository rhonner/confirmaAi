# Feature: Configurações

> Configurações por usuário: mensagens de confirmação/lembrete, antecedência de envio, nome da clínica e valor médio por consulta.

## Arquivos que compõem a feature

| Camada           | Caminho                                                |
| ---------------- | ------------------------------------------------------ |
| Rota API         | `src/app/api/settings/route.ts`                        |
| Validação Zod    | `src/lib/validations/settings.ts`                      |
| Hook React Query | `src/hooks/use-api.ts` → `useSettings`, `useUpdateSettings` |
| Página           | `src/app/(dashboard)/configuracoes/page.tsx`           |
| Tipo             | `SettingsResponse` em `src/lib/types/api.ts`           |
| Modelos Prisma   | `Settings` + campos em `User` (`clinicName`, `avgAppointmentValue`) |

## Regras de negócio

- **Existência implícita**: GET cria `Settings` default se não existir (lazy create) — reduz NPE em fluxos novos.
- **Defaults** (no schema Prisma):
  - `confirmationHoursBefore = 24`
  - `reminderHoursBefore = 6`
  - `confirmationMessage` e `reminderMessage` com placeholders `{nome}`, `{clinica}`, `{data}`, `{hora}`.
- **Validação cruzada (refine)**: `reminderHoursBefore < confirmationHoursBefore` (lembrete tem menos antecedência → enviado depois). Erro associado ao path `reminderHoursBefore`.
- **Faixas**:
  - `confirmationHoursBefore` / `reminderHoursBefore`: `[1, 168]` (1h a 7 dias).
  - Mensagens: `[10, 1000]` chars.
  - `clinicName`: `[3, 200]` chars.
  - `avgAppointmentValue`: `>= 0`.
- **Campos no `User`** (não em `Settings`): `clinicName` e `avgAppointmentValue` são atualizados via mesma rota PUT mas persistidos na tabela `User`. Resposta unificada.

## Endpoints

| Método | Path            | Body                       | Resposta                            |
| ------ | --------------- | -------------------------- | ----------------------------------- |
| GET    | `/api/settings` | —                          | `ApiResponse<SettingsResponse>`     |
| PUT    | `/api/settings` | `UpdateSettingsInput`      | `ApiResponse<SettingsResponse>`     |

## Pontos sensíveis

- **Tipos misturados**: `SettingsResponse` = `Settings & { avgAppointmentValue: number; clinicName: string }`. O `Settings` puro não contém esses campos.
- **PUT separa explicitamente** `avgAppointmentValue` e `clinicName` em `User.update` e o resto em `Settings.update`. Sempre que adicionar campo "global" do usuário, replicar este split.
- **Mensagens** são processadas por `formatMessage` em `src/lib/services/message-template.ts` na hora do envio (cron). Placeholders fora do conjunto suportado **ficam como literal**.

## Como estender

- **Novo placeholder de mensagem**: adicionar em `MessageData` no `message-template.ts`, fazer `.replace(/{novo}/g, data.novo)`, passar valor nas chamadas (`scheduler.ts`).
- **Novo campo de configuração** (ex: `weekendsEnabled`): schema Prisma → migrate → `updateSettingsSchema` → `SettingsResponse` (já reflete via `Settings`) → UI em `configuracoes/page.tsx` → consumir no service que precisar (geralmente `scheduler.ts`).
- **Decidir entre `Settings` e `User`**: se o campo é "operacional" da automação, vai em `Settings`. Se é identidade da clínica ou usado em métricas (`clinicName`, `avgAppointmentValue`), fica em `User`.
