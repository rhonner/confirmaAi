# Feature: Observabilidade (Sprint 9)

> "Não me preocupar" ≠ não olhar. = **ser interrompido só quando algo quebra.** Sem isso, o canal de descoberta de incidente é o cliente cancelando. Esta feature entrega o alvo de alerta (`/api/health`) e o ponto único de captura de erros.

## Arquivos que compõem a feature

| Camada                       | Caminho                                          |
| ---------------------------- | ------------------------------------------------ |
| Agregador de saúde (pura + IO) | `src/lib/services/health.ts`                   |
| Endpoint público             | `src/app/api/health/route.ts`                    |
| Captura de erros (seam)      | `src/lib/observability/index.ts`                 |
| Boot + hook global de erro   | `instrumentation.ts` (`register` + `onRequestError`) |
| Erros com contexto de tenant | `src/app/api/cron/run/route.ts`, `src/app/api/billing/webhook/route.ts` |

## `GET /api/health`

Endpoint **público** (sem auth — o uptime monitor externo precisa alcançar sem credencial). O corpo só expõe sinais agregados; nenhuma PII ou segredo.

- **200** `{ status: "ok" }` — tudo saudável.
- **503** `{ status: "degraded" }` — algum check falhou. (Usamos **503 Service Unavailable**, não 500: é o código HTTP correto para "serviço temporariamente insalubre"; qualquer monitor trata não-2xx como down, então o efeito de alerta é idêntico.)

Formato:
```json
{
  "status": "ok" | "degraded",
  "timestamp": "ISO",
  "checks": {
    "database":  { "ok": true },
    "cron":      { "ok": true, "lastRunMinutesAgo": 12, "thresholdMinutes": 90 },
    "billing":   { "ok": true, "stuckEvents": 0 },
    "evolution": { "ok": true, "health": "OK" | "DOWN" | "NOT_CONFIGURED" }
  }
}
```

### `GET /api/health/live` — liveness (sem DB)

Probe **barata** que só prova que a função/app **responde** — **não toca no banco** (`src/app/api/health/live/route.ts`, importa só `NextResponse`). Resposta: `{ "status": "ok", "check": "live" }`, sempre `200`. Se o app/deploy quebra, a função nem responde → o monitor detecta mesmo assim.

**Por que existe (custo Neon):** o Neon faz *scale-to-zero* do compute após ~5 min sem query. O uptime monitor batia em `/api/health` (que consulta DB) **a cada 5 min** → o compute **nunca dormia** → ~118 CU-hrs/mês, estourando o cap Free de 100 (incidente 2026-06-26, ver memória `neon-prod-db`). A liveness sem DB deixa o compute suspender entre as execuções do cron.

**Regra de ouro:** o monitor de **alta frequência** (5 min) aponta pra `/api/health/live`; a readiness profunda (`/api/health`, abaixo) fica num monitor de **baixa frequência (≥ 30 min)**.

### Checks (limiares em `health.ts`)

| Check | Sinal | Falha quando | Origem |
| ----- | ----- | ------------ | ------ |
| `database` | `SELECT` via Prisma | qualquer erro na coleta | implícito (se as queries lançam) |
| `cron` | último audit `cron.run` | `> 90 min` (`CRON_STALE_MINUTES`) ou nunca rodou | heartbeat de [`scheduler.md`](scheduler.md) — `/api/cron/run` audita `cron.run` a cada execução |
| `billing` | `BillingEvent` `processedAt = null` | algum mais velho que `60 min` (`BILLING_STUCK_MINUTES`) | webhook de [`billing.md`](billing.md) deixa `processedAt = null` em falha de apply |
| `evolution` | `checkEvolutionHealth()` | retorno `DOWN` (`NOT_CONFIGURED` **não** é falha) | health-check da Sprint 8 (ver [`whatsapp.md`](whatsapp.md)) |

### Arquitetura testável

`health.ts` separa **`evaluateHealth(inputs)`** (PURA: sinais crus → laudo; toda a regra de "o que é degradado" vive aqui) de **`runHealthChecks()`** (coleta DB + Evolution e delega). O unit test (`tests/unit/health.test.ts`) e o `test:sprints` (9.1-9.4) exercitam a função pura sem rede nem banco; o 9.5 valida que as queries de coleta batem com o schema.

## Captura de erros (`src/lib/observability`)

Ponto único `captureError(error, { area, tenantUserId, extra })`. O destino é gateado por env (`SENTRY_DSN`):

- **Sem `SENTRY_DSN`** → `console.error` estruturado (capturado pelos logs Vercel/VPS).
- **Com `SENTRY_DSN`** → encaminha pro Sentry, **adicionalmente** ao console.

`onRequestError` (hook oficial do Next.js 16, em `instrumentation.ts`) captura **todo** erro de request no servidor (rotas API, RSC, route handlers) num ponto só. Erros que carregam contexto de tenant são reportados explicitamente nos handlers: **cron** (`area: "cron"` — job desatendido) e **webhook de billing** (`area: "webhook"`, `tenantUserId` — cliente pagou e o plano não subiu).

### Sentry — ✅ ATIVO (2026-06-13)

- **Pacote**: `@sentry/nextjs` instalado. Init via `mod.init({ dsn, tracesSampleRate: 0 })` em `initObservability()` (chamado no `register()` do `instrumentation.ts`) — só erros, sem APM/tracing (ruído + quota mínimos).
- **Onde roda**: **produção apenas**. `SENTRY_DSN` está na Vercel (Production, encrypted) — projeto Sentry `clinica-organizada-web`, org `clinica-organizada`, **free tier**. No `.env` local a linha fica **comentada** (descomentar só pra testar Sentry em dev) — assim erros de dev não queimam a quota grátis (~5k/mês).
- **Import dinâmico com STRING LITERAL** (`await import("@sentry/nextjs")`): continua lazy (gate por DSN), mas o specifier literal é rastreável pelo nft da Vercel → o pacote entra no bundle serverless. **Não usar specifier em variável** (`const s = "..."`): o nft não rastreia e o Sentry falharia mudo em prod. Detalhe do padrão em `.wiki/pages/concepts/optional-dependency-via-dynamic-import.md`.
- **Validado 2026-06-13**: (1) smoke test local (`captureError` + `Sentry.flush()` → `true`); (2) **em produção** via rota-probe temporária `/api/debug-sentry` (gated por token) → resposta `{sentryConfigured:true, flushed:true}` no runtime serverless real + evento "[prod-probe] Sprint 9 Sentry verification" visível no feed de Issues. A probe foi **removida** após a confirmação (não deixar rota de debug em prod). Lição: rota de probe **não** pode usar pasta com prefixo `_` (private folder do App Router → fora do roteamento).

## Monitor de uptime externo

> Não é código — é configuração de conta externa, como as chaves Asaas/Resend. **✅ Configurado 2026-06-13.** ⚠️ **Requer reconfiguração (2026-06-26)** por causa do custo Neon — ver nota abaixo.

Monitores no **UptimeRobot** (conta `WeCalc`, alerta por email `wcwecalc@gmail.com`), HTTP:
1. `https://clinicaorganizada.com/api/health/live` — **liveness, a cada 5 min**. Up/down do app **sem tocar no banco**. Alerta principal de "o site caiu" (UptimeRobot trata não-2xx/sem-resposta como down).
2. `https://clinicaorganizada.com/api/health` — **readiness profunda, a cada ≥30 min** (200/503). Pega cron morto / billing travado / Evolution down. Intervalo LONGO **de propósito**: cada hit consulta o Postgres; a 5 min, manteria o Neon acordado 24/7.
3. `https://clinicaorganizada.com` — o app Vercel responde (5 min).
4. `https://evolution.clinicaorganizada.com` — a VPS Evolution responde (5 min).

> **⚠️ Custo Neon (2026-06-26):** o monitor #1 batia em `/api/health` (com DB) a cada 5 min → o compute do Neon nunca fazia scale-to-zero → estourou o cap Free (100 CU-hrs). Fix: liveness sem DB pro ping de 5 min + readiness profunda em baixa frequência. **✅ Reconfigurado no UptimeRobot em 2026-06-26:** monitor `…/api/health/live` @ 5 min + monitor novo `…/api/health` @ 30 min. Ver memória `neon-prod-db`.

O monitor (email/push do próprio serviço) é o sistema de alerta, sem infra própria. **Página de status pública deliberadamente NÃO criada** (não expor status dos serviços publicamente). Anti-flapping (alertar após 2 falhas consecutivas) fica como ajuste opcional nas settings dos monitores.

## Runbook de incidentes

Quando o monitor alertar (ou `/api/health` retornar 503), olhar o `checks` do corpo:

- **`cron.ok: false`** (cron morto): o crontab da VPS Hetzner (`*/30 * * * * clinica-cron.sh` → `GET /api/cron/run` com Bearer) parou de disparar. Onde olhar: SSH na VPS → `systemctl status cron`, `grep CRON /var/log/syslog`, testar `curl` manual pro endpoint com o `CRON_SECRET`. Ver [`scheduler.md`](scheduler.md) e `concepts/vercel-hobby-cron-workaround` na wiki.
- **`billing.ok: false`** (`stuckEvents > 0`): webhook de pagamento processado mas o apply falhou → cliente pode ter pago sem subir de plano. Onde olhar: tabela `BillingEvent WHERE processedAt IS NULL` (payload + userId). Reconciliar manualmente o `Subscription`. Erro detalhado no Sentry/log com `area: "webhook"` + `tenantUserId`. Ver [`billing.md`](billing.md).
- **`evolution.ok: false`** (`health: "DOWN"`): a VPS Evolution caiu ou está inacessível. Efeito: nenhum tenant envia confirmação (todos viram "WhatsApp desconectado" — Sprint 8 já alerta cada um por email). Onde olhar: SSH na VPS → `docker ps`, `docker logs evolution`, reiniciar o container; checar HTTPS/Caddy. Ver [`whatsapp.md`](whatsapp.md) § Resiliência.
- **`database.ok: false`**: Postgres (Neon) inacessível. Checar painel Neon (quota de conexões, suspensão de branch, **quota de compute/CU-hours estourada** no Free — suspende o compute). Lembrar: runtime serverless usa a URL **pooled** (`-pooler`) — ver `concepts/neon-pooled-vs-direct-url` na wiki.

## Pontos sensíveis

- **Público de propósito**: `/api/health` não tem auth. Mantido enxuto — só booleans + idade do cron + contagem de eventos travados. Não adicionar PII, e-mails, nomes de tenant nem stack traces ao corpo.
- **`NOT_CONFIGURED` não derruba**: é o estado de dev e de tenant que ainda não conectou WhatsApp. Só `DOWN` (configurado mas inacessível) é falha.
- **Falha de banco cega o cron-check**: se a coleta DB lança, `lastCronRunAt` fica null → cron também acende. Correto: ambos sinalizam "vai ver".
- **Observabilidade nunca quebra o fluxo**: `captureError` engole exceções internas (o `console.error` já registrou o erro original). Idem o `onRequestError`.

## Validação (2026-06-13)

- `tsc --noEmit` limpo · `TZ=UTC vitest run` **182/182** (8 novos em `health.test.ts`) · `npm run build` limpo (`/api/health` registrada) · `npm run test:sprints` **93/93** (6 checks novos, Sprint 9).
- **Comportamento real (dev server + curl):**
  - DB sem `cron.run` recente → `503` `degraded` com `cron.ok:false, lastRunMinutesAgo:null` (demais checks verdes; `evolution.health:"OK"` confirmando o health-check real).
  - Após semear um `cron.run` → `200` `ok` com `cron.ok:true, lastRunMinutesAgo:0`.

## Como estender

- **Novo check**: adicionar campo em `HealthInputs` + lógica em `evaluateHealth` + coleta em `runHealthChecks`. Adicionar caso no unit test e no `test:sprints` (9.x).
- **Ajustar limiar**: `CRON_STALE_MINUTES` / `BILLING_STUCK_MINUTES` em `health.ts` (o threshold é ecoado no corpo da resposta — documentação viva).
- **Capturar erro em novo ponto crítico**: `import { captureError }` e chamar no catch com `area` + `tenantUserId` quando houver dono.
