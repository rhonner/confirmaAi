# Log — Wiki ConfirmaAí

> Append-only. Uma entrada por evento (ingest | query | lint | meta).
> Formato: `## [YYYY-MM-DD HH:mm] <op> | <resumo> — <páginas tocadas>`

---

## [2026-05-03 15:56] meta | wiki criada — schema, index, templates, hooks SessionStart/End

Estrutura inicial em `.wiki/` definida. Schema em `AGENTS.md`. Hooks de
`SessionStart` (status injection) e `SessionEnd` (PENDING marker) registrados
em `.claude/settings.json`. Slash commands `/wiki-ingest` e `/wiki-lint` criados.

Estado: 0 páginas, 0 fontes raw. Próxima sessão: a primeira ingestão real.

## [2026-05-07 19:00] ingest | Sprints 1-3 monetização v2 — 8 páginas novas + index + raw

Primeira ingestão real. Capturou aprendizados das 3 primeiras sprints (auditoria,
quota vitalícia, UX paywall) + decisão revertida (cross-tenant CPF de paciente)
+ regra de Chrome MCP no Definition of Done.

Páginas criadas:
- entities: prisma-v7-extensions, radix-popover-and-dialog
- concepts: timezone-on-vercel, append-only-via-pg-trigger, quota-ledger-immortal-slot, identifier-hash-namespacing, rate-limit-via-audit
- synthesis: monetization-v2-state

Raw source: `raw/sessions/2026-05-07-sprint-1-3-monetizacao.md`.

Estado: 8 páginas, 1 raw. Próxima ingestão provavelmente após Sprint 4 (anti-fraude signup).

## [2026-05-07 22:50] ingest | Sprints 4 + 5 (anti-fraude signup + cobrança Asaas) — 5 páginas novas + sintese atualizada

Continuação da primeira ingestão (mesma sessão de trabalho, blocos 4 e 5
completados após pausa). Capturou aprendizados de anti-fraude no signup
(reCAPTCHA/Resend/disposable/CPF cross-tenant/honeypot) e cobrança real
(BillingProvider abstraction, MockProvider, webhook idempotente, lifecycle).

Páginas criadas:
- entities: asaas-integration
- concepts: webhook-idempotency-via-unique-constraint, dev-fallback-without-secrets, defense-in-depth-cron, rhf-radix-gotcha

Páginas atualizadas:
- synthesis: monetization-v2-state (Sprints 4+5 ✅, dívidas Sprint 1 quase todas cross-out)

Raw source: `raw/sessions/2026-05-07-sprint-4-5-monetizacao.md`.

Estado: 13 páginas, 2 raw. Próxima ingestão provavelmente após Sprint 6 (mensagens + gates) ou agrupando 6+7.

## [2026-06-10] update | Roadmap re-sequenciado para autonomia operacional

Premissa do fundador formalizada: "deixar o projeto rodando e vendendo sozinho, só marketing + pequenas melhorias; escala e lucro lado a lado, sem trocar banco/arquitetura depois de vender".

- `monetization-v2.md` §9.4 nova: invariantes de escala por camada — conclusão: stack atual (Next monolito + Postgres multi-tenant por userId + Vercel cron + Evolution VPS + Asaas atrás de interface) escala sem rewrite; cada camada tem "botão" (pooled DB URL, chunking do cron, resize da VPS, swap de provider = 1 arquivo).
- Sprints re-sequenciadas: 6 = gates de mensagem + hardening escala scheduler (chunking, índices, duração no audit); 7 = go-live (nova, bloqueada por domínio); 8 = resiliência WhatsApp (nova — anti-churn silencioso, email ao tenant desconectado, health-check Evolution); 9 = observabilidade (nova — Sentry + /api/health + uptime monitor); 10 = ex-7 (dunning/emails/admin/retention); 11 = ex-8 (LGPD, pré-marketing pesado).
- Insight central: os riscos de "vender e quebrar" NÃO são arquiteturais — são operacionais e silenciosos (WhatsApp do tenant desconecta e scheduler o filtra pra fora sem avisar ninguém; cron morre; webhook billing trava). 
- synthesis: monetization-v2-state atualizada (tabela 11 sprints).

## [2026-06-10] ingest | Sprint 6 fechada + go-live ~70% descoberto

- **Sprint 6 ✅**: quota de mensagens operacional. Padrões: UsageCounter **lazy por período** (sem job de reset — virada = nova linha keyed `userId+periodStart`; ciclo pago expirado por webhook perdido cai pro mês calendário, contador nunca congela); bloqueio com **dedup** (`MessageLog QUOTA_BLOCKED` 1× por appointment+type, senão spam a cada run); chunking 200/lote + time-budget 45s com `stats.truncated`; índices compostos `Appointment(status,confirmationSentAt)`/`(status,dateTime)`; audit `cron.run` com stats = heartbeat pra Sprint 9. 79/79 sprints-checks, 155/155 vitest, walk-through Chrome 6 cenários.
- **Descoberta**: produção JÁ está no ar — `clinicaorganizada.com` (Vercel, main = v1 sem monetização) e `evolution.clinicaorganizada.com` (Hetzner, HTTPS ok). `deployment-status.md` estava 5 semanas desatualizado.
- **Gotcha de produção**: `vercel.json` cron = `0 3 * * *` (Vercel **Hobby limita a 1×/dia**) — scheduler.md dizia 30min. Lembretes de 2h não funcionam com cron diário. Fix planejado (Sprint 7): disparo externo 15-30min no `POST /api/cron/run` com Bearer CRON_SECRET (crontab da VPS Hetzner = opção sem custo).
- Branch: `v2.0.0` = main + 1 commit gigante (sprints 1-6). Merge → main é o ato final do go-live (junto com `prisma migrate deploy` em prod).
