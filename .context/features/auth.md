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
| Rota reset senha    | `src/app/api/auth/reset-password/route.ts` (Sprint 10/fatia 2) |
| Token reset (stateless) | `src/lib/anti-fraud/password-reset.ts`           |
| Layout de email     | `src/lib/emails/layout.ts`                           |
| Páginas             | `src/app/(auth)/login/page.tsx`, `/registro`, `/esqueci-senha`, `/redefinir-senha` |
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
| POST   | `/api/auth/forgot-password`   | Gera token + envia email de reset (anti-enumeration: sempre 200) |
| POST   | `/api/auth/reset-password`    | Verifica token + troca a senha (single-use) |

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
- **Reset de senha (Sprint 10/fatia 2)** — implementado de verdade (era stub que não enviava nada): `forgot-password` gera **token assinado stateless** (`makeResetToken` — HMAC de `NEXTAUTH_SECRET + hash atual da senha`, TTL 1h) e envia o link via Resend (`sendPasswordResetEmail`, layout em `emails/layout.ts`); `reset-password` valida (`verifyResetToken`) e troca a senha. **Single-use sem coluna/migration**: ao trocar a senha o hash muda → o token deixa de validar. Anti-enumeration: forgot sempre responde 200. Dev sem `RESEND_API_KEY` → link no console (`[password-reset] link ...`).
- **Frontend autoriza via `useSession`** em `(dashboard)/layout.tsx` (redireciona para `/login` se `unauthenticated`).
- **Auditoria** (Sprint 1 — monetização v2): `authorize` emite `audit("auth.login.success" | "auth.login.failed" + reason)` com IP/UA capturados do `req` do NextAuth. `events.signOut` emite `auth.logout`. `register` emite `signup.attempt` (sempre) + `auth.register` (em sucesso) e cria `Subscription { plan: FREE, status: ACTIVE }` em transação atômica com User+Settings. `forgot-password` emite `auth.password_reset_requested`.
- **Rate limit login** (Sprint 1 hardening, baseado em queries no `AuditLog`): bloqueia após **10 falhas em 5min** do mesmo IP (audit `auth.login.rate_limited`). Sem dependência de Redis.

## Anti-fraude no signup (Sprint 4 — 2026-05-07)

Fluxo do `POST /api/auth/register` em ordem:

1. **Honeypot**: campo `website` invisível CSS-only no form. Se preenchido (bot), retorna 201 fake-success silencioso (não dá feedback ao atacante). Audit `signup.honeypot_triggered`.
2. **Zod validation** com **CPF obrigatório** (validateCpf — DV módulo 11 + reject sequenciais).
3. **Disposable email blocklist**: 70+ domínios em `src/lib/anti-fraud/disposable-emails.ts` (mailinator, yopmail, guerrillamail, tempmail, 10minutemail, etc). Reject 400 + audit `signup.disposable_email_blocked`.
4. **Rate limit dedicado** (`src/lib/anti-fraud/signup-rate-limit.ts` — substitui o pattern AuditLog-based do Sprint 1):
   - **3 attempts/24h por IP** (sucessos OU falhas)
   - **5 attempts/24h por emailHash** (anti account-stuffing)
   - Audit `signup.rate_limited` + 429.
5. **reCAPTCHA v3** (`src/lib/anti-fraud/recaptcha.ts`):
   - Site key + secret via `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY`.
   - Score `< 0.5` rejeita.
   - **Dev sem chave**: bypass com warning. **Prod sem chave**: 503 `MISCONFIGURED`.
6. **Email exists / CPF threshold**: já cadastrado → 409. Mais de 3 contas com mesmo `cpfHash` → bloqueia 4ª (audit `fraud.cpf_reused_owner` com `blocked: true`).
7. **bcrypt** + transação atômica criando `User` + `Settings` + `Subscription { FREE, ACTIVE }`.
8. **Cross-tenant CPF detection** (`src/lib/anti-fraud/owner-cpf-dedup.ts`): após criar a conta, conta usuários distintos com mesmo `cpfHash`. Se `>1` → audit `fraud.cpf_reused_owner` (revisão admin). Se `>3` → auto-suspende a conta mais nova (`subscription.status = SUSPENDED`).
9. **Email verification token** (`src/lib/anti-fraud/email-verification.ts`):
   - Token 64-hex random, hash SHA-256 persistido em `User.emailVerificationToken`. Expira em 24h.
   - Envia via Resend (`RESEND_API_KEY`); **dev sem chave**: loga link no console.
   - Endpoint `GET /api/auth/verify-email?token=` consome (single-use), seta `User.emailVerifiedAt = now`, redireciona pra `/verificar-email?status=ok|expired|not_found`.
10. **`SignupAttempt` track**: cada tentativa (sucesso/falha) é registrada com `ipAddress`, `emailHash`, `cpfHash`, `failureReason`. Counter dos rate limits.
11. **Resposta**: 201 + `{ data, message: "Conta criada. Verifique seu email para ativá-la." }`. Frontend redireciona pra `/verificar-email`.

### Email não verificado bloqueia ações

`entitlements.check(userId, "patient.create" | "patient.import" | "appointment.create")` retorna `EMAIL_NOT_VERIFIED` se `User.emailVerifiedAt === null`. Frontend captura via `PaywallError` + `<PaywallModal reason="EMAIL_NOT_VERIFIED" />`. Grandfathering: usuários pré-Sprint-4 (`rhonner.matheus@gmail.com` etc) recebem `emailVerifiedAt = createdAt` na migration.

### CPF do dono — política

Mesmo `cpfHash` em **N contas** é tratado em camadas:

- `N == 1`: ok normal.
- `1 < N <= 3`: permitido (caso legítimo: médico com 2 clínicas), apenas audit `fraud.cpf_reused_owner` para revisão admin futura.
- `N > 3`: 4ª criação bloqueada (HTTP 409). Se chegou a criar (race ou via pre-existing), auto-suspend.

`@unique` em `User.cpfHash` foi **removida** intencionalmente pra permitir o caso legítimo (≤3). Defesa fica no detector + threshold.

### Validação manual no browser (Sprint 4)

Confirmado em 2026-05-07 via Chrome MCP + API:

1. ✅ `/registro` renderiza com campo CPF formatado (000.000.000-00) e hint "Necessário para anti-fraude. Não é compartilhado.".
2. ✅ Hint "Obrigatório no plano Free" não aparece no signup (CPF é geral, não de paciente).
3. ✅ `joao@mailinator.com` → backend retorna 400 "Email descartável não é permitido".
4. ✅ Cadastro válido (`joao+...@clinicareal.com.br` + CPF `111.444.777-35`) → 201 + `emailVerificationPending: true` + console log com link.
5. ✅ Click no link → `/verificar-email?status=ok` "Email confirmado!".
6. ✅ Reuso do mesmo token → `/verificar-email?status=not_found` "Link inválido".
7. ✅ CPF inválido (DV errado): backend retorna `"CPF inválido (dígito verificador)"`.
8. ✅ CPF sequencial: backend retorna `"CPF inválido (sequência repetida)"`.
9. ✅ Honeypot (campo `website` preenchido): backend retorna 201 fake-success "Cadastro recebido" silenciosamente, sem criar usuário.

## Como estender

- **Adicionar campo no User** (ex: `phone`): atualizar `schema.prisma` → migrate → `registerSchema` em validations → `register/route.ts` → `auth.ts` (callbacks JWT/session se for exposto na sessão) → `next-auth.d.ts`.
- **Adicionar provider OAuth**: incluir em `authOptions.providers` em `src/lib/auth.ts`. Atualizar UI de login.
