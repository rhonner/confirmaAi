---
type: session
date: 2026-06-24
branch: main
status: ingested
files_touched:
  - src/lib/auth.ts
  - src/app/api/auth/resend-verification/route.ts
  - src/app/(auth)/login/page.tsx
  - src/app/(auth)/registro/page.tsx
  - src/app/(auth)/layout.tsx
  - src/components/legal/legal-dialog.tsx
  - src/app/globals.css
  - src/hooks/use-recaptcha.ts
  - src/lib/validations/auth.ts
  - src/app/api/auth/forgot-password/route.ts
  - prisma/migrations/20260625013034_normalize_emails_lowercase/migration.sql
  - scripts/test-sprints.ts
  - tests/e2e/full-crud.spec.ts
---

# Sessão 2026-06-24 — Bugfix dos 4 bugs de cadastro/login (relato dos sócios)

## Objetivo

Validar e corrigir 4 bugs reportados por um sócio no fluxo de cadastro/login.

## Resultado

Todos corrigidos, validados ponta-a-ponta no Chrome MCP, e o fix passou por um review adversarial (workflow, 10 agentes) que rendeu 3 hardenings extras. Gate: tsc + vitest 238 + build + test:sprints (checks novos 11.30–11.35). Commitado/pushado pelo usuário.

## Decisões / aprendizados

1. **Bug "logar sem confirmar e-mail" → decisão de produto: bloquear o login** (antes só bloqueava *ações* via `entitlements`). Implementado em `authorize` lançando `EmailNotVerifiedError`; UI mostra painel + reenvio. Detalhe operacional em `.context/features/auth.md`.
2. **Gotcha NextAuth v4**: a `authorize` real fica em `providers[0].options.authorize` (o `.authorize` do topo é stub `() => null`). → [[nextauth-credentials-authorize-stub]].
3. **`throw` no authorize chega ao client** em `signIn(...).error` no v4 — base do gate. → [[nextauth-credentials-authorize-stub]].
4. **Scroll lateral mobile** = badge reCAPTCHA `fixed right:-186px` + honeypot `left:-9999px`. → [[horizontal-scroll-from-offscreen-elements]].
5. **Rate-limit só por IP é spoofável (XFF)** → adicionar dimensão por conta-alvo. → [[rate-limit-via-audit]] (atualizada).
6. **Termos/Privacidade viraram modal** (não abria nova aba) + **normalização de e-mail** (trim+lowercase nos schemas + migration collision-safe). Operacional em `.context/features/auth.md` e `lgpd-account.md`.

## Páginas tocadas na ingestão

- NOVA [[nextauth-credentials-authorize-stub]]
- NOVA [[horizontal-scroll-from-offscreen-elements]]
- ATUALIZADA [[rate-limit-via-audit]]

> Detalhe operacional completo: `.context/features/auth.md` (seções do bugfix 2026-06-24) e `.context/features/lgpd-account.md`.
