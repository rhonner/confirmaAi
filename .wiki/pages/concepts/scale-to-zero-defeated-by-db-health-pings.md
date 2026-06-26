---
title: Health check com DB + uptime monitor frequente derruba o scale-to-zero
type: concept
created: 2026-06-26
updated: 2026-06-26
tags: [neon, serverless, scale-to-zero, observability, custo, uptimerobot, health-check]
sources:
  - raw/sessions/2026-06-26-neon-cost-scale-to-zero.md
related:
  - pages/entities/neon-postgres.md
  - pages/concepts/vercel-hobby-cron-workaround.md
  - pages/concepts/defense-in-depth-cron.md
  - .context/features/observability.md
status: stable
---

> Um banco serverless que faz *scale-to-zero* (Neon) suspende o compute após ~5 min sem query. Se um uptime monitor pinga um `/api/health` que **consulta o DB** a cada 5 min, o compute **nunca dorme** → a conta de compute roda como se fosse 24/7. Fix: separar **liveness** (sem DB, alta frequência) de **readiness** (com DB, baixa frequência).

## O incidente (2026-06-26)

- Neon Free dá **100 CU-hrs/projeto/mês**. O projeto `confirmaai` bateu **100.98** com ~zero carga de cliente (2-3 alphas) — o SQL Editor do console travou ("reached its compute limit").
- Causa-raiz: o **UptimeRobot pingava `GET /api/health` a cada 5 min, 24/7**. Esse endpoint roda `AuditLog.findFirst` (heartbeat do cron) + `BillingEvent.count` (stuck events) a cada chamada (`src/lib/services/health.ts`). 288 pings/dia tocando o Postgres → o timer de autosuspend do Neon (~5 min) era resetado bem na hora de suspender → compute ~sempre ligado.
- Conta: ~0.25 CU × ~24h × 30d ≈ 180 CU-hrs se 100% ligado; mediram ~118/mês → o compute ficava ligado ~65% do tempo só por causa do ping.

## A pegadinha conceitual

O custo de um DB com scale-to-zero é função de **"o compute está acordado?"**, não de "quantas queries/clientes". Então:

- O custo **não escala com nº de clientes** nesse regime — um único pinger periódico que toca o DB domina tudo.
- Qualquer coisa que toque o DB num intervalo **≤ janela de autosuspend** mantém o compute ligado: uptime monitor, cron curto, keepalive, cache-warmer.

## O fix: split liveness × readiness

| Sonda | Toca DB? | Frequência | Endpoint | Quem pinga |
| ----- | -------- | ---------- | -------- | ---------- |
| **Liveness** | ❌ não | alta (5 min) | `GET /api/health/live` → `200 {status:"ok",check:"live"}` | uptime monitor (up/down do app) |
| **Readiness profunda** | ✅ sim | baixa (≥30 min) | `GET /api/health` (cron/billing/evolution) | monitor secundário |

- Liveness ainda prova "o app/função responde" (se o deploy quebra, a função nem responde → o monitor detecta). Só não acorda o banco.
- Readiness profunda continua pegando cron morto / billing travado / Evolution down — só que numa cadência que deixa o DB dormir entre os pings.
- Detalhe operacional dos endpoints e checks: `.context/features/observability.md`.

## Por que NÃO cachear o resultado do health (alternativa rejeitada)

Cache in-memory do resultado dos checks reduziria as queries, mas em **serverless (Vercel)** o cache de módulo não sobrevive a cold starts / múltiplas instâncias → economia incerta. O split liveness/readiness é **determinístico**: a liveness nunca abre conexão, ponto. (Validado em prod com DB quebrado: live=200, deep=503.)

## Piso residual

Mesmo com o fix, o cron `/api/cron/run` a cada 30 min (crontab da VPS — ver [[vercel-hobby-cron-workaround]]) acorda o DB periodicamente. Isso é o **piso legítimo** (~30-40 CU-hrs/mês), bem abaixo do cap. Pra economizar mais: afrouxar o cron pra 60 min.

## Quando NÃO se aplica

- DB sempre-ligado (RDS provisionado, Postgres em VPS): não há scale-to-zero, então o ping não muda custo — aí o health-check com DB a cada 5 min é ok.
- Plano Neon pago usage-based: não há cap, mas o compute 24/7 ainda **custa** (~$0.106/CU-h ≈ $12/mês) — o fix continua valendo, só não há "limite estourado". Ver [[neon-postgres]].

## Cross-refs

- [[neon-postgres]] — host, cap Free, billing via Vercel, pricing.
- [[vercel-hobby-cron-workaround]] — o cron 30-min é o piso de wake.
- `.context/features/observability.md` — endpoints `/api/health` e `/api/health/live`, checks, config do UptimeRobot.

> Fonte: raw/sessions/2026-06-26-neon-cost-scale-to-zero.md
