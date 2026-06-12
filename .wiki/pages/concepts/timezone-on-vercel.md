---
title: Timezone em runtime serverless (Vercel)
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [timezone, vercel, date-fns, gotcha]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
related:
  - .context/features/scheduler.md
  - .context/features/dashboard.md
status: stable
---

> Vercel roda serverless em **UTC**. Qualquer função `format()` / `toLocale*` que **não passa `timeZone` explícito** produz strings em UTC — mesmo quando o `Date` no banco representa o instante correto. Sintoma clássico: cliente agendou às 14h, recebeu mensagem dizendo 17h (Δ = 3h = BRT−UTC).

## Sintomas

- Mensagem WhatsApp com horário 3h adiantado.
- Dashboard com "Sem 7/05" em sábado/domingo (boundary de semana em UTC vs BRT).
- Export CSV com data UTC no nome do arquivo.

## Causa raiz

`new Date('2026-05-07T14:00')` digitado pelo usuário no formulário é tratado pelo browser como **local** (BRT) → instante UTC `17:00:00Z` no banco. Mas `format(date, 'HH:mm')` em runtime UTC chama `getHours()` em UTC → `"17:00"`.

## Solução adotada

`src/lib/timezone.ts` centraliza:
- `APP_TIMEZONE = "America/Sao_Paulo"`
- `formatInTimeZone(date, APP_TIMEZONE, "HH:mm")` — usa `date-fns-tz`
- `toAppTz(utc)` / `fromAppTz(zoned)` — para boundary math (mês/semana)
- `startOfDayInAppTz(yyyy-mm-dd)` / `endOfDayInAppTz` — pra `where.dateTime` em queries

Regra: **server-side, nunca usar `format()` puro nem `new Date(y, m, d, ...)` (esse último constrói em local TZ do processo).**

## Por que não setar `TZ=America/Sao_Paulo`?

`TZ` é **env var reservada no Vercel** (`vercel env add TZ` retorna `Reserved Environment Variable`). Daí a solução em código.

## Tipos de bug que essa convenção pega

- `format()` em route handlers
- `dt.toLocaleString("pt-BR")` em CSV
- `startOfMonth(now)` em dashboard
- `eachWeekOfInterval` no chart semanal

## Wikilinks

- [[append-only-via-pg-trigger]] (escopo independente)
- [[monetization-v2-state]]

> Fonte: raw/sessions/2026-05-07-sprint-1-3-monetizacao.md (descoberta do bug 14h→17h em produção, fix com namespace de utility)
