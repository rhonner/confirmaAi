---
title: Vercel não aplica migrations no deploy (drift silencioso)
type: concept
created: 2026-06-14
updated: 2026-07-19
tags: [incident, prisma, migrations, vercel, deploy, observability, neon]
sources:
  - raw/sessions/2026-06-14-migration-incident-sprint10.md
  - raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
  - .context/plans/deployment-status.md
related:
  - pages/concepts/neon-pooled-vs-direct-url.md
  - pages/concepts/optional-dependency-via-dynamic-import.md
  - pages/concepts/jwt-new-claim-defaults-stale-tokens.md
status: stable
---

> **Incidente real (2026-06-14)**: login e signup ficaram quebrados em produção por ~1 dia porque uma migration foi deployada no código mas **nunca aplicada no banco**. `next build` na Vercel **não roda `prisma migrate deploy`**.

## O que aconteceu

A Sprint 8 adicionou colunas a `User` (`whatsappDisconnectedAt`, `whatsappDisconnectNotifiedAt`) via migration `20260612230508`. O código foi deployado (Vercel auto-deploy no push), mas o `build` era só `next build` — **migrations não rodam no deploy**. O banco de prod ficou uma migration atrás.

O Prisma Client deployado (gerado do schema com as colunas) fazia `prisma.user.findUnique({ where: { email } })` **sem `select`** em dois pontos — `authorize()` (login) e `register` ("email já existe?"). Sem select = SELECT de todas as colunas → bate na coluna inexistente → `PrismaClientKnownRequestError: The column ... does not exist`.

## Por que ficou invisível ~1 dia

Três camadas de invisibilidade se somaram:

1. **Sessões JWT antigas continuaram funcionando** — o `getAuthSession` usa `findUnique({ select: { id: true } })` (só `id`, não toca a coluna nova). Dashboard, `/api/health`, atividade idem (todos com `select` específico). Só os **2 caminhos select-all** (login novo + register) quebraram.
2. O "email ou senha incorreto" do login era o erro de coluna **disfarçado** (o `authorize` cai no catch → NextAuth mostra credencial inválida). Parecia senha errada; nunca foi.
3. O catch do `register` **engolia** o erro (retornava 500 genérico sem reportar) → **não chegava no Sentry**. Por isso ninguém foi alertado.

## Diagnóstico

Logs de runtime da Vercel (filtro "Register error") mostraram o `PrismaClientKnownRequestError` exato. `prisma migrate status` (contra a URL direct) confirmou a única pendente.

## Fixes

- **Imediato**: `prisma migrate deploy` contra a URL **direct** do Neon (sem `-pooler` — ver [[neon-pooled-vs-direct-url]]). Migrations são aditivas → seguro. Sem redeploy (é mudança de banco; o código já deployado passa a achar as colunas).
- **Prevenção (permanente)**: `package.json` ganhou **`"vercel-build": "prisma migrate deploy && next build"`** — todo deploy aplica pendentes, e migration que falha **bloqueia o deploy** (fail-safe). `build` local segue `next build` (DB-free, não acopla CI). `prisma.config.ts` usa `DIRECT_URL ?? DATABASE_URL` no migrate. Requer cadastrar `DIRECT_URL` no Vercel.
- **Observabilidade**: `captureError` adicionado ao catch do `register` (e `forgot/reset`) — esse 500 agora alerta no Sentry.

## Lições reusáveis

- **Vercel/serverless não roda migration sozinho.** Acople via `vercel-build` (ou step de CI) — não confie no deploy de código.
- **`findUnique` sem `select` é frágil a drift.** Quando o client está à frente do banco, qualquer select-all quebra; caminhos com `select` específico sobrevivem (e mascaram o problema).
- **Catch que engole erro = incidente invisível.** Todo catch de rota crítica deve `captureError`. Ver [[optional-dependency-via-dynamic-import]] (Sentry) — só vale se os erros chegarem nele.

## Nuances operacionais (addendum 2026-07-19)

Duas coisas que confundem ao acompanhar um deploy com migration nova (feature de onboarding, migration `20260719155729_add_business_type_onboarding`):

- **Não rode SQL cru no banco pra "adiantar" a coluna.** Aplicar o DDL na mão (ex.: SQL editor do Neon) cria a coluna **sem** registrar a linha em `_prisma_migrations`. No deploy seguinte, o `prisma migrate deploy` tenta aplicar a mesma migration, bate em "coluna já existe" e **falha** — e como o fix permanente encadeia `migrate deploy && next build`, a migration quebrada **bloqueia o build inteiro**. Deixe o `vercel-build` aplicar; se precisar aplicar fora de banda, use `prisma migrate deploy` (que registra), nunca `ALTER TABLE` avulso.
- **"No pending migrations to apply" no log do deploy é o caso normal**, não um erro — significa que aquele deploy não trouxe migration nova (o banco já está na frente ou igual). Só se preocupe quando o deploy **tem** migration nova e você **não** vê o `Applying migration ...` correspondente.
- Migration **aditiva + com backfill** (como a de onboarding: novas colunas nulas + `UPDATE` de backfill) é segura de aplicar antes do código novo assumir o controle — mas lembre que **backfill de banco não alcança sessões JWT já emitidas** ([[jwt-new-claim-defaults-stale-tokens]]): é o mesmo tema "estado deployado ≠ estado aplicado", uma camada acima.

## Cross-refs

- [[neon-pooled-vs-direct-url]] — por que migrate usa a URL direct.
- [[jwt-new-claim-defaults-stale-tokens]] — o análogo na camada de sessão: backfill no banco não conserta tokens vivos.
- `.context/plans/deployment-status.md` — incidente + runbook (`scripts/migrate-prod.sh`).

> Fonte: incidente 2026-06-14; `package.json`, `prisma.config.ts`, `scripts/migrate-prod.sh`.
