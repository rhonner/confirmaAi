# Sessão 2026-06-10 — Re-sequenciamento, Sprint 6 e go-live (Sprint 7 ~90%)

> Branch: `v2.0.0`. Sessão longa: análise de arquitetura → re-sequenciamento do roadmap → Sprint 6 completa → execução do go-live em produção.

## Contexto / pedido do usuário

Premissa formalizada: **"deixar o projeto rodando e vendendo sozinho, me preocupando apenas com marketing e pequenas melhorias; escala e lucro lado a lado; sem precisar trocar banco/arquitetura depois de vender"**.

## Parte 1 — Análise e re-sequenciamento

- Análise por camada concluiu: stack atual escala sem rewrite (§9.4 de `monetization-v2.md`). Riscos reais são **operacionais e silenciosos**, não arquiteturais.
- Sprints re-sequenciadas: 6 (gates+hardening) / 7 (go-live, nova) / 8 (resiliência WhatsApp, nova) / 9 (observabilidade, nova) / 10 (ex-7) / 11 (ex-8).

## Parte 2 — Sprint 6 (fechada)

- `usage.ts` com período lazy (sem job de reset) — pattern em `pages/concepts/lazy-period-usage-counter.md`.
- Gate no scheduler com dedup de `QUOTA_BLOCKED`; chunking 200/lote + budget 45s; índices compostos; audit `cron.run` com stats.
- 79/79 test:sprints, 155/155 vitest, walk-through Chrome 6 cenários.

## Parte 3 — Go-live (descobertas + execução)

### Descobertas (estado real ≠ documentado)
- Produção v1 **já estava no ar**: `clinicaorganizada.com` (Vercel) + `evolution.clinicaorganizada.com` (Hetzner, HTTPS). `deployment-status.md` estava 5 semanas desatualizado.
- VPS já hardened (UFW/fail2ban/swap/unattended); Evolution v2.3.7 + PG16 + Redis up 5 semanas.
- **Crontab da VPS já resolvia o limite do Vercel Hobby** (cron 1×/dia): `*/30 * * * * clinica-cron.sh` → `GET /api/cron/run` com Bearer. Pattern em `pages/concepts/vercel-hobby-cron-workaround.md`.
- `DATABASE_URL` de prod era Neon **direta (sem -pooler)** — risco de esgotar conexões serverless. Pattern em `pages/concepts/neon-pooled-vs-direct-url.md`.
- Users de prod: 8, todos contas de teste (nenhum WhatsApp CONNECTED). Janela de migração segura.

### Executado em produção (2026-06-10)
- sshd → key-only (`/etc/ssh/sshd_config.d/99-hardening.conf`).
- `DATABASE_URL` → pooled (via `vercel env`).
- Envs novas: `CPF_HASH_PEPPER` (gerada, **imutável**), `BILLING_PROVIDER=ASAAS`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_SECRET` (gerada).
- 7 migrations v2 aplicadas (`migrate deploy` na URL direta) + `backfill-quota-slots.ts` com pepper de prod: 14 slots, 8/8 Subscriptions.

### Bloqueios de automação
- Extensão Claude/Chrome **bloqueia sites financeiros** (Asaas) — gotcha em `pages/concepts/claude-chrome-sensitive-domains.md`. Asaas/reCAPTCHA/Resend ficam manuais pro usuário.

## Decisões de negócio

- **Começar a vender como Pessoa Física** (Asaas aceita PF). NF-e indisponível até CNPJ — ok pra validar, gargalo pra escalar B2B (clínicas pedem nota).
- **MEI provavelmente não cobre SaaS** (CNAEs de software fora da lista) — caminho provável: ME no Simples. Confirmar com contador antes.

## Pendências ao fim da sessão

1. Usuário: `ASAAS_API_KEY` + webhook no painel Asaas; reCAPTCHA v3 keys; `RESEND_API_KEY` (+ DKIM/SPF depois).
2. Merge `v2.0.0` → `main` (usuário, via gh) **após** as 4 envs.
3. Smoke test E2E em produção.
