---
title: Rate limit via AuditLog (sem Redis)
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [rate-limit, audit, anti-fraud, postgres]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
related:
  - .context/features/auth.md
  - .context/features/audit.md
status: draft
---

> Pattern: rate limit usando contagem de eventos já gravados em `AuditLog` em vez de uma stack dedicada (Redis/Upstash). Aplicado em login (10 fails/5min/IP) e signup (3 attempts/24h/IP) durante Sprint 1 hardening.

## Mecânica

```ts
// auth.ts authorize()
const recentFails = await prisma.auditLog.count({
  where: {
    action: "auth.login.failed",
    ipAddress,
    createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
  },
});
if (recentFails >= 10) {
  await audit({ action: "auth.login.rate_limited", ... });
  return null;
}
```

## Quando usa

- App já loga o evento em audit por outras razões (auditoria/compliance) — o counter é "free".
- Volume baixo (early SaaS, dezenas de tenants).
- Janelas de tempo médias (minutos até 24h).
- Pequena tolerância pra latência (~ms da query).

## Quando NÃO usa

- Rate limit em hot path com alta throughput (>100 req/s) — count em tabela cresce, query fica lenta.
- Janelas em **segundos** (Redis sliding window é melhor).
- Quando AuditLog cresce muito e a query fica lenta mesmo com index `(action, createdAt DESC)`.

## Migração futura

Sprint 4 (anti-fraude signup) substitui o rate limit do `register/route.ts` por tabela dedicada `SignupAttempt(ipAddress, emailHash, cpfHash, succeeded, createdAt)` — purpose-built, com indexes voltados a contagem por IP+janela.

Mantém o pattern via AuditLog para login (volume menor) ou migra também — TBD.

## Trade-offs documentados

| | AuditLog-based | Redis | Tabela dedicada |
| - | -------------- | ----- | --------------- |
| Setup | 0 (já existe) | sim | migration + seed |
| Latência | query Postgres | sub-ms | query Postgres |
| Janelas | minutos+ | segundos | minutos+ |
| Persistência | sim (audit purposes) | TTL | sim |
| Custo | grátis | $$ | grátis |

## Pegadinhas

- `ipAddress` pode ser `null` (request sem `x-forwarded-for`) — guardar `if (ipAddress)` antes de rate-limit, pra não bloquear quando o counter ficaria igual a 0.
- Curl localhost sem header de proxy → IP `null` → bypass natural. Bom em dev.
- Rate limit não bloqueia usuário autenticado por `actorId` — autoescalonamento por IP serve o caso de bruteforce / fraud massivo.

## Wikilinks

- [[append-only-via-pg-trigger]] — protege a tabela usada como counter
- [[prisma-v7-extensions]] — extensão que produz os eventos contados

> Fonte: `src/lib/auth.ts` `authorize()`, `src/app/api/auth/register/route.ts`. 15ª linha do checklist `npm run test:sprints` valida (1.15).
