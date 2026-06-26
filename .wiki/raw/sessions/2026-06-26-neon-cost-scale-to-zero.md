---
type: session
date: 2026-06-26
branch: main
status: ingested
files_touched:
  - src/app/api/health/live/route.ts
  - .context/features/observability.md
  - scripts/test-sprints.ts
---

# Sessão 2026-06-26 — Corte de custo Neon (scale-to-zero vs health pings)

## Objetivo da sessão

Investigar por que o Neon (banco de prod) estourou o cap de compute do Free tier, estimar o custo de subir de plano, e cortar o custo sem assinar nada.

## Resultado

- **Diagnóstico**: o UptimeRobot pingava `GET /api/health` (que faz queries no DB) a cada 5 min, 24/7 → o compute do Neon nunca fazia scale-to-zero → ~118 CU-hrs/mês projetados, estourando o cap Free de 100 CU-hrs/projeto.
- **Fix (deployado)**: novo endpoint `GET /api/health/live` (liveness) que responde 200 **sem tocar no banco** (`src/app/api/health/live/route.ts`). O `/api/health` profundo ficou intacto.
- **Validação local**: `tsc` limpo, vitest 238/238, build limpo (rota registrada), `test:sprints` 123/123 (novo check 9.7). Prova com DB quebrado: `/api/health/live`=200, `/api/health`=503 `database:false`.
- **UptimeRobot reconfigurado** (conta WeCalc): monitor de 5 min repontado pra `/api/health/live`; monitor novo em `/api/health` a cada 30 min (readiness profunda). Site raiz + VPS Evolution seguem 5 min.
- **Custo Launch (se subir)**: usage-based — $0.106/CU-hora + $0.35/GB-mês ≈ ~US$12-13/mês no uso atual, ~US$2-4 após o fix. Provavelmente continua no Free (US$0).
- Decisão: **manter health check ligado em alpha** (cron morto = produto silenciosamente quebrado; agora custa ~zero). Alertar na 1ª falha (sem anti-flapping) por enquanto.

## Decisões / aprendizados

- **Aprendizado**: health check que consulta o DB + uptime monitor frequente = serverless DB nunca dorme. Separar liveness (sem DB, alta freq) de readiness (com DB, baixa freq). — Como aplicar: ver [[scale-to-zero-defeated-by-db-health-pings]].
- **Aprendizado**: a subscription do Neon é gerenciada **dentro da Vercel** (integração), não no painel do Neon. Free cap = 100 CU-hrs/projeto. — ver [[neon-postgres]].
- **Decisão**: manter observabilidade ligada no alpha — Por quê: o modo de falha que mata o produto (cron parado) é silencioso e só seria descoberto pelo cliente cancelando.
- **Aprendizado (tooling)**: a extensão Claude-in-Chrome é por-perfil; deviceIds e nomes ("Browser 1/2") embaralham entre sessões — confirmar o alvo pela conta logada. — ver [[claude-chrome-per-profile-extension]].

## Gotchas / surpresas

- O custo do Neon hoje **não escala com nº de clientes** — foi o ping de health 24/7 que queimou as CU-hrs, com ~zero carga de cliente. 2-3 alphas somam quase nada.
- Cache in-memory em serverless (Vercel) é não-confiável pra esse fim (cold starts) — por isso o split liveness/readiness (determinístico) foi preferido a cachear o resultado do health.

## Para ingerir na wiki

- [x] criar `pages/concepts/scale-to-zero-defeated-by-db-health-pings.md`
- [x] criar `pages/entities/neon-postgres.md`
- [x] criar `pages/concepts/claude-chrome-per-profile-extension.md`
- [x] atualizar `pages/concepts/vercel-hobby-cron-workaround.md` (piso residual de wake)
