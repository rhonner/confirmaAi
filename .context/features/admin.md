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

## Pontos sensíveis

- **Sem allowlist → ninguém é admin** (`ADMIN_EMAILS` ausente = lista vazia). Falha fechada.
- **Cross-tenant**: este é o ÚNICO lugar que lê `AuditLog` sem filtrar por `tenantUserId`. O gate de allowlist é o que autoriza — não remover.
- **PII**: a auditoria já é redacted na escrita (ver `audit.md`). O painel mostra `tenantUserId` (cuid, não-PII) + label da ação. Não expor mais que isso.

## Validação manual no browser (Sprint 10, 2026-06-13)

Confirmado via Chrome MCP (seed user em `ADMIN_EMAILS`, dev server):

1. ✅ `/admin/audit` como admin → painel com 4 métricas (WhatsApp %, Usuários, Pagantes ativos, Casos de fraude) + tabela anti-fraude (com tenant ids) + auditoria recente cross-tenant.
2. ✅ **Gate**: removido o email do `ADMIN_EMAILS` + restart → `/admin/audit` **redireciona pra `/dashboard`** (sem painel, sem erro).
3. ✅ Métricas batem com o DB local (Usuários 2, Pagantes 1, fraude 32).

## Como estender

- **Nova métrica**: adicionar no `Promise.all` da rota + card em `page.tsx`.
- **Ação admin mutadora** (ex: forçar downgrade): nova rota sob `/api/admin/*` com o MESMO gate `isAdminEmail`, auditar com `actorType: "ADMIN"`.
- **`User.role`** (se a allowlist por env não escalar): adicionar enum no schema + migration; trocar `isAdminEmail` por check de role.
