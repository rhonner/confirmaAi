---
title: Neon (Postgres serverless) — host de produção
type: entity
created: 2026-06-26
updated: 2026-06-26
tags: [neon, postgres, serverless, infra, custo, vercel, billing]
sources:
  - raw/sessions/2026-06-26-neon-cost-scale-to-zero.md
related:
  - pages/concepts/neon-pooled-vs-direct-url.md
  - pages/concepts/scale-to-zero-defeated-by-db-health-pings.md
  - pages/concepts/migrations-not-auto-applied.md
status: stable
---

> O banco de produção do ConfirmaAí é **Postgres gerenciado no Neon**, provisionado via a **integração Neon↔Vercel**. Projeto `confirmaai`, região AWS São Paulo (`sa-east-1`), Postgres 17.

## Onde está / como acessar

- Console: `console.neon.tech` — login social (Google) na conta **WeCalc** (`wcwecalc@gmail.com`). Ver [[claude-chrome-per-profile-extension]] pra qual perfil usar.
- SQL Editor + Tables (navegar dados) + botão **Connect** (pega a connection string).
- Local de dev usa Postgres em Docker (`localhost`), **não** o Neon. Pra ver prod: Prisma Studio apontando pra string do Neon (cuidado — dado real de pacientes, LGPD → só `SELECT`).

## Billing — gerenciado pela Vercel (não-óbvio)

- A subscription do Neon **NÃO** é gerenciada no painel do Neon — é gerenciada **dentro da Vercel** (Integrations → Neon → Settings). O console do Neon mostra "Neon subscription managed by Vercel".
- Plano atual: **Free**.

## Limites e pricing

| Plano | Compute | Storage | Sizes |
| ----- | ------- | ------- | ----- |
| **Free** | **100 CU-hours/projeto/mês** (cap rígido — estourar trava o SQL editor; pode suspender o compute) | 0.5 GB/projeto | até 2 CU |
| **Launch** (usage-based, sem cap) | **$0.106 / CU-hora** | **$0.35 / GB-mês** | até 16 CU |

- O ciclo de cobrança bate com o mês-calendário (ex.: "since Jun 1" → reseta ~1º do mês seguinte).
- No uso atual (~118 CU-hrs/mês, 0.03 GB) o Launch sairia ~**US$12-13/mês**; após o fix de scale-to-zero, ~**US$2-4** — e provavelmente continua **dentro do Free (US$0)**.

## Pegadinha #1 — scale-to-zero vs pings que tocam o DB

O compute suspende após ~5 min sem query. Pings frequentes que tocam o DB (uptime monitor no `/api/health`) impedem a suspensão e queimam CU-hours como se fosse 24/7. **Custo não escala com clientes nesse regime.** Detalhe e fix completos em [[scale-to-zero-defeated-by-db-health-pings]].

## Pegadinha #2 — pooled vs direta

Runtime serverless usa a URL **pooled** (`-pooler`); migrations usam a **direta** (`DIRECT_URL`). Ver [[neon-pooled-vs-direct-url]] e [[migrations-not-auto-applied]].

## Cross-refs

- [[scale-to-zero-defeated-by-db-health-pings]] — o gotcha de custo.
- [[neon-pooled-vs-direct-url]] — conexão pooled vs direta.
- `.context/features/observability.md` — health checks que tocam o DB.

> Fonte: raw/sessions/2026-06-26-neon-cost-scale-to-zero.md
