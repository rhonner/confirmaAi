# Feature: Configurações

> Configurações por usuário: mensagens de confirmação/lembrete, antecedência de envio, nome da clínica e valor médio por consulta.

## Arquivos que compõem a feature

| Camada           | Caminho                                                |
| ---------------- | ------------------------------------------------------ |
| Rota API         | `src/app/api/settings/route.ts`                        |
| Validação Zod    | `src/lib/validations/settings.ts`                      |
| Hook React Query | `src/hooks/use-api.ts` → `useSettings`, `useUpdateSettings` |
| Página           | `src/app/(dashboard)/configuracoes/page.tsx`           |
| Editor de template | `src/components/settings/template-editor.tsx` (TipTap, chips das variáveis) |
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
  - `avgAppointmentValue`: `[0, 99999.99]` (Zod `.max(99999.99)`).
- **Máscara monetária do `avgAppointmentValue`** (2026-06-26): o campo usa `<CurrencyInput>` com **máscara acumuladora de centavos** (preenche da direita: `5`→`0,05`, `573128`→`5.731,28`), teto **99.999,99** (7 dígitos). Lógica pura em `src/lib/currency-mask.ts` (`centsToDisplay`/`rawToCents`/`valueToCents`); contrato do componente segue em **reais** (number). Regressão: `tests/unit/currency-input.test.ts` + `test:sprints` 11.38.
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

## Editor de template com chips (2026-06-27 — feedback da sócia)

Os textareas de `confirmationMessage`/`reminderMessage` foram trocados por um **editor de tokens** (`src/components/settings/template-editor.tsx`, baseado em **TipTap v3**). As variáveis (`{nome}`, `{data}`, `{hora}`, `{clinica}`) viram **chips atômicos** que o usuário não consegue editar por dentro nem quebrar apagando uma chave; clicar no `×` do chip remove a variável inteira; digitar `{nome}` manualmente também vira chip (input rule).

- **Contrato de dados intacto**: o editor **serializa de volta para a string `{nome}...`** (fonte da verdade). Backend, Zod (`validations/settings.ts`), `formatMessage`/`message-template.ts` e a pré-visualização **não mudaram**. Integração com RHF via `<Controller>` (não `register`).
- **Node view em DOM puro, NÃO React** (`addNodeView` retornando `{ dom }`): o `ReactNodeViewRenderer` do TipTap v3 chama `flushSync` durante o render do React → erro "flushSync was called from inside a lifecycle method". DOM puro evita isso. Ver [[tiptap-flushsync-domnodeview]] na wiki.
- **`nodeInputRule` SEM grupo de captura** (`/\{(?:nome|...)\}$/`): com grupo de captura o TipTap substitui só a palavra e preserva as chaves → `{{nome}}`. O nome é extraído de `match[0].slice(1,-1)`.
- **Placeholder**: precisa de CSS global (`.ProseMirror p.is-editor-empty:first-child::before`) em `globals.css`.
- **Aviso de tags (ideia da Isa)**: helper `usesAnyVariable()` no editor. A pré-visualização (`TemplatePreview` na página) é **verde** quando há ao menos uma variável e **amarela + aviso** ("Nenhuma variável usada — a mensagem será enviada idêntica...") quando não há. Não bloqueia o salvar (Zod só exige min 10 chars). Texto de ajuda no bloco "Variáveis disponíveis" atualizado.
- **Barra de salvar sticky**: o botão "Salvar Configurações" agora vive numa barra `sticky bottom-4` no rodapé do form, com indicador "● Alterações não salvas" (usa `isDirty`) / "Tudo salvo". A sócia havia preenchido os campos e saído sem salvar por não notar o botão no fim da página longa.

## Validação manual no browser (2026-06-27)

Confirmado via Chrome MCP (seed `rhonner.matheus@gmail.com`):

1. ✅ Chips das 4 variáveis renderizam ao carregar (parse da string do banco) com `×` para remover; preview verde.
2. ✅ Clicar no chip da paleta insere o chip no editor ativo (último focado); clicar no `×` remove a variável inteira.
3. ✅ Digitar `{nome}` vira chip único e limpo (sem `{{}}`) — após o fix do `nodeInputRule` sem captura.
4. ✅ Template sem nenhuma variável → preview **amarela** + aviso; com variável → **verde**. Por editor (confirmação vs lembrete independentes).
5. ✅ Barra sticky (`position: sticky; bottom: 16px`) mostra "Alterações não salvas" quando dirty e "Tudo salvo" após salvar.
6. ✅ Save round-trip: `GET /api/settings` retorna `confirmationMessage` com chaves simples corretas (serialize→PUT→DB→parse).
7. ✅ Sem erros de console (`flushSync` eliminado com o node view DOM).

## Como estender

- **Novo placeholder de mensagem**: adicionar em `MessageData` no `message-template.ts`, fazer `.replace(/{novo}/g, data.novo)`, passar valor nas chamadas (`scheduler.ts`). **Atenção**: para virar chip no editor, adicionar também em `TEMPLATE_VARS` e nas regexes (`VARIABLE_REGEX`, input rule) de `template-editor.tsx`.
- **Novo campo de configuração** (ex: `weekendsEnabled`): schema Prisma → migrate → `updateSettingsSchema` → `SettingsResponse` (já reflete via `Settings`) → UI em `configuracoes/page.tsx` → consumir no service que precisar (geralmente `scheduler.ts`).
- **Decidir entre `Settings` e `User`**: se o campo é "operacional" da automação, vai em `Settings`. Se é identidade da clínica ou usado em métricas (`clinicName`, `avgAppointmentValue`), fica em `User`.
