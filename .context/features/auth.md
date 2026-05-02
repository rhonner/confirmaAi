# Feature: Autenticação & Registro

> Login por credenciais (email + senha), registro de novos usuários (cada usuário = 1 clínica/tenant), sessão JWT via NextAuth v4.

## Arquivos que compõem a feature

| Camada              | Caminho                                              |
| ------------------- | ---------------------------------------------------- |
| Configuração NextAuth | `src/lib/auth.ts`                                  |
| Helpers de auth     | `src/lib/auth-helpers.ts`                            |
| Validações Zod      | `src/lib/validations/auth.ts`                        |
| Rota NextAuth       | `src/app/api/auth/[...nextauth]/route.ts`            |
| Rota registro       | `src/app/api/auth/register/route.ts`                 |
| Rota esqueci senha  | `src/app/api/auth/forgot-password/route.ts`          |
| Páginas             | `src/app/(auth)/login/page.tsx`, `/registro`, `/esqueci-senha` |
| Layout              | `src/app/(auth)/layout.tsx`                          |
| Tipos NextAuth      | `src/types/next-auth.d.ts`                           |
| Modelo Prisma       | `User` em `prisma/schema.prisma`                     |

## Regras de negócio

- **Senha**: mínimo 6, máximo 128 caracteres. Hash com `bcryptjs` (salt 10).
- **Email**: único globalmente (`@unique` em `User.email`).
- **Registro cria automaticamente um `Settings` default** com mensagens e antecedências padrão.
- **`avgAppointmentValue`** é opcional no registro (default `0`), usado depois para cálculo de prejuízo no dashboard.
- **JWT inclui no token**: `id`, `email`, `name`, `clinicName`. A sessão expõe estes campos em `session.user`.
- **`getAuthSession()`** valida que o `user.id` do token ainda existe no banco — defesa contra JWT stale (usuário deletado mas token ainda válido). Sempre use este helper, nunca `getServerSession(authOptions)` direto.

## Endpoints

| Método | Path                          | Descrição                              |
| ------ | ----------------------------- | -------------------------------------- |
| POST   | `/api/auth/register`          | Cria usuário + settings default        |
| POST   | `/api/auth/[...nextauth]`     | Login/logout/csrf/session (NextAuth)   |
| POST   | `/api/auth/forgot-password`   | Recuperação de senha (placeholder)     |

## Helpers de resposta (em `auth-helpers.ts`)

```ts
getAuthSession()           // → session ou null (com check de existência)
unauthorizedResponse()     // 401
forbiddenResponse()        // 403
notFoundResponse(msg?)     // 404
badRequestResponse(msg)    // 400
serverErrorResponse(msg?)  // 500
```

> **Padrão obrigatório em toda rota protegida:**
> ```ts
> const session = await getAuthSession()
> if (!session?.user?.id) return unauthorizedResponse()
> // ...todas as queries devem filtrar userId: session.user.id
> ```

## Pontos sensíveis

- **Não há refresh token explícito**: estratégia JWT pura, expiração padrão do NextAuth.
- **Não há roles/permissões**: cada usuário só vê seus próprios dados (multi-tenancy por `userId`).
- **`forgot-password`** existe como rota mas a implementação é placeholder — verificar antes de usar.
- **Frontend autoriza via `useSession`** em `(dashboard)/layout.tsx` (redireciona para `/login` se `unauthenticated`).

## Como estender

- **Adicionar campo no User** (ex: `phone`): atualizar `schema.prisma` → migrate → `registerSchema` em validations → `register/route.ts` → `auth.ts` (callbacks JWT/session se for exposto na sessão) → `next-auth.d.ts`.
- **Adicionar provider OAuth**: incluir em `authOptions.providers` em `src/lib/auth.ts`. Atualizar UI de login.
