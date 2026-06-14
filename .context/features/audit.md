# Feature: Auditoria

> Trilha cross-cutting de **toda mutação** em modelos auditáveis + eventos de domínio (login, mensagens, webhook). Persistida em `AuditLog` no Postgres. Fundação técnica do roadmap de monetização — implementada **antes** de billing/quota para que tudo nasça auditado.

## Arquivos que compõem a feature

| Camada                       | Caminho                                         |
| ---------------------------- | ----------------------------------------------- |
| Model Prisma                 | `prisma/schema.prisma` (`AuditLog`, `ActorType`) |
| Context (AsyncLocalStorage)  | `src/lib/audit/context.ts`                       |
| Função `audit()`             | `src/lib/audit/log.ts`                           |
| Prisma extension (intercept) | `src/lib/audit/prisma-extension.ts`              |
| Route wrapper (HOF)          | `src/lib/audit/route-wrapper.ts`                 |
| Labels PT-BR                 | `src/lib/audit/labels.ts`                        |
| Barrel export                | `src/lib/audit/index.ts`                         |
| Hookup do client             | `src/lib/prisma.ts` (`.$extends(auditExtension)`) |

## Conceitos

### `AuditContext` (AsyncLocalStorage)

Toda thread de execução leva um contexto com:
- `actorType`: `USER | SYSTEM | WEBHOOK | ADMIN | ANONYMOUS`
- `actorId`: id do user para USER/ADMIN; livre para WEBHOOK/SYSTEM
- `tenantUserId`: dono do recurso afetado (para multi-tenant filter)
- `ipAddress`, `userAgent`: capturados na entrada da request

O context é populado via:
- `auditWrap(handler)` em rotas autenticadas (lê session do NextAuth, IP/UA dos headers).
- `withFixedActor({ actorType, actorId }, handler)` em webhooks/cron (não tem session).
- `runWithAuditContext(ctx, fn)` para uso programático (ex: cron interno, scripts).

### Prisma extension

Intercepta automaticamente create/update/upsert/delete/createMany/updateMany/deleteMany nos modelos:

```
AUDITED_MODELS = { Patient, Appointment, Settings, User, Subscription }
```

Para create: grava `afterJson = registro completo`. Update: faz `findOne` antes, calcula diff e grava só campos alterados em `beforeJson`/`afterJson`. Delete: grava `beforeJson = registro completo`.

Campos sensíveis (`password`, `lastQrcodeBase64`) são redacted antes de persistir.

`MessageLog`/`BillingEvent` **não** são auditados pela extension — são event-tables próprias.

### Eventos de domínio (não-DB)

Chamadas explícitas de `audit({ action, ... })` para:
- `auth.login.success` / `auth.login.failed` (em `src/lib/auth.ts`).
- `auth.register` / `auth.password_reset_requested`.
- `appointment.confirmed_by_patient` / `appointment.canceled_by_patient` (webhook Evolution).
- `message.sent` / `message.send_failed` (scheduler).
- (Futuro Sprint 2+) `quota.patient_blocked`, `subscription.upgraded`, `billing.webhook.invalid_signature`, etc.

## Como roda

1. Request entra. `auditWrap` extrai session/IP/UA → `runWithAuditContext`.
2. Handler chama Prisma. Cada mutação dispara a extension.
3. Extension consulta `getOrSystemContext()` (lê o ALS) → cria `AuditLog` row com diff + actor.
4. Handler também chama `audit({...})` direto para eventos de domínio.
5. **Falhas em audit não quebram o fluxo** (try/catch em `log.ts` apenas logam no console).

## Pontos sensíveis

- **Append-only no Postgres** (migration `20260507170554_audit_append_only`): trigger `audit_log_immutable` rejeita `UPDATE`/`DELETE` em `AuditLog` no nível do banco. Bypass autorizado apenas com `SET LOCAL app.allow_audit_mutation = 'true'` dentro de transação dedicada (uso futuro do retention job). Defense in depth: comprometer o app não permite apagar trilha.
- **PII**: `REDACTED_FIELDS` cobre `password`, `lastQrcodeBase64`, `cpf`, `cpfHash`, `identifierHash` (preemptivo Sprint 2). Em `metadata` de eventos custom, usar helpers `maskPhone`/`maskEmail`/`truncateMessage` (`@/lib/audit/pii`) — nunca passar PII bruta.
- **Recursão**: a extension intercepta apenas modelos em `AUDITED_MODELS`. `AuditLog` não está incluído → não recursa. Reads (`findUnique`/`findFirst`/`findMany`) também não são interceptados → o `readOne` interno da extension não recursa.
- **Performance**: cada update/delete adiciona 1 SELECT (para diff) + 1 INSERT. Para hot paths em escala (>100 writes/s) considerar fila assíncrona. No volume atual (clínicas SMB) é negligenciável.
- **Tamanho do JSON**: `safeJson` trunca em 32KB. Beforehand fields (Patient, Appointment) são pequenos.
- **Vazamento de PII**: hardening Sprint 1 — `REDACTED_FIELDS` cobre `password`, `lastQrcodeBase64`, `cpf`, `cpfHash`, `identifierHash`. Helpers `maskPhone`/`maskEmail`/`truncateMessage` em `@/lib/audit/pii` para `metadata` de eventos custom.
- **ALS no Edge runtime**: `AsyncLocalStorage` requer Node runtime. Routes API que não declaram `runtime = "edge"` (todas as nossas) ficam ok.
- **Audit sem context**: cai pra `SYSTEM`. Útil em scripts/jobs internos.
- **Idempotência**: a tabela é append-only. Mesmo evento disparado 2x cria 2 linhas. Não usar para invariantes de domínio (use a tabela de domínio para isso).
- **Retenção** (futuro): job diário deve deletar `WHERE createdAt < now() - INTERVAL '90 days'`. Hoje cresce indefinidamente.

## Como estender

- **Auditar novo modelo**: adicionar nome do model em `AUDITED_MODELS` em `prisma-extension.ts`. Atualizar `labels.ts` com `<modelo>.create/update/delete`.
- **Novo evento de domínio**: chamar `audit({ action: "<area>.<verb>", ... })` no ponto da operação. Adicionar label PT-BR.
- **Novo actor type** (ex: `INTEGRATION` para chaves de API): adicionar no enum Prisma + migration.
- **Redact novo campo sensível**: adicionar em `REDACTED_FIELDS`.
- **Tela `/configuracoes/atividade`** (✅ implementada Sprint 10): `GET /api/account/activity` faz `prisma.auditLog.findMany({ where: { tenantUserId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50, skip })` (paginado), mapeia `action` via `actionLabel`. Página client em `src/app/(dashboard)/configuracoes/atividade/page.tsx` (linkada do card em `/configuracoes`). O painel admin cross-tenant (`/admin/audit`) consome a mesma `AuditLog` — ver [`admin.md`](admin.md).
