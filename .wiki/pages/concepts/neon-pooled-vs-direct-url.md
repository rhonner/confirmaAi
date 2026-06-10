---
title: Neon — URL pooled (runtime) vs direta (migrations)
type: concept
created: 2026-06-10
updated: 2026-06-10
tags: [neon, postgres, prisma, serverless, pooling, escala]
sources:
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - pages/entities/prisma-v7-extensions.md
  - .context/plans/deployment-status.md
status: stable
---

> Em serverless (Vercel), cada invocação pode abrir conexão própria com o Postgres — conexões **diretas** esgotam o limite do Neon exatamente quando o tráfego cresce. Regra: **runtime usa a URL pooled, migrations usam a direta**.

## Como diferenciar

- Direta: `ep-divine-recipe-acbdf1sw.sa-east-1.aws.neon.tech`
- Pooled: mesmo host com sufixo **`-pooler`**: `ep-divine-recipe-acbdf1sw-pooler.sa-east-1.aws.neon.tech`
- Mesma credencial e database; o pooler é um PgBouncer (transaction mode) na frente.

## Regras do projeto

| Operação | URL |
| -------- | --- |
| Runtime na Vercel (`DATABASE_URL` env de produção) | **pooled** (aplicado em 2026-06-10) |
| `prisma migrate deploy` / `migrate status` | **direta** (DDL + advisory locks não funcionam bem atrás do pooler em transaction mode) |
| Scripts one-off (backfills) | direta (sessão única, sem ganho no pooler) |

## Gotcha Prisma

Com o **driver adapter** (`@prisma/adapter-pg` → node-postgres) a URL pooled funciona **sem** o param `?pgbouncer=true` — esse param é coisa do engine nativo do Prisma (desativa prepared statements nomeados). Como o projeto usa `PrismaPg` obrigatório (Prisma v7), nada muda no código.

## Por que isso importa pra premissa do produto

"Vender sem trocar arquitetura": o gargalo clássico de Postgres + serverless não é o banco em si, é o **modo de conexão**. Com o pooler, o mesmo Neon atende dezenas de milhares de tenants antes de qualquer upgrade. Sem ele, a app cai junto com o primeiro pico de marketing.

> Fonte: raw/sessions/2026-06-10-sprint6-and-golive.md — auditoria das envs de produção revelou URL direta em uso desde maio.
