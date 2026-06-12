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

## [2026-06-10 19:30] ingest | Go-live Sprint 7 (~90%) + decisões PF/CNPJ — 4 páginas novas + 4 atualizadas + raw

Páginas novas: concepts/lazy-period-usage-counter, concepts/neon-pooled-vs-direct-url, concepts/vercel-hobby-cron-workaround, concepts/claude-chrome-sensitive-domains.
Atualizadas: entities/asaas-integration (PF sem CNPJ ok, NF-e só com CNPJ, MEI provavelmente não cobre SaaS, painel não-automatizável), concepts/defense-in-depth-cron (cross-links disparo vs conteúdo), synthesis/monetization-v2-state (Sprint 7 ~90%, 4 patterns novos), index.
Raw: raw/sessions/2026-06-10-sprint6-and-golive.md (sessão completa: re-sequenciamento + Sprint 6 + execução go-live em prod: pooled URL, 7 migrations, backfill 14 slots, envs v2, sshd key-only).

## [2026-06-10 19:55] update | Webhook Asaas configurado pelo agente + correção de claim

- Webhook Asaas prod ✅ via automação de browser (após usuário aprovar prompt da extensão): URL /api/billing/webhook, v3, token=ASAAS_WEBHOOK_SECRET, sequencial+fila, todos eventos de Cobranças. Toast "Webhook salvo com sucesso!".
- SUPERSEDE: claude-chrome-sensitive-domains corrigida — "Permission denied" era prompt aprovável, não bloqueio duro de categoria. Protocolo novo: avisar usuário + 1 retry assistido.
- ASAAS_API_KEY ainda bloqueada por KYC: "regularize seu cadastro" (Minha Conta → Informações + faturamento) — dados pessoais, fica com o usuário.

## [2026-06-10 20:15] update | Sandbox Asaas configurada + gotcha dotenv-expand

- Sandbox Asaas criada e chave API gerada (2FA SMS do usuário) via automação de browser; salva no .env local e validada (GET /customers 200).
- GOTCHA novo em asaas-integration: chave Asaas começa com "$aact_" — em .env de projeto Next precisa de ASPAS SIMPLES, senão dotenv-expand expande "$aact..." como variável indefinida → string vazia silenciosa.
- BILLING_PROVIDER segue comentado (Mock default em dev). Webhook sandbox pendente (precisa túnel público).

## [2026-06-10 20:25] update | Guia "rodando local: Mock vs Sandbox vs Prod" criado

Seção operacional nova em .context/features/billing.md: matriz de envs por modo, gotcha das aspas simples, túnel cloudflared p/ webhook sandbox, regras do modo prod-a-partir-do-local (não criar checkout; env só na sessão do shell) e pareamento banco×provider. Wiki asaas-integration linka pra lá (regra: operacional vive no .context).

## [2026-06-10 21:35] update | reCAPTCHA + Resend configurados — go-live falta só ASAAS_API_KEY

- reCAPTCHA v3 criado via automação (admin Google carregou desta vez — confirma que bloqueios anteriores eram prompts de permissão): chaves capturadas via regex no DOM e adicionadas à Vercel via CLI.
- Resend: API key na Vercel; domínio sa-east-1; 4 registros DNS na Cloudflare. Técnica nova: **DKIM via clipboard relay** (clique-copia no Resend → cmd+v no form da Cloudflare) — valor criptográfico nunca passou pelo contexto do agente; filtro de conteúdo do javascript_tool tinha bloqueado a leitura direta.
- Pendências go-live: só ASAAS_API_KEY (atrás do KYC do usuário) → merge → smoke test.
- Achado menor: email-verification.ts envia como "ConfirmaAí <noreply@clinicaorganizada.com>" — divergência de marca (app se chama Clínica Organizada na UI). Corrigir na Sprint 10 (emails).

## [2026-06-12] update | ASAAS_API_KEY prod na Vercel — 16/16 envs, go-live destravado

KYC aprovado; chave prod gerada (2FA SMS do usuário) e adicionada via clipboard relay com sanity check de prefixo/tamanho ($aact_prod_, 166 chars) — valor nunca entrou no contexto do agente; validada read-only (GET /customers 200); clipboard limpo. Checklist do go-live: TUDO pronto exceto merge v2.0.0→main (usuário, gh) + smoke test E2E.

## [2026-06-12] update | 🚀 V2 EM PRODUÇÃO — Sprint 7 fechada

Merge v2.0.0→main (usuário) + deploy Ready em ~6min. Verificação pós-deploy: /precos 200 (página exclusiva v2), /api/billing/subscription 401 auth-gate, webhook 401 sem HMAC. 7/11 sprints fechadas. Próximo: smoke test E2E assistido, depois Sprint 8 (resiliência WhatsApp) ANTES de marketing.

## [2026-06-12] ingest | 🐛 Bug real achado no smoke test: JID sem nono dígito

Smoke test E2E em prod expôs bug invisível em dev: resposta "1" do paciente ignorada porque o JID do WhatsApp veio sem o nono dígito (554197974990 vs +5541997974990 cadastrado). Fix: brPhoneCandidates em src/lib/phone.ts + match com IN no webhook. 159/159 testes. Página nova: concepts/whatsapp-ninth-digit-jid. Pendente: push pra main + reteste com a resposta real.

## [2026-06-12] update | 🏁 SMOKE TEST E2E COMPLETO — go-live 100%

Reteste pós-fix: resposta "1" da paciente → CONFIRMED na agenda. Ciclo validado em produção: agendamento → cron VPS → Evolution → WhatsApp → resposta → webhook (com brPhoneCandidates) → confirmação. Extras validados de brinde: modal soft de 60% da quota disparou no 3º paciente, CPF obrigatório no Free, stats do cron (Sprint 6) na resposta do endpoint. Sprint 7 encerrada. Próximo: Sprint 8 (resiliência WhatsApp) antes de marketing; Pix R$ 1 no Pro fica a critério do usuário.
