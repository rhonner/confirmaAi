# Feature: <nome>

> Resumo em uma frase: o que essa feature faz para o usuário final.

## Arquivos que compõem a feature

| Camada            | Caminho                                                          |
| ----------------- | ---------------------------------------------------------------- |
| Rota API          | `src/app/api/.../route.ts`                                       |
| Service / lógica  | `src/lib/services/<nome>.ts`                                     |
| Validação Zod     | `src/lib/validations/<nome>.ts`                                  |
| Hook React Query  | `src/hooks/use-api.ts` (funções `use<Nome>...`)                  |
| Página(s)         | `src/app/(dashboard)/.../page.tsx`                               |
| Componente(s)     | `src/components/.../*.tsx`                                       |
| Schema Prisma     | `prisma/schema.prisma` (modelos relevantes)                      |
| Tipos             | `src/lib/types/api.ts` (`...Response`)                           |

## Regras de negócio

- Regra 1
- Regra 2
- (Edge cases, validações de entrada, autorizações)

## Endpoints

| Método | Path                       | Descrição                | Body / Query                   | Resposta                |
| ------ | -------------------------- | ------------------------ | ------------------------------ | ----------------------- |
| GET    | `/api/...`                 | Lista                    | `?page=&limit=&search=`        | `PaginatedResponse<X>`  |
| POST   | `/api/...`                 | Cria                     | `Create<X>Input`               | `ApiResponse<X>`        |
| PUT    | `/api/.../[id]`            | Atualiza                 | `Update<X>Input`               | `ApiResponse<X>`        |
| DELETE | `/api/.../[id]`            | Remove                   | —                              | `ApiResponse<null>`     |

## Pontos sensíveis

- Multi-tenancy: filtro `userId: session.user.id` obrigatório.
- Side effects (jobs, webhooks, integrações externas).
- Validações cruzadas com outras features.
- Race conditions / idempotência.

## Fluxos relacionados

- Link para `flows/<fluxo>.md`

## Como estender

1. Adicionar campo em `prisma/schema.prisma` → `npm run db:migrate`.
2. Atualizar Zod schema em `src/lib/validations/<nome>.ts`.
3. Atualizar tipo `...Response` em `src/lib/types/api.ts`.
4. Atualizar route handler.
5. Atualizar hook em `src/hooks/use-api.ts`.
6. Atualizar UI.
7. Atualizar este arquivo (`.context/features/<nome>.md`).
