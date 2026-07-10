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
| [neon-postgres](pages/entities/neon-postgres.md) | DB de prod no Neon (projeto `confirmaai`, SP): cap Free 100 CU-hrs, **billing gerenciado pela Vercel**, Launch usage-based ($0.106/CU-h), scale-to-zero | 2026-06-26 |

## Concepts (`pages/concepts/`)

Padrões abstratos, princípios, gotchas reusáveis.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| [timezone-on-vercel](pages/concepts/timezone-on-vercel.md) | Runtime UTC; `formatInTimeZone` obrigatório; `TZ` env reservada | 2026-05-07 |
| [append-only-via-pg-trigger](pages/concepts/append-only-via-pg-trigger.md) | Trigger PG bloqueia UPDATE/DELETE; bypass via GUC pra retention job | 2026-05-07 |
| [quota-ledger-immortal-slot](pages/concepts/quota-ledger-immortal-slot.md) | Vagas vitalícias por hash; slot órfão; reuso ao recadastrar | 2026-05-07 |
| [identifier-hash-namespacing](pages/concepts/identifier-hash-namespacing.md) | Por que `cpf:` / `phone:` prefix evita colisão entre 11 dígitos | 2026-05-07 |
| [rate-limit-via-audit](pages/concepts/rate-limit-via-audit.md) | Rate limit sem Redis usando contagem em `AuditLog` (login). Signup migrou pra `SignupAttempt` em Sprint 4. **IP via XFF é spoofável → 2ª dimensão por conta-alvo** | 2026-06-24 |
| [webhook-idempotency-via-unique-constraint](pages/concepts/webhook-idempotency-via-unique-constraint.md) | `@unique providerEventId` + catch P2002 = idempotência sem lock; "sempre 200 após registrar" | 2026-05-07 |
| [dev-fallback-without-secrets](pages/concepts/dev-fallback-without-secrets.md) | reCAPTCHA, Resend, Asaas — fallback dev (`DEV_BYPASS`/log) e falha hard em prod. **Nuance (07-05):** chave de cifra reversível gateia o fallback ao *runner de teste*, não a "não-prod" | 2026-07-05 |
| [defense-in-depth-cron](pages/concepts/defense-in-depth-cron.md) | Cron diário backstop pra webhooks perdidos (PAST_DUE>7d → SUSPENDED) | 2026-06-10 |
| [rhf-radix-gotcha](pages/concepts/rhf-radix-gotcha.md) | RHF Controller + Radix Checkbox: valor não chega no submit; `recaptchaToken: null` quebra `.optional()` | 2026-05-07 |
| [whatsapp-ninth-digit-jid](pages/concepts/whatsapp-ninth-digit-jid.md) | JID pode vir sem o 9º dígito BR → resposta do paciente não casava com `patient.phone`; fix `brPhoneCandidates` | 2026-06-12 |
| [asaas-external-reference-in-payment](pages/concepts/asaas-external-reference-in-payment.md) | Asaas manda externalReference em `payment`, não `subscription` → cliente pagava e ficava FREE; fix `planTierFromPayload` | 2026-06-12 |
| [lazy-period-usage-counter](pages/concepts/lazy-period-usage-counter.md) | Quota de msgs sem job de reset: virada de período = linha nova lazy; fallback p/ webhook perdido | 2026-06-10 |
| [neon-pooled-vs-direct-url](pages/concepts/neon-pooled-vs-direct-url.md) | Pooled (`-pooler`) no runtime serverless, direta nas migrations; PrismaPg dispensa `pgbouncer=true` | 2026-06-10 |
| [vercel-hobby-cron-workaround](pages/concepts/vercel-hobby-cron-workaround.md) | Hobby = cron 1×/dia; crontab da VPS Hetzner dispara `/api/cron/run` 30/30min com Bearer. **É o piso residual de wake do Neon** | 2026-06-26 |
| [claude-chrome-sensitive-domains](pages/concepts/claude-chrome-sensitive-domains.md) | `Permission denied` em site sensível = prompt da extensão (aprovável), não bloqueio duro; protocolo de retry + workflow de secrets | 2026-06-10 |
| [optional-dependency-via-dynamic-import](pages/concepts/optional-dependency-via-dynamic-import.md) | Dependência opcional (Sentry) gated por env + `import(spec)` com specifier em variável + `webpackIgnore` → build verde sem o pacote; irmão de dev-fallback | 2026-06-13 |
| [migrations-not-auto-applied](pages/concepts/migrations-not-auto-applied.md) | **Incidente**: Vercel `build` não roda migration → drift → login/signup quebram invisíveis (select-all findUnique; catch engolia). Fix `vercel-build: migrate deploy && next build` | 2026-06-14 |
| [stateless-password-reset-token](pages/concepts/stateless-password-reset-token.md) | Reset single-use sem coluna/migration: HMAC(`NEXTAUTH_SECRET`+hash da senha) + TTL; trocar a senha invalida o token (padrão Django) | 2026-06-14 |
| [nextauth-credentials-authorize-stub](pages/concepts/nextauth-credentials-authorize-stub.md) | `CredentialsProvider` esconde a authorize em `.options.authorize` (topo é stub `()=>null`); `throw` chega em `signIn(...).error` no v4 | 2026-06-24 |
| [horizontal-scroll-from-offscreen-elements](pages/concepts/horizontal-scroll-from-offscreen-elements.md) | Badge reCAPTCHA `fixed right:-186px` + honeypot `left:-9999px` → scroll lateral mobile; esconder badge (+atribuição ToS) e honeypot via `clip` | 2026-06-24 |
| [scale-to-zero-defeated-by-db-health-pings](pages/concepts/scale-to-zero-defeated-by-db-health-pings.md) | Uptime monitor pingando `/api/health` (com DB) a cada 5 min impede o scale-to-zero do Neon → queima as 100 CU-hrs do Free. Fix: split liveness (sem DB) × readiness (com DB) | 2026-06-26 |
| [claude-chrome-per-profile-extension](pages/concepts/claude-chrome-per-profile-extension.md) | Extensão Claude-in-Chrome é por-perfil; deviceIds/nomes embaralham entre sessões → confirmar pela conta logada (WeCalc, nunca work), não pelo nome | 2026-06-26 |
| [owner-document-cpf-or-cnpj](pages/concepts/owner-document-cpf-or-cnpj.md) | Documento do dono CPF→CPF/CNPJ: campo único auto-detect, sem renomear coluna (no migration), hash compatível por dispatch de namespace (`cpf:`/`cnpj:`); paciente segue só CPF | 2026-06-26 |
| [entitlement-override-decoupled-from-billing](pages/concepts/entitlement-override-decoupled-from-billing.md) | Beta/cortesia: plano EFETIVO em read-time (`effectivePlanTier`) eleva entitlements sem mutar `plan`/`status` → reversível, cobrança intacta. Aplicar em TODOS os gates; reset/dunning ficam no plano REAL | 2026-06-26 |
| [currency-mask-cents-accumulator](pages/concepts/currency-mask-cents-accumulator.md) | Máscara monetária BR que preenche da direita (centavos): re-extrair dígitos do display a cada onChange cobre digitar+backspace+paste; cap = `slice(N)`; centavos inteiros, lógica pura separada do componente | 2026-06-26 |
| [tailwind-v4-button-cursor](pages/concepts/tailwind-v4-button-cursor.md) | Preflight do Tailwind v4 zera `cursor:pointer` dos `<button>`; fix na base do `Button` (cva) + `<button>` crus manuais | 2026-06-27 |
| [tiptap-flushsync-domnodeview](pages/concepts/tiptap-flushsync-domnodeview.md) | Editor de chips: node view DOM puro evita erro `flushSync` do ReactNodeViewRenderer; `nodeInputRule` sem grupo de captura (senão vira `{{nome}}`) | 2026-06-27 |
| [autofill-highlight-css](pages/concepts/autofill-highlight-css.md) | Neutralizar o fundo amarelo/azul do `:-webkit-autofill` com `box-shadow inset` + `text-fill-color`; depende do estado salvo do browser | 2026-06-27 |
| [next-themes-default-theme](pages/concepts/next-themes-default-theme.md) | `defaultTheme="system"` segue o SO no 1º acesso; `="light"` p/ claro como padrão; toggle extraído p/ usar nas telas de auth | 2026-06-27 |
| [next-dev-stale-css-after-build](pages/concepts/next-dev-stale-css-after-build.md) | `next build` deixa `.next` que faz o `next dev` servir CSS stale; restart/touch não bastam → limpar `.next` (via node `fs.rmSync`) | 2026-06-27 |
| [whatsapp-reply-fifo-match-and-ack](pages/concepts/whatsapp-reply-fifo-match-and-ack.md) | Resposta do paciente casa o PENDING mais antigo (FIFO, desempate `dateTime/id`) = ordem de leitura; ack de volta nomeando o agendamento (timeout, fora da cota); **gap de idempotência** (retry + ≥2 pendentes → duplo-confirma) | 2026-06-27 |
| [phone-mask-roundtrip-country-code](pages/concepts/phone-mask-roundtrip-country-code.md) | Máscara de telefone canônico↔display: strip do `55` só por tamanho reabsorve o `+55` como DDD ao digitar (acumula "5"); o `+` desambigua país vs DDD-55. Testar o componente, não a fiação | 2026-06-27 |
| [scrollbar-gutter-stable](pages/concepts/scrollbar-gutter-stable.md) | `scrollbar-gutter:stable` no scroller (`<main>`) mata o "pulo" horizontal entre página que rola × que não rola; em macOS overlay (barra 0px) não reproduz mas o fix é seguro | 2026-07-04 |
| [nextauth-getserversession-noop-res](pages/concepts/nextauth-getserversession-noop-res.md) | `getServerSession` (RSC, 1 arg) roda o callback `jwt` mas usa `res` no-op → cookie reescrito é descartado; throttle via `token.checkedAt` não persiste no servidor → usar cache em memória (`Map<userId,ts>`) | 2026-07-04 |
| [external-event-firewall](pages/concepts/external-event-firewall.md) | Registros de fonte externa (Google Calendar) em **tabela separada só-leitura**, não coluna `source` em `Appointment` — senão o scheduler manda WhatsApp/marca NO_SHOW falso. Firewall físico > filtro que se esquece | 2026-07-05 |
| [soft-delete-skips-cascade-cleanup](pages/concepts/soft-delete-skips-cascade-cleanup.md) | Soft-delete nunca remove `User` → `onDelete:Cascade` **jamais dispara** → token OAuth vivo fica órfão (LGPD). Teardown explícito: pós-commit, isolado, keep-on-failure + retry na purga | 2026-07-05 |
| [oauth-scope-check-before-persist](pages/concepts/oauth-scope-check-before-persist.md) | Callback valida escopo concedido **antes** do upsert → **não existe "meio conectado"**; fresh connect sem o escopo rejeita limpo (revoga o grant novo, não grava linha) | 2026-07-10 |
| [oauth-state-cookie-ttl-expiry](pages/concepts/oauth-state-cookie-ttl-expiry.md) | Cookie de state/PKCE expira em ~10 min → consent real lento (aviso "app não verificado") estoura em `gcal_error=state` mesmo com o escopo concedido; ≠ scope-mismatch | 2026-07-10 |
| [google-oauth-verification-sensitive-scope](pages/concepts/google-oauth-verification-sensitive-scope.md) | Verificação de escopo **sensível** (`calendar.events.readonly`): exige política c/ Uso Limitado + nome↔domínio + logo. **CNPJ NÃO exigido** (CPF ok); vídeo geralmente não (é de escopo *restrito*) | 2026-07-10 |
| [vercel-preview-build-no-db-creds](pages/concepts/vercel-preview-build-no-db-creds.md) | Preview deploy falha no `vercel-build` (`prisma migrate deploy` sem `DIRECT_URL`/`DATABASE_URL`, Production-only por design). Não afeta prod; fix cosmético = guard `VERCEL_ENV` | 2026-07-10 |

## Synthesis (`pages/synthesis/`)

Sumários cruzados, comparações, teses evolutivas.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| [monetization-v2-state](pages/synthesis/monetization-v2-state.md) | Snapshot vivo: **v2 EM PRODUÇÃO** (9/11 + Sprint 10 em progresso: admin/atividade, reset de senha, emails transacionais), incidente de migration, Sentry+UptimeRobot ativos | 2026-06-14 |
| [google-calendar-integration-state](pages/synthesis/google-calendar-integration-state.md) | Feature de core que destrava o PREMIUM. Faseamento A→B→C; firewall `ExternalEvent`; OAuth separado. **🚀 Fase A EM PRODUÇÃO (dark)** desde 2026-07-10 (merge + deploy OK); E2E real validado (OAUTH-05/06/07 + overlay real); Vercel/OAuth/política configurados. GA pendente só de **verificação OAuth** + `hidden:false` | 2026-07-10 |

---

## Raw sources

| Bucket | Arquivos | Descrição |
| ------ | -------- | --------- |
| `raw/sessions/` | 18 | Sumários de sessões de trabalho. |
| `raw/articles/` | 0 | Web clips, papers, links externos. |
| `raw/decisions/` | 0 | ADRs e decisões arquiteturais brutas. |

---

## Convenções

- Slugs em `kebab-case`, em inglês.
- Toda página tem frontmatter (ver `_TEMPLATE_page.md`).
- Wikilinks `[[slug]]` para referência interna.
- Cross-refs explícitos para `.context/features/<feature>.md` quando aplicável.
