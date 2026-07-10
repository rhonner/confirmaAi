---
title: Preview deploy da Vercel falha no vercel-build (DB creds são Production-only)
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [vercel, prisma, deploy, gotcha, ci]
sources:
  - raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
related:
  - pages/concepts/migrations-not-auto-applied.md
  - pages/concepts/neon-pooled-vs-direct-url.md
status: draft
---

# Preview deploy da Vercel falha no vercel-build (DB creds são Production-only)

> Deploys de **Preview** (branch/PR) morrem no `vercel-build` com *"The datasource url property is required..."* porque `DIRECT_URL`/`DATABASE_URL` estão marcadas como **Production-only** no Vercel. É esperado e **não afeta produção**.

## Contexto

`vercel-build` = `prisma migrate deploy && next build`. O `prisma.config.ts` usa `datasource.url = process.env.DIRECT_URL ?? process.env.DATABASE_URL`. Num Preview, nenhuma das duas existe → Prisma aborta antes do `next build` (falha em ~10s).

## Por que as creds são Production-only (de propósito)

- Se o Preview tivesse `DATABASE_URL` = banco de prod, um deploy de branch rodaria `prisma migrate deploy` **contra o banco de produção** — perigoso.
- Logo, deixar as creds fora do Preview é uma **salvaguarda**, não um bug.

## Pontos-chave

- Sintoma: no dashboard do deploy de Preview, "Build Failed / `Command "npm run vercel-build" exited with 1`"; nos logs, *"The datasource url property is required in your Prisma config file when using prisma migrate deploy."*
- **Qualquer** branch teria o mesmo erro — não é específico do PR.
- **Produção passa**: o env Production tem `DIRECT_URL` + `DATABASE_URL` → migrate deploy roda, migration aplica, `next build` passa. Foi o caso do merge da Fase A do GCal (deploy prod Ready, `/api/health` ok).
- O ❌ vermelho do Preview no PR **não bloqueia o merge** (a menos que haja branch protection exigindo o check).

## Fix (opcional, cosmético)

Rodar a migration só em produção:
```
"vercel-build": "if [ \"$VERCEL_ENV\" = \"production\" ]; then prisma migrate deploy; fi && next build"
```
⚠️ Dois poréns: (1) mexe no pipeline que causou o [[migrations-not-auto-applied|incidente de junho]] — validar que prod continua migrando; (2) mesmo com o guard, o Preview segue **não-funcional em runtime** (sem `DATABASE_URL`), então deixar o check verde não te dá um preview usável. Por isso: geralmente **não vale** — só mergear.

## Cross-refs

- [[migrations-not-auto-applied]] — por que o `vercel-build` roda migrate em primeiro lugar.
- [[neon-pooled-vs-direct-url]] — por que migrations usam a URL direta.

## Fontes

- raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
