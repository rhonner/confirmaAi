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
| Rota reenviar verificação | `src/app/api/auth/resend-verification/route.ts` (bugfix 2026-06-24) |
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
| POST   | `/api/auth/resend-verification` | Reenvia link de verificação (anti-enumeration: sempre 200; rate-limit **3/10min por IP + 3/60min por conta**) |

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
- **Email de boas-vindas (Sprint 10/fatia 2.2)** — `verify-email` (pós-ativação bem-sucedida) dispara `sendWelcomeEmail` (best-effort: falha de email não trava a ativação; erro → `captureError`). Senders em `src/lib/emails/transactional.ts`.
- **Reset de senha (Sprint 10/fatia 2)** — implementado de verdade (era stub que não enviava nada): `forgot-password` gera **token assinado stateless** (`makeResetToken` — HMAC de `NEXTAUTH_SECRET + hash atual da senha`, TTL 1h) e envia o link via Resend (`sendPasswordResetEmail`, layout em `emails/layout.ts`); `reset-password` valida (`verifyResetToken`) e troca a senha. **Single-use sem coluna/migration**: ao trocar a senha o hash muda → o token deixa de validar. Anti-enumeration: forgot sempre responde 200. Dev sem `RESEND_API_KEY` → link no console (`[password-reset] link ...`).
- **Frontend autoriza via `useSession`** em `(dashboard)/layout.tsx` (redireciona para `/login` se `unauthenticated`).
- **Auditoria** (Sprint 1 — monetização v2): `authorize` emite `audit("auth.login.success" | "auth.login.failed" + reason)` com IP/UA capturados do `req` do NextAuth. `events.signOut` emite `auth.logout`. `register` emite `signup.attempt` (sempre) + `auth.register` (em sucesso) e cria `Subscription { plan: FREE, status: ACTIVE }` em transação atômica com User+Settings. `forgot-password` emite `auth.password_reset_requested`.
- **Rate limit login** (Sprint 1 hardening, baseado em queries no `AuditLog`): bloqueia após **10 falhas em 5min** do mesmo IP (audit `auth.login.rate_limited`). Sem dependência de Redis.
- **Normalização de e-mail (resolvido 2026-06-24, achado do review adversarial)**: `User.email @unique` é case-sensitive no Postgres, e antes nenhum fluxo normalizava → risco de contas duplicadas (`User@x.com` ≠ `user@x.com`) e de o novo gate cair em `user_not_found` (toast genérico) quando a caixa do e-mail diferia da do cadastro. **Fix**: os schemas Zod (`loginSchema`, `registerSchema` em `validations/auth.ts`; schemas locais de `resend-verification` e `forgot-password`) fazem `z.string().trim().toLowerCase().email()`; `authorize` usa `validation.data.email` (normalizado) no lookup. Migration `20260625013034_normalize_emails_lowercase` alinha os dados já gravados (lowercase + trim, **collision-safe** — só atualiza linhas que não colidem com o índice único; base pré-marketing é normalizada por inteiro). Regressão: check `11.35` no `test:sprints`.

## Anti-fraude no signup (Sprint 4 — 2026-05-07)

Fluxo do `POST /api/auth/register` em ordem:

1. **Honeypot**: campo `website` invisível CSS-only no form. Se preenchido (bot), retorna 201 fake-success silencioso (não dá feedback ao atacante). Audit `signup.honeypot_triggered`.
2. **Zod validation** com **documento obrigatório — CPF *ou* CNPJ** (`validateDocument` em `src/lib/anti-fraud/document.ts` — auto-detecta pelo tamanho: ≤11 → CPF, 12-14 → CNPJ; DV módulo 11 + reject sequenciais nos dois). Ver "Documento do dono (CPF/CNPJ)" abaixo.
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

### Email não verificado bloqueia o LOGIN (bugfix 2026-06-24)

> ⚠️ Mudança de comportamento. Até 2026-06-24 o e-mail não verificado **só bloqueava ações** (login passava). Um sócio relatou "consegui logar sem confirmar e-mail" como bug → decisão do dono: **bloquear o login em si**.

- **`authorize` (`src/lib/auth.ts`)**: após validar a senha (ordem importa — não vaza o estado de verificação a quem não tem a senha), se `user.emailVerifiedAt === null` → lança `EmailNotVerifiedError` (classe exportada, `message === "EMAIL_NOT_VERIFIED"`). O `catch` do authorize **re-propaga só essa classe** (qualquer outro erro → `null` genérico). Audit `auth.login.email_not_verified`.
  - ⚠️ **Gotcha NextAuth v4 ao testar**: `CredentialsProvider(opts)` retorna `{ ...defaults, authorize: () => null, options: opts }`. O merge (suas opções vencem) só acontece quando o NextAuth **normaliza os providers em runtime**. Para unit-test, chame `authOptions.providers[0].options.authorize`, **não** `.authorize` (esse é o stub `() => null`). O passthrough da `message` do throw até `signIn(...).error` no client **funciona** em v4 (validado no browser).
- **Frontend login (`(auth)/login/page.tsx`)**: se `result.error.includes("EMAIL_NOT_VERIFIED")` → mostra painel "Confirme seu e-mail para entrar" + botão **Reenviar e-mail de confirmação** (chama `POST /api/auth/resend-verification`; toast genérico por anti-enumeration). Sem isso, quem perdeu o e-mail ficaria travado.
- **Reenvio (`/api/auth/resend-verification`)**: sempre 200 (não revela existência/estado). **Rate-limit em 2 dimensões** (conta `auth.verification_resent` no AuditLog, inclusive os `skipped`): (a) **3/10min por IP** — pega abuso ingênuo; (b) **3/60min por conta-alvo (`tenantUserId`)** — defesa real contra inbox-bombing, **robusta a spoofing de `X-Forwarded-For`** (o atacante não controla o userId). Achado do review adversarial 2026-06-24. Só reenvia p/ conta existente + não-deletada + `emailVerifiedAt === null`. Regenera o token (`createVerificationToken` sobrescreve → token antigo invalida). Dev sem `RESEND_API_KEY`: link no console.
- **Defense-in-depth mantida**: `entitlements.check(userId, "patient.create" | "patient.import" | "appointment.create")` ainda retorna `EMAIL_NOT_VERIFIED` se `emailVerifiedAt === null` (agora raramente atingido, pois o login já barra). Frontend captura via `PaywallError` + `<PaywallModal reason="EMAIL_NOT_VERIFIED" />`.
- **Grandfathering**: usuários pré-Sprint-4 (`rhonner.matheus@gmail.com` etc) recebem `emailVerifiedAt = createdAt` na migration → logam normalmente.

### Documento do dono (CPF/CNPJ) — 2026-06-26

O documento do responsável pela conta (usado na cobrança Asaas, campo `cpfCnpj`, e no anti-fraude) aceita **CPF ou CNPJ** — clínica costuma ser PJ. Auto-detecção pelo tamanho dos dígitos.

- **Validação/máscara**: `src/lib/anti-fraud/document.ts` — `validateDocument` (delega a `cpf-validator`/`cnpj-validator`), `formatDocument` (máscara `000.000.000-00` ou `00.000.000/0000-00`, formata quando completo, trunca em 14 dígitos). Usado no signup (`registro/page.tsx`) e no checkout grandfathered (`billing/checkout/page.tsx`).
- **Storage**: continua em `User.cpf`/`User.cpfHash` (a coluna passa a guardar CPF **ou** CNPJ canônico, só dígitos — nome mantido por compat; não renomeado pra evitar migration).
- **Hash anti-fraude**: `hashDocument` (em `identifiers.ts`) despacha por tamanho — CPF mantém o namespace `cpf:` (**hashes já gravados continuam batendo**), CNPJ usa `cnpj:`. O threshold/dedup (`detectOwnerCpfReuse`, conta por `cpfHash`) é hash-agnóstico → mesma política pros dois.
- ⚠️ **NÃO confundir com o CPF do PACIENTE** (identificador de quota em `quota.ts`/`identifiers.ts` `primaryIdentifier`/`patient.ts`), que **continua só CPF** (`validateCpf`/`hashCpf` intactos).
- Regressão: unit `tests/unit/document-validator.test.ts` (14) + `test:sprints` 11.36. Validado no Chrome MCP (2026-06-26): signup mascara CPF e CNPJ, rejeita inválido ("CPF ou CNPJ inválido"); API aceita CNPJ → 201 + `User.cpf` com 14 dígitos.

### CPF/CNPJ do dono — política de reuso

Mesmo `cpfHash` em **N contas** é tratado em camadas:

- `N == 1`: ok normal.
- `1 < N <= 3`: permitido (caso legítimo: médico com 2 clínicas), apenas audit `fraud.cpf_reused_owner` para revisão admin futura.
- `N > 3`: 4ª criação bloqueada (HTTP 409). Se chegou a criar (race ou via pre-existing), auto-suspend.

`@unique` em `User.cpfHash` foi **removida** intencionalmente pra permitir o caso legítimo (≤3). Defesa fica no detector + threshold.

> ⚠️ **Dois pontos gravam `User.cpfHash`** (mantenha os controles em paridade): o `register` e, desde 2026-06-20, o `POST /api/billing/checkout` (conta grandfathered sem CPF preenchendo no checkout — ver [`billing.md`](billing.md)). Ambos aplicam o hard-block `>=4` + `detectOwnerCpfReuse` (auto-suspend `>3`). Ao criar um 3º write path de `cpfHash`, replique esses controles — ou extraia o trio "valida + dedup + persiste cpfHash" num helper único.

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

### Validação manual no browser (bugfix 2026-06-24)

Confirmado via Chrome MCP + DB local (usuário descartável, depois removido):

1. ✅ `/registro`: links "Termos de Uso" / "Política de Privacidade" abrem **modal** na mesma aba (não nova aba); clicar neles **não** marca o checkbox de consentimento; conteúdo legal real renderiza e scrolla.
2. ✅ Sem scroll horizontal no viewport estreito, **inclusive com os 6 erros de validação na tela** (`scrollWidth === clientWidth`); atribuição "Protegido por reCAPTCHA" presente.
3. ✅ Cadastro válido → redireciona para `/verificar-email` (sem auto-login).
4. ✅ Login com senha **correta** de conta não-verificada → **bloqueado** (continua em `/login`, painel "Confirme seu e-mail" + botão de reenvio); não vai pro dashboard. (Prova que o NextAuth v4 propaga `EMAIL_NOT_VERIFIED` até `signIn(...).error`.)
5. ✅ "Reenviar e-mail de confirmação" → toast + novo link logado (`POST /api/auth/resend-verification` 200); token antigo invalidado.
6. ✅ Visitar o link de verificação → `/verificar-email?status=ok`; login subsequente → `/dashboard`.
7. ✅ Regressão: seed `rhonner.matheus@gmail.com` (verificado) loga normalmente → `/dashboard`.

Regressão automatizada: `npm run test:sprints` checks **11.30–11.34** (authorize bloqueia/permite, ciclo do token de reenvio, modal de termos, fix do scroll).

## Como estender

- **Adicionar campo no User** (ex: `phone`): atualizar `schema.prisma` → migrate → `registerSchema` em validations → `register/route.ts` → `auth.ts` (callbacks JWT/session se for exposto na sessão) → `next-auth.d.ts`.
- **Adicionar provider OAuth**: incluir em `authOptions.providers` em `src/lib/auth.ts`. Atualizar UI de login.
