# Index — Wiki ConfirmaAí

> Catálogo de todas as páginas da wiki. Atualizado a cada `ingest`.
> Para conhecimento operacional por feature, veja `.context/features/`.

---

## Entities (`pages/entities/`)

Coisas concretas: libs, serviços, integrações, ferramentas.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| [prisma-v7-extensions](pages/entities/prisma-v7-extensions.md) | `$extends({ query })` para auditoria automática; cuidados com recursão, ALS, tx | 2026-05-07 |
| [radix-popover-and-dialog](pages/entities/radix-popover-and-dialog.md) | Gotchas: `.click()` programático não dispara Popover; variant `hard` em Dialog | 2026-05-07 |
| [asaas-integration](pages/entities/asaas-integration.md) | Endpoints, config env, sem portal-style Stripe; **PF sem CNPJ ok (NF-e não), painel não-automatizável** | 2026-06-10 |

## Concepts (`pages/concepts/`)

Padrões abstratos, princípios, gotchas reusáveis.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| [timezone-on-vercel](pages/concepts/timezone-on-vercel.md) | Runtime UTC; `formatInTimeZone` obrigatório; `TZ` env reservada | 2026-05-07 |
| [append-only-via-pg-trigger](pages/concepts/append-only-via-pg-trigger.md) | Trigger PG bloqueia UPDATE/DELETE; bypass via GUC pra retention job | 2026-05-07 |
| [quota-ledger-immortal-slot](pages/concepts/quota-ledger-immortal-slot.md) | Vagas vitalícias por hash; slot órfão; reuso ao recadastrar | 2026-05-07 |
| [identifier-hash-namespacing](pages/concepts/identifier-hash-namespacing.md) | Por que `cpf:` / `phone:` prefix evita colisão entre 11 dígitos | 2026-05-07 |
| [rate-limit-via-audit](pages/concepts/rate-limit-via-audit.md) | Rate limit sem Redis usando contagem em `AuditLog` (login). Signup migrou pra `SignupAttempt` em Sprint 4 | 2026-05-07 |
| [webhook-idempotency-via-unique-constraint](pages/concepts/webhook-idempotency-via-unique-constraint.md) | `@unique providerEventId` + catch P2002 = idempotência sem lock; "sempre 200 após registrar" | 2026-05-07 |
| [dev-fallback-without-secrets](pages/concepts/dev-fallback-without-secrets.md) | reCAPTCHA, Resend, Asaas — fallback dev (`DEV_BYPASS`/log) e falha hard em prod | 2026-05-07 |
| [defense-in-depth-cron](pages/concepts/defense-in-depth-cron.md) | Cron diário backstop pra webhooks perdidos (PAST_DUE>7d → SUSPENDED) | 2026-06-10 |
| [rhf-radix-gotcha](pages/concepts/rhf-radix-gotcha.md) | RHF Controller + Radix Checkbox: valor não chega no submit; `recaptchaToken: null` quebra `.optional()` | 2026-05-07 |
| [lazy-period-usage-counter](pages/concepts/lazy-period-usage-counter.md) | Quota de msgs sem job de reset: virada de período = linha nova lazy; fallback p/ webhook perdido | 2026-06-10 |
| [neon-pooled-vs-direct-url](pages/concepts/neon-pooled-vs-direct-url.md) | Pooled (`-pooler`) no runtime serverless, direta nas migrations; PrismaPg dispensa `pgbouncer=true` | 2026-06-10 |
| [vercel-hobby-cron-workaround](pages/concepts/vercel-hobby-cron-workaround.md) | Hobby = cron 1×/dia; crontab da VPS Hetzner dispara `/api/cron/run` 30/30min com Bearer | 2026-06-10 |
| [claude-chrome-sensitive-domains](pages/concepts/claude-chrome-sensitive-domains.md) | `Permission denied` em site sensível = prompt da extensão (aprovável), não bloqueio duro; protocolo de retry + workflow de secrets | 2026-06-10 |

## Synthesis (`pages/synthesis/`)

Sumários cruzados, comparações, teses evolutivas.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| [monetization-v2-state](pages/synthesis/monetization-v2-state.md) | Snapshot vivo: 6/11 sprints ✅, roadmap re-sequenciado p/ autonomia, go-live ~90% | 2026-06-10 |

---

## Raw sources

| Bucket | Arquivos | Descrição |
| ------ | -------- | --------- |
| `raw/sessions/` | 3 | Sumários de sessões de trabalho. |
| `raw/articles/` | 0 | Web clips, papers, links externos. |
| `raw/decisions/` | 0 | ADRs e decisões arquiteturais brutas. |

---

## Convenções

- Slugs em `kebab-case`, em inglês.
- Toda página tem frontmatter (ver `_TEMPLATE_page.md`).
- Wikilinks `[[slug]]` para referência interna.
- Cross-refs explícitos para `.context/features/<feature>.md` quando aplicável.
