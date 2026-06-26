# Feature: Painel Admin (Sprint 10)

> Painel operacional cross-tenant para o fundador: saúde do WhatsApp, contagem de usuários/pagantes e casos de anti-fraude. Acesso por **allowlist de email** (sem campo `role` no schema).

## Arquivos que compõem a feature

| Camada | Caminho |
| ------ | ------- |
| Allowlist | `src/lib/admin.ts` (`getAdminEmails`, `isAdminEmail`) |
| Gate de página (server) | `src/app/admin/layout.tsx` (redirect se não-admin) |
| Página | `src/app/admin/audit/page.tsx` |
| API | `src/app/api/admin/audit/route.ts` |
| Hook | `useAdminAudit` em `src/hooks/use-api.ts` |

## Como funciona o acesso (allowlist)

- Não existe `User.role`. Admin = email do usuário presente em **`ADMIN_EMAILS`** (env, lista separada por vírgula, case-insensitive).
- **Defense in depth** (gate em 2 camadas):
  1. `src/app/admin/layout.tsx` (Server Component): `getAuthSession()` + `isAdminEmail(session.user.email)` → `redirect("/dashboard")` se não-admin. Cobre todo `/admin/*`.
  2. `GET /api/admin/audit`: repete o gate → `forbiddenResponse()` (403) se não-admin. Garante que a API não vaza mesmo se a página for contornada.
- **Prod**: setar `ADMIN_EMAILS` na Vercel. **Dev**: no `.env` local (seed user `rhonner.matheus@gmail.com`).

## `GET /api/admin/audit`

Cross-tenant **de propósito** (só admins chegam). Retorna `{ data: { metrics, fraudCases, recent } }`:

- `metrics.whatsappConnectedPct` — `round(usuários CONNECTED / usuários com instância * 100)` (0 se ninguém tem instância). Mesma definição da métrica da Sprint 8 (ver [`whatsapp.md`](whatsapp.md)), computada ao vivo.
- `metrics.totalUsers`, `metrics.paidActive` (PRO/PREMIUM + ACTIVE), `metrics.whatsappConnected/whatsappWithInstance`.
- `fraudCases` — últimos 50 `AuditLog` com action `fraud.cpf_reused_owner` ou `signup.cpf_dedup_warning`.
- `recent` — últimos 100 `AuditLog` de todos os tenants.

Linhas mapeadas com `actionLabel` (PT-BR) — ver [`audit.md`](audit.md).

## Empresas + acesso beta/cortesia (2026-06-26)

Painel `/admin/audit` ganhou a seção **"Empresas — acesso beta (premium cortesia)"**: lista cross-tenant de contas (clinicName, dono, e-mail, plano/status) com **toggle de beta** por conta.

- `GET /api/admin/accounts` (gated `isAdminEmail`) — lista `AdminAccount[]` (inclui `adminOverride: boolean`). Também serve como a "lista de empresas" do sistema dentro do app (alternativa a SQL direto no Neon).
- `POST /api/admin/override { userId, enable, reason? }` (gated) — liga/desliga `Subscription.adminOverrideUntil` (= `BETA_OVERRIDE_UNTIL` ou `null`). Audita `admin.override_set`/`admin.override_cleared` com `actorType: ADMIN`.
- Hooks: `useAdminAccounts`, `useSetBetaOverride` (invalida `["admin-accounts"]`). Script de lote: `scripts/set-beta-override.ts`.
- **Semântica e isolamento de cobrança**: ver "Override admin / beta tester" em [`billing.md`](billing.md) (o override só eleva entitlements via `effectivePlanTier`; não toca em `plan`/`status`/Asaas).

## Pontos sensíveis

- **Sem allowlist → ninguém é admin** (`ADMIN_EMAILS` ausente = lista vazia). Falha fechada.
- **Cross-tenant**: este é o ÚNICO lugar que lê `AuditLog` sem filtrar por `tenantUserId`. O gate de allowlist é o que autoriza — não remover.
- **PII**: a auditoria já é redacted na escrita (ver `audit.md`). O painel mostra `tenantUserId` (cuid, não-PII) + label da ação. Não expor mais que isso.

## Validação manual no browser (Sprint 10, 2026-06-13)

Confirmado via Chrome MCP (seed user em `ADMIN_EMAILS`, dev server):

1. ✅ `/admin/audit` como admin → painel com 4 métricas (WhatsApp %, Usuários, Pagantes ativos, Casos de fraude) + tabela anti-fraude (com tenant ids) + auditoria recente cross-tenant.
2. ✅ **Gate**: removido o email do `ADMIN_EMAILS` + restart → `/admin/audit` **redireciona pra `/dashboard`** (sem painel, sem erro).
3. ✅ Métricas batem com o DB local (Usuários 2, Pagantes 1, fraude 32).

**Validado em PRODUÇÃO (2026-06-14)**: logado como `rhonner.matheus@gmail.com` (em `ADMIN_EMAILS` do Vercel) → painel renderiza (WhatsApp 33%, Usuários 11, Pagantes 2, fraude 0) + auditoria cross-tenant real. Gate negativo também validado em prod (testepagto2, não-admin → redirect `/dashboard`).

## Como estender

- **Nova métrica**: adicionar no `Promise.all` da rota + card em `page.tsx`.
- **Ação admin mutadora** (ex: forçar downgrade): nova rota sob `/api/admin/*` com o MESMO gate `isAdminEmail`, auditar com `actorType: "ADMIN"`.
- **`User.role`** (se a allowlist por env não escalar): adicionar enum no schema + migration; trocar `isAdminEmail` por check de role.
