---
title: Vercel não aplica migrations no deploy (drift silencioso)
type: concept
created: 2026-06-14
updated: 2026-06-14
tags: [incident, prisma, migrations, vercel, deploy, observability]
sources:
  - raw/sessions/2026-06-14-migration-incident-sprint10.md
  - .context/plans/deployment-status.md
related:
  - pages/concepts/neon-pooled-vs-direct-url.md
  - pages/concepts/optional-dependency-via-dynamic-import.md
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

## Cross-refs

- [[neon-pooled-vs-direct-url]] — por que migrate usa a URL direct.
- `.context/plans/deployment-status.md` — incidente + runbook (`scripts/migrate-prod.sh`).

> Fonte: incidente 2026-06-14; `package.json`, `prisma.config.ts`, `scripts/migrate-prod.sh`.
