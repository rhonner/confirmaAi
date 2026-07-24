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

## [2026-06-12] ingest | 🔴 Bug crítico de billing achado no teste de pagamento real

Pix R$ 3 real pago → webhook PAYMENT_RECEIVED ok, mas plano não subia de FREE: handler procurava externalReference em payload.subscription/topo, Asaas envia em payload.payment.externalReference. Em prod = todo cliente pagaria e ficaria Free. Fix: helper planTierFromPayload (3 fontes) + 5 testes regressão (164/164). Conta teste reconciliada p/ PRO manualmente. Diagnóstico via tabela BillingEvent de prod (fonte de verdade do billing). Página nova: concepts/asaas-external-reference-in-payment. O teste real pagou 3 bugs: chave Pix ausente, assinatura duplicada no retry, externalReference. Pendente: commit+push do fix, depois reenviar webhook do Asaas pra validar fim-a-fim.

## [2026-06-12] update | ✅ Fix de billing validado em PRODUÇÃO com pagamento real

Conta teste 2 (limpa, pós-deploy do fix planTierFromPayload): signup v2 completo → checkout Pix → pagou R$3 real → webhook PAYMENT_RECEIVED → plano virou PRO AUTOMATICAMENTE → redirect /billing/sucesso + badge Pro. Zero intervenção manual. O ciclo de cobrança Asaas está 100% validado fim-a-fim em produção. Pendências de limpeza: cancelar assinaturas de teste (testepagto, testepagto2, órfã sub_3m1b00oia8grmdp2) no painel Asaas pra não cobrar mês que vem.

## [2026-06-12] update | Marca unificada: ConfirmaAí → Clínica Organizada

Item 2 dos bloqueadores de marketing resolvido. 11 ocorrências de "ConfirmaAí" em 5 arquivos de src/ trocadas por "Clínica Organizada" (email-verification from/subject/body, precos title/desc/footer/FAQ, paywall-modal, asaas description, verificar-email title). Concordância de gênero corrigida (Clínica = feminino: à/da/a, não ao/do/o). 164/164 testes, tsc e build limpos. .context/.wiki mantêm "ConfirmaAí" como registro histórico (nome de produto original do CLAUDE.md). Reduz combustível do flag de Safe Browsing (nome agora bate com domínio clinicaorganizada.com). Pendente: deploy (commit+push) + nudge do Search Console.

## [2026-06-12 fim] ingest | Fechamento da sessão — go-live concluído, snapshot de descanso

Consolidação final do dia: synthesis/monetization-v2-state atualizada (título, 7/11 sprints, seção bloqueadores de marketing, tabela de 5 bugs do go-live, snapshot de descanso com próximos passos e contas de teste). deployment-status.md ganhou seção de limpeza pendente + recursos de produção. Raw nova: 2026-06-12-golive-completo-e-validacao-pagamento. index atualizado. ESTADO: v2 em produção e vendendo, fluxo validado fim-a-fim com Pix real. Descanso. Próxima: limpar assinaturas teste Asaas → monitorar Safe Browsing → Sprint 8 (resiliência WhatsApp).

## [2026-06-13] update | Verdade nos planos: Premium oculto, features vapor removidas, gate CSV aplicado

Auditoria promessa×código: Premium vendia 4 features inexistentes (multi-prof, GCal, NF-e, API); Pro+Premium vendiam "Relatórios avançados" (flag sem uso); e o export CSV prometido como pago estava ABERTO pro Free (gate nunca aplicado). Decisão founder: PLANS.PREMIUM.hidden=true (some da venda, checkout 400 por URL, assinante existente ainda vê), FEATURE_ROWS só com o real, gate export.csv aplicado nas 2 rotas, upsell de msgs do Pro sem target (Premium oculto). Reintrodução do Premium: quando multi-prof OU GCal existirem. 164/164 testes, 79/79 sprints, build ok, /precos validado no Chrome (2 cards honestos). Registrado em monetization-v2.md §11.5.

## [2026-06-13] update | Decisão: dev local testa billing contra SANDBOX Asaas (prioridade nº 1)

Founder decidiu: teste manual de billing em dev usa sandbox real, não Mock — justificativa empírica: Mock passou em tudo no go-live e a API real revelou 5 bugs de shape. Mock rebaixado a offline/CI/mock-trigger. Escopo registrado como item pré-Sprint 8 em monetization-v2.md: flip do BILLING_PROVIDER no .env (credenciais sandbox já existem), script dev-tunnel.sh (cloudflared + registro automático do webhook sandbox via API), validação do ciclo completo, docs. billing.md § Rodando local atualizado (Sandbox = recomendado).

## [2026-06-13] ingest | ✅ Prioridade nº 1 ENTREGUE: dev local integrado ao sandbox Asaas + 3 bugs reais

Setup completo e ciclo validado fim-a-fim em dev: BILLING_PROVIDER=ASAAS + ASAAS_WEBHOOK_SECRET local no .env, scripts/dev-tunnel.sh (cloudflared + upsert do webhook "confirmaai-dev-tunnel" via API, desabilita no exit), chave Pix EVP criada na sandbox, pagamento via receiveInCash → webhook real pelo túnel → PRO/ACTIVE + /billing/sucesso no Chrome. O teste sandbox pagou em 1 hora: (1) SUPERSEDE em asaas-integration — aspas simples NÃO protegem $aact_ no loader do Next 16, escape obrigatório é \$ (claim antiga só valia pra tsx/dotenv puro); (2) BUG DE PROD — payment.nextDueDate não existe no payload Asaas → currentPeriodEnd ficava null → cancelamento nunca expiraria no cron; fix deriveNextDueDate (dueDate+1mês) + 3 regressões com payload real; (3) checkout mostrava "[DEV] MockProvider" em modo sandbox — gate trocado de NODE_ENV pra provider na resposta. Gotchas novos: fila sequencial do webhook sandbox atrasa minutos após restart do dev server; pagamento de sub órfã não resolve userId (reconciliação, correto). 167/167 vitest, 79/79 sprints, build ok. Limpeza: 3 subs sandbox canceladas, estado local restaurado (PRO/ACTIVE, provider ids nulos; User.cpf fake mantido p/ futuros testes). PENDENTE: commit+push do fix deriveNextDueDate pra produção (afeta clientes que cancelarem).

## [2026-06-13] update | ✅ Sprint 8 fechada: resiliência WhatsApp (anti-churn silencioso)

A maior ameaça ao "rodar sozinho" tratada: desconexão da Evolution não é mais silenciosa. Detecção na transição CONNECTED→DISCONNECTED em 2 pontos (webhook close + downgrade do poll — cobre webhook perdido) → whatsappDisconnectedAt + audit whatsapp.disconnected + email imediato. Sweep no cron (runWhatsappResilience): regra pura shouldRenotifyDisconnected (dedup 1 email/24h; com agendamentos futuros renotifica diariamente + audit disconnected_with_pending; sem, reforço único na janela 24-48h e silencia). Health-check Evolution (DOWN → audit evolution.health_failed, pronto pro /api/health da Sprint 9) + métrica whatsappConnectedPct nas SchedulerStats. Banner vermelho persistente no layout (só pra quem JÁ conectou; desconexão intencional zera tracking e não nagga). Infra nova: src/lib/email.ts genérico (Resend + fallback console em dev) extraído do email-verification — base pro dunning da Sprint 10. Helper scripts/toggle-whatsapp-state.ts. Validação: 174/174 vitest, 87/87 sprints (8 checks novos incl. sweep funcional), build ok, Chrome walk-through com a cadeia real (poll → Evolution unknown → downgrade → email logado + audit + banner; CTA → /configuracoes; reset → banner some). 8/11 sprints. Próximo: Sprint 9 (observabilidade). PENDENTE: commit+push (Sprint 8 + fix deriveNextDueDate da sessão sandbox).

## [2026-06-13] ingest | Closeout do stub pendente 2026-06-10-1834 (superseded, zero duplicação)

Pendência da wiki encerrada. O `2026-06-10-1834-PENDING.md` era um checkpoint criado por hook SessionEnd no meio da sessão longa de 2026-06-10 — a mesma sessão continuou e foi ingerida de forma muito mais rica no mesmo dia (log 19:30→21:35) em raw/sessions/2026-06-10-sprint6-and-golive.md + páginas datadas 2026-06-10 (lazy-period-usage-counter, neon-pooled-vs-direct-url, vercel-hobby-cron-workaround, defense-in-depth-cron, claude-chrome-sensitive-domains, asaas-integration, monetization-v2-state). Nada novo a extrair. Ação: stub preenchido com nota "superseded by" + cross-refs, renomeado pra 2026-06-10-1834-sprint6-golive-checkpoint.md (status: superseded), index raw/sessions 4→5. Zero páginas novas/editadas — seria duplicação.

## [2026-06-13] ingest | ✅ Sprint 9 (observabilidade) fechada + sincronização da synthesis (Sprint 8 estava stale)

Sprint 9 entregue: `GET /api/health` (200/503) agregando 4 checks (cron morto >90min via audit cron.run, BillingEvent travado >1h, Evolution DOWN, DB) com `evaluateHealth` pura + testada; seam `captureError` em `src/lib/observability` (console por padrão, Sentry encaminhado se SENTRY_DSN) + `onRequestError` (hook Next 16) + reporte com tenant no cron e no webhook de billing. Régua: tsc/build limpos, 182/182 vitest (8 novos), 93/93 sprints (6 novos), comportamento real validado via curl (503 sem cron → 200 com heartbeat). Página nova: concepts/optional-dependency-via-dynamic-import (Sentry gated por env + import dinâmico com specifier-em-variável + webpackIgnore → build verde sem o pacote; padrão irmão de dev-fallback-without-secrets, que ganhou cross-ref). Operacional vive em .context/features/observability.md (não duplicado na wiki). Aproveitei pra corrigir a synthesis monetization-v2-state que estava em 7/11 com Sprint 8 ⏳ (já fechara em 2026-06-13): agora 9/11 com 8 e 9 ✅. PENDENTE (não-código): criar monitores UptimeRobot/BetterStack apontando pra /api/health + app + Evolution; commit+push (usuário, via gh).

## [2026-06-13] update | Sentry ativado de verdade + gotcha do nft no import dinâmico

Decisão do founder: ligar o Sentry (free tier) agora, não adiar. Feito: @sentry/nextjs instalado, projeto clinica-organizada-web criado, SENTRY_DSN na Vercel (Production, prod-only — comentado no .env local pra não queimar quota com erros de dev), entrega validada via smoke test (Sentry.flush()→true). APRENDIZADO não-óbvio (atualizado em concepts/optional-dependency-via-dynamic-import): o truque "specifier em variável + webpackIgnore" mantém o build verde SEM o pacote, mas ao ADOTAR a dependência ele vira armadilha — o @vercel/nft não rastreia specifier variável → o pacote não entra no bundle serverless → Sentry falha MUDO em prod (MODULE_NOT_FOUND engolido pelo catch). Fix: trocar pra string literal `import("@sentry/nextjs")` no commit que instala o pacote (continua lazy via gate por DSN, mas vira rastreável). Regra: specifier variável = "pode não existir"; literal = "existe, só carregue tarde". Operacional em .context/features/observability.md.

## [2026-06-14] ingest | Incidente de migration + Sprint 10 (fatias 1, 2.1, 2.2) + Sentry/UptimeRobot validados em prod

Sessão longa ingerida. Destaques: (1) 🔴 INCIDENTE — migration da Sprint 8 deployada no código mas não aplicada no banco → login/signup quebrados ~1 dia em prod, invisíveis (select-all findUnique quebra; select:{id} sobrevive; catch do register engolia o erro → nem Sentry via). Fix: migrate deploy via URL direct + prevenção vercel-build (migrate deploy && next build) + DIRECT_URL pro DDL + captureError no register. Página nova: concepts/migrations-not-auto-applied. (2) Reset de senha real (era stub): token assinado stateless (HMAC + hash da senha = single-use sem migration) → página nova concepts/stateless-password-reset-token; validado E2E em prod (Resend "Delivered"). (3) Emails transacionais (boas-vindas/pagamento/cancelamento) reusando layout; gotcha do try/catch isolado no webhook. (4) Sprint 10 fatia 1: /admin/audit + /configuracoes/atividade. (5) Sentry instalado e ATIVO em prod (validado via probe); UptimeRobot 3 monitores. Atualizados: neon-pooled-vs-direct-url (DDL precisa de DIRECT_URL), synthesis/monetization-v2-state (Sprint 10 em progresso + incidente), index. Raw nova: 2026-06-14-migration-incident-sprint10. PENDENTE no roadmap: fatia 2.3 (perto-do-limite + dunning), retention 90d, reset conta Free, checkout CPF-null. Operacional vive em .context (admin.md, auth.md, billing.md, observability.md, deployment-status.md) — wiki não duplica.

## [2026-06-24 22:45] ingest | Bugfix dos 4 bugs de cadastro/login (relato dos sócios) + review adversarial

Sessão ingerida. 4 bugs corrigidos no fluxo cadastro/login e validados no Chrome MCP + review adversarial (workflow 10 agentes → 3 hardenings). Páginas NOVAS: concepts/nextauth-credentials-authorize-stub (a authorize real fica em `providers[0].options.authorize` — topo é stub `()=>null`; e `throw` no authorize chega em `signIn(...).error` no v4, base do gate de e-mail) e concepts/horizontal-scroll-from-offscreen-elements (badge reCAPTCHA `fixed right:-186px` + honeypot `left:-9999px` causam scroll lateral mobile; fix = esconder badge + atribuição ToS, honeypot via clip). ATUALIZADA: concepts/rate-limit-via-audit (limite só por IP é spoofável via X-Forwarded-For → 2ª dimensão keyed na conta-alvo/userId; caso resend-verification). Decisões de produto e detalhe operacional (login bloqueado até confirmar e-mail, endpoint resend, modal de termos, normalização de e-mail + migration collision-safe) vivem em .context/features/auth.md e lgpd-account.md — wiki não duplica. Raw nova: 2026-06-24-bugfix-cadastro-login. Também resolvida a fila PENDING: 2026-06-14-2054-PENDING (era stub duplicado do incidente de migration, já ingerido) → renomeada p/ 2026-06-14-2054-sprint10-checkpoint. Regressão: test:sprints checks 11.30–11.35.

## [2026-06-26 15:16] ingest | Corte de custo Neon (scale-to-zero vs health pings)

Sessão de infra/custo ingerida. Causa-raiz: o UptimeRobot pingava `/api/health` (com queries no DB: `AuditLog.findFirst` + `BillingEvent.count`) a cada 5 min, 24/7 → o compute do Neon nunca fazia scale-to-zero → ~118 CU-hrs/mês, estourando o cap Free de 100. Fix deployado: novo `GET /api/health/live` (liveness SEM DB) + UptimeRobot repontado (live @5min, `/api/health` profundo @30min). Provado em prod com DB quebrado: live=200, deep=503. Custo Launch (se subir) é usage-based ($0.106/CU-h, $0.35/GB-mês) ~US$12-13/mês no uso atual, ~US$2-4 após o fix — provavelmente segue no Free (US$0). Decisão: manter observabilidade ligada em alpha (cron morto = produto silenciosamente quebrado), alertar na 1ª falha. Páginas NOVAS: concepts/scale-to-zero-defeated-by-db-health-pings (gotcha + fix split liveness/readiness; por que NÃO cachear em serverless), entities/neon-postgres (host de prod, cap Free 100 CU-hrs, billing gerenciado pela Vercel, pricing Launch, scale-to-zero), concepts/claude-chrome-per-profile-extension (extensão por-perfil; deviceIds/nomes embaralham → confirmar pela conta logada WeCalc, nunca work). ATUALIZADA: concepts/vercel-hobby-cron-workaround (cron 30-min = piso residual de wake do Neon; afrouxar p/ 60min economiza mais). Operacional vive em .context/features/observability.md — wiki não duplica. Raw nova: 2026-06-26-neon-cost-scale-to-zero. Regressão: test:sprints check 9.7.

## [2026-06-26 15:52] ingest | Documento do dono CPF → CPF/CNPJ + auditoria de máscaras

Ingerida a mudança que faz o documento do dono (signup + checkout) aceitar **CPF ou CNPJ** (clínica costuma ser PJ; Asaas cobra via `cpfCnpj`, que aceita os dois). Página NOVA: concepts/owner-document-cpf-or-cnpj — 3 decisões não-óbvias: (1) campo único auto-detectável pelo tamanho (≤11 CPF / 14 CNPJ), sem seletor; (2) NÃO renomear a coluna `cpf`/`cpfHash` (guarda os dois) → zero migration/risco; (3) hash compatível por **dispatch de namespace** (`hashDocument`: CPF mantém `cpf:` → hashes já gravados intactos, CNPJ usa `cnpj:`) — extensão de identifier-hash-namespacing. Paciente segue **só CPF** (não alargar o identificador de quota). Asaas/Pix intactos (documento só identifica o pagador). Auditoria de máscaras monetárias: único input é avgAppointmentValue, já mascarado (CurrencyInput) — nada a corrigir. Verificado: tsc/vitest(252)/build/test:sprints(124, check 11.36)/Chrome MCP/API+DB(CNPJ→201, 14 dígitos)/review adversarial. Operacional em .context/features/auth.md § "Documento do dono (CPF/CNPJ)" + billing.md — wiki não duplica. Raw nova: 2026-06-26-cpf-cnpj-owner-document.

## [2026-06-26 17:16] ingest | Flag de beta tester (premium cortesia) desacoplada da cobrança

Ingerida a feature de "beta tester / cortesia": acesso PREMIUM grátis, liga/desliga, sem efeito na cobrança. Página NOVA: concepts/entitlement-override-decoupled-from-billing — padrão: resolver o **plano EFETIVO em read-time** (`effectivePlanTier`, a partir de `Subscription.adminOverrideUntil`) SEM mutar `plan`/`status`/`providerSubscriptionId`, então é reversível e a cobrança (webhook/cron/Asaas) segue no estado real. 2 armadilhas: (1) aplicar o plano efetivo em TODOS os gates (eram 4: entitlements, quota, usage, subscription endpoint) ou o override vaza; (2) o que é do estado real (canResetFreeAccount, dunning, suspensão) fica no plano REAL — inclusive filtrar contas com override do dunning (senão "pagamento em atraso" pra quem tem cortesia). Toggle: painel /admin/audit (seção Empresas — acesso beta, POST /api/admin/override + GET /api/admin/accounts) + script set-beta-override.ts. Campos já existiam no schema → zero migration. Verificado: tsc/vitest(258)/build/test:sprints(125, check 11.37)/Chrome MCP/review adversarial. Operacional em .context/features/billing.md § "Override admin / beta tester" + admin.md — wiki não duplica. Raw nova: 2026-06-26-beta-override.

## [2026-06-26 17:42] ingest | Máscara monetária acumuladora (centavos, RTL)

Ingerida a máscara do campo "valor médio da consulta". Página NOVA: concepts/currency-mask-cents-accumulator — técnica: o display é sempre os centavos formatados, e a cada onChange re-extrai os dígitos (`replace(/\D/g,"").slice(0,N)`) e reinterpreta → um único handler cobre digitar/backspace/paste; cap = slice(N) na string de dígitos (7 = 99.999,99); trabalha em centavos inteiros e converte pra reais só no contrato; lógica pura (`src/lib/currency-mask.ts`) separada do componente client p/ testar em vitest/test-sprints. Verificado no Chrome MCP (5→0,05 … 5.731,28, cap 99.999,99). Operacional em .context/features/settings.md. Raw nova: 2026-06-26-currency-mask.

## [2026-06-27 22:01] ingest | Feedback de UI/UX da sócia (Paonetone) — 8 ajustes

Ingerida a sessão dos 8 ajustes vindos da sócia (prints do WhatsApp). 5 páginas NOVAS de gotcha em concepts/: tailwind-v4-button-cursor (Preflight v4 zera cursor dos `<button>`; fix na base do componente Button + `<button>` crus), tiptap-flushsync-domnodeview (editor de chips de template: node view DOM puro evita o erro `flushSync` do ReactNodeViewRenderer; `nodeInputRule` SEM grupo de captura senão preserva as chaves e vira `{{nome}}`), autofill-highlight-css (neutralizar `:-webkit-autofill` com box-shadow inset — causa do "Nome da Clínica" destacado), next-themes-default-theme (`defaultTheme="system"` segue o SO; mudado p/ "light" como padrão + ThemeToggle extraído p/ telas de auth), next-dev-stale-css-after-build (`next build` deixa `.next` que faz o `next dev` servir CSS stale; limpar `.next` via node fs.rmSync). Itens entregues e validados no Chrome MCP (tsc/vitest 263/build/test:sprints 126): autofill, cursor pointer, textarea Observações (maxLength 2000 + scroll + contador), aviso de tags (preview amarela sem variável), tema claro padrão, barra sticky de salvar, editor de chips de template, mensagem amigável de login não-verificado (painel com foco + resend res.ok). Operacional em .context/features/settings.md (editor de chips, aviso, sticky), auth.md (login amigável, tema, cursor, autofill), appointments.md (textarea). Item 7 (chips) foi decisão do dono pela versão completa (TipTap). Conta de teste paonetone.teste@clinicareal.com.br criada e removida (cascade).

## [2026-06-27 22:40] ingest | Code-review da rodada Paonetone + raw da sessão criado

Finalizada a ingestão da sessão 2026-06-27 (feedback UI/UX da sócia). Criado o raw que faltava: raw/sessions/2026-06-27-paonetone-ui-feedback.md (estava citado como source nas 5 páginas novas mas não existia). Adendos de code-review em 2 páginas: tiptap-flushsync-domnodeview (§4 hardening — guarda de foco no sync `if editor.isFocused return`, hardBreak:false p/ round-trip simétrico, regex de variáveis de fonte única, refs em useEffect, a11y label→focus()+aria-labelledby) e next-themes-default-theme (toggle deve usar resolvedTheme, não theme, senão no-op no 1º clique com "system" salvo). Code-review (workflow xhigh, 15 achados) aplicou 9 fixes; e2e configuracoes 8/8 (seletores p/ o editor + drive-by da assertion velha do WhatsApp). index.md: raw/sessions 12→13. Wiki consistente (links .context→wiki e sources resolvem).

## [2026-06-28 00:12] ingest | Rodada 2 Paonetone (agenda Dia/Semana + WhatsApp FIFO/ack) + fix do telefone — 2 páginas novas, 1 cross-ref

Ingerida a rodada 2 do feedback da sócia (3 prints) + 1 bug do telefone. Sessão raw preenchida e renomeada: raw/sessions/2026-06-27-2252-paonetone-round2.md (era o stub -PENDING do hook). 2 páginas NOVAS em concepts/: whatsapp-reply-fifo-match-and-ack (resposta do paciente casa o agendamento PENDING mais ANTIGO — FIFO `confirmationSentAt asc` + desempate `dateTime/id` — alinhando à ordem de leitura; era LIFO; ack de volta nomeando o agendamento com timeout e fora da cota; **gap de idempotência**: retry da Evolution + ≥2 pendentes → duplo-confirma; casar por reply citado descartado) e phone-mask-roundtrip-country-code (campo de WhatsApp em Novo Paciente "aplicando 5": `getLocalDigits` só tirava o `55` por tamanho >11, mas o canônico curto mid-typing fazia o `+55` ser relido como DDD e acumular; fix usa o `+` como fronteira canônica; DDD-55 sem `+` preservado; lição: testar o componente real, não a fiação reimplementada). Cross-ref de contra-exemplo adicionado em webhook-idempotency-via-unique-constraint (este webhook NÃO é idempotente). Operacional em .context/features/{appointments,webhook-evolution,patients}.md e flows/confirmation-flow.md. Gate: tsc · vitest 278 · build · test:sprints 128 · walk-through Chrome MCP (GIF). index.md: +2 concepts, raw/sessions 13→14. Follow-up aberto p/ o dono: idempotência por message-id (migration, bloqueada pela cota Neon).

## [2026-07-04] session | Sessão revalidada/revogação + mini-calendário na agenda (4 tarefas) — 2 páginas novas

4 tarefas do dono, validadas E2E no Chrome MCP + gate completo (tsc · vitest 278 · build · test:sprints 128). (1) **Sessão**: callback `jwt` agora relê o `User` (atualiza nome/clínica; `deletedAt`/sumido → `token.revoked`), `session.error="AccountRevoked"` → `SessionGuard` (novo, no `(dashboard)/layout.tsx`) faz `signOut`; `SessionProvider` com `refetchInterval`+focus; Configurações chama `useSession().update()` (header reflete nome novo na hora). Corrige "logado mostrando info velha/vazia". (2) **Mini-calendário** `src/components/agenda/month-calendar.tsx` (autossuficiente, date-fns) num Popover no rótulo de data; selecionar dia seta `anchorDate`. (3) **Pontos** nos dias com agendamento (query `useAppointments(range,{enabled})` da grade visível). (4) **scrollbar-gutter:stable** no `<main>` mata o jitter horizontal. Code-review adversarial (workflow xhigh, 12 agentes, 7 achados) → 3 fixes reais aplicados: throttle do jwt via cache em memória (o `token.checkedAt` NÃO persiste no `getServerSession` — res no-op no RSC), grade fixa de 6 semanas (altura do popover não pula), e busca dos pontos cobrindo os dias vizinhos da grade (não só o mês). 2 páginas NOVAS em concepts/: [[scrollbar-gutter-stable]] e [[nextauth-getserversession-noop-res]]. Operacional em .context/features/{appointments,auth}.md. index.md: +2 concepts.

## [2026-07-04 22:45] ingest | Sessão mini-calendário + revalidação de sessão — raw criado, desenho final corrigido

Ingerida a sessão do dia (4 tarefas: mini-calendário na agenda, pontos nos dias com agendamento, fix do jitter de scroll, revalidação/revogação de sessão). Raw criado: raw/sessions/2026-07-04-agenda-mini-calendar-session-fixes.md (status ingested). ⚠️ **Correção ao registro anterior desta data** (que descrevia o desenho PRÉ-review): a 2ª rodada de code-review xhigh **reverteu** o throttle do `jwt` (nem `token.checkedAt`, nem `Map` em memória, nem `SessionProvider refetchInterval`) — motivo: `getServerSession` (RSC) usa `res` no-op e descarta o cookie reescrito, então reler no `jwt` a cada request era leitura duplicada com o `getAuthSession` (regressão de custo, crítico no Neon Free). **Desenho final**: `jwt` só relê o banco em `trigger:"update"` (client, após salvar Configurações → header atualiza na hora); revogação segue via `getAuthSession`→401→`signOut`; `SessionGuard`/`session.error` como defense-in-depth. Também na 2ª rodada: pontos passaram a cobrir a grade visível (dias vizinhos) e a respeitar os filtros ativos; a11y do date-picker (sem `aria-label` sobrescrevendo o intervalo; sem `aria-pressed`); grade fixa de 6 semanas; helper único `getMonthGridRange`. 2 páginas concepts já existentes ganharam `sources:` apontando pro raw e tiveram o "Fix" alinhado ao final: [[nextauth-getserversession-noop-res]] e [[scrollbar-gutter-stable]]. Deploy `42b2867` validado em produção (read-only): mini-calendário, ponto real em 12/jun, scrollbar-gutter:stable, sem erros. Operacional em .context/features/{appointments,auth}.md. index.md: raw/sessions 14→15.

## [2026-07-05 16:03] ingest | Google Calendar: design + Fase A (backend) — 3 páginas novas, 1 atualizada, +1 raw

Integração Google Calendar (feature de core que destrava o PREMIUM). Design produzido por workflow de 14 agentes (recon no código + 3 arquiteturas + matriz de 47+2 cenários + 5 críticas adversariais); **Fase A backend** implementada, code-review xhigh (6 fixes) e validada (tsc · vitest 287 · build · sprints 128; não commitada — dono commita na branch `v1.0.1`). Operacional completo em `.context/features/google-calendar.md` (não duplicado na wiki). **3 páginas NOVAS**: concepts/[[external-event-firewall]] (tabela separada só-leitura vs coluna `source`, pra queries cross-tenant amplas não mandarem WhatsApp/marcarem NO_SHOW em eventos importados), concepts/[[soft-delete-skips-cascade-cleanup]] (soft-delete nunca remove `User` → `onDelete:Cascade` não dispara → token OAuth vivo órfão; teardown pós-commit, isolado, keep-on-failure + retry na purga), synthesis/[[google-calendar-integration-state]] (tese + faseamento A→B→C + matching por telefone + status/bloqueios). **1 ATUALIZADA**: concepts/[[dev-fallback-without-secrets]] — nuance de que chave de cifra reversível deve gatear o fallback ao *runner de teste* (VITEST), não a "não-prod" (senão preview/staging protege token real com chave conhecida — achado #2 do review). Também removido o stub duplicado `2026-07-04-2245-PENDING.md` (o raw final já existia, ingest já feito). +1 raw: raw/sessions/2026-07-05-google-calendar-integration-fase-a.md. index.md: +2 concepts, +1 synthesis, raw/sessions 15→16. Próximo passo (Passo 2, rotas OAuth) bloqueado por credencial Google Cloud + `GCAL_TOKEN_ENC_KEY` + verificação OAuth.

## [2026-07-05 19:50] ingest | Google Calendar Fase A completa (OAuth + card + overlay) — 1 synthesis atualizada, +1 raw

Sessão da noite: rotas OAuth (`connect/callback/disconnect/status/events` com PKCE S256 + state em cookie httpOnly path-restrito), card "Google Agenda" em /configuracoes e overlay read-only na agenda (blocos tracejados intercalados por horário, dia-inteiro pinado, "Ocupado" p/ privados) — implementados SEM esperar a credencial real (decisão: só a validação E2E depende dela; tudo degrada graciosamente). Gate: tsc · vitest 326 (+39) · build · sprints 135 (+7 checks GCAL.1–7) · walk-through Playwright 23/23 com credencial fake · code-review workflow xhigh (35 agentes): 15 achados CONFIRMED, 14 corrigidos + 1 documentado (drift de fuso browser×SP, classe pré-existente) (Chrome MCP indisponível em job background — substituído por Chromium headless + manipulação direta do banco + intercept browser-level da nossa API p/ validar o overlay visualmente). Aprendizado-chave: revogar UM refresh token derruba o grant INTEIRO do par conta+app no Google → na reconexão só revogar o antigo se a conta mudou. Synthesis [[google-calendar-integration-state]] atualizada (estado + aprendizado); operacional em `.context/features/google-calendar.md` (§ Fluxo OAuth implementado + § Validação manual). Removido stub duplicado `2026-07-05-1613-PENDING.md` (checkpoint pós-ingest da sessão da tarde, mesmo precedente do dia 04). +1 raw: raw/sessions/2026-07-05-google-calendar-oauth-ui-fase-a-complete.md. index.md: raw/sessions 16→17. GA pendente: credencial real + verificação OAuth do Google → matriz OAUTH-01..08 → destravar PREMIUM.

## [2026-07-10 13:25] ingest | Google Calendar: validação E2E real, UX, config de prod e go-live (dark) — +4 concepts, 1 synthesis atualizada, +1 raw

Sessão longa retomando a Fase A (commitada em `bc3b1e5`). **Marco: Fase A foi mergeada (`v1.0.1`→main, PR #2 `f10b4dc`) e está EM PRODUÇÃO, porém DARK** (PREMIUM `hidden:true`); deploy `saas1-i4closbyv` Ready, migration aplicada, `/api/health` ok. Validado E2E com credencial REAL via Chrome MCP: overlay com eventos reais (timed/dia-inteiro/privado→"Ocupado"/intercalação), OAUTH-05/06/07; OAUTH-08 pendente (timeout de state). Melhoria de UX: erro do callback virou alerta persistente no card + "Tentar novamente" (code-review xhigh, 4 fixes; gate tsc·vitest 326·build·sprints 135). Config de prod: Vercel 4/4 env vars + redirect; app OAuth renomeado "ConfirmaAí"→"Clínica Organizada"; política com seção Google Calendar (Uso Limitado). +4 concepts: [[oauth-scope-check-before-persist]] (sem "meio conectado"), [[oauth-state-cookie-ttl-expiry]] (state expira em ~10min), [[google-oauth-verification-sensitive-scope]] (CNPJ não exigido; CPF ok; vídeo é de escopo restrito), [[vercel-preview-build-no-db-creds]] (preview falha no migrate deploy, não afeta prod). Synthesis [[google-calendar-integration-state]] atualizada p/ "em produção (dark)". +1 raw: raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md. index.md: raw 17→18. Operacional em `.context/features/google-calendar.md`. GA pendente (dono): preencher controlador na política (nome+CPF+DPO) + verificação OAuth + `hidden:false`.

## [2026-07-10 15:20] ingest | Google Calendar Fase B: promoção manual evento→agendamento — +3 concepts, 2 páginas atualizadas, +1 raw (renomeado de PENDING)

Continuação da sessão 14:47 (contexto compactado). Implementada e validada a **Fase B — promoção manual**: um evento do Google vira `Appointment` gerenciado via botão "Promover", com matching de paciente (telefone→CPF→patientId), pré-preenchimento (nome do título na hora + telefone/e-mail via `/event-signals` fazendo `events.get` real de forma assíncrona) e **de-dup do overlay** (evento promovido some). Modelo `ExternalEvent` (migration `20260710170250`) populado **lazy só na promoção** (sync contínuo = B2, não iniciado). Firewall estendido: `scheduler.ts` nunca lê `ExternalEvent` (GCAL.10). Gate: tsc · vitest **343** (+17) · build · sprints **139/139** (+4 GCAL.8–11). **Code-review adversarial** (workflow 7 dimensões × verificação independente, 11 agentes): firewall/multi-tenancy/quota/privacidade **limpos**; 4 achados CONFIRMED → 3 fixes (idempotência de corrida no catch do `/convert`; guard de resposta de sinais obsoleta; GCAL.9 tautológico endurecido) + 1 documentado (conflito checado fora da tx → Serializable não protege double-booking, classe pré-existente = `POST /appointments`). **E2E real** (Chrome MCP, wcwecalc): "Consulta Ana Paula 11 97777-1234" → prefill "Ana Paula" + (11) 97777-1234; promover → PENDING; de-dup persiste após reload; evento intacto no Google (readonly). Dados de teste revertidos; evento pré-existente "teste2" (com convidado) deixado intacto p/ não disparar cancelamento. **Não commitado** (dono via `gh`). +3 concepts: [[idempotent-link-under-race]], [[stale-async-response-guard]], [[regression-test-assert-the-predicate]]. Atualizadas: [[external-event-firewall]] (design→implementado) e synthesis [[google-calendar-integration-state]] (Fase B). Operacional em `.context/features/google-calendar.md` (§ Fase B). +1 raw: raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md (renomeado de PENDING). index.md: raw 18→19.

## [2026-07-10 15:40] ingest | GCal Fase B: 2º code-review (pré-commit) + seed da Fase C — 2 páginas atualizadas, addendum no raw

Continuação da mesma sessão. Antes de entregar a mensagem de commit (regra: code-review antes do commit), rodado 2º review adversarial (workflow **xhigh, 20 agentes**) sobre o diff completo (a 1ª rodada foi antes dos 3 fixes). Resultado: **1 falso-positivo descartado + 3 fixes menores + 2 limitações documentadas**. Falso-positivo: "promover evento de dia-inteiro cria agendamento à meia-noite/120min" — não procede (dia-inteiro renderiza no bloco pinado SEM `canPromote`/`onPromote`; só cronometrado tem "Promover"). Dois verificadores discordaram; resolvido lendo o código (aprendizado: verdict CONFIRMED de verificador que não checou alcançabilidade pode ser falso — ler o código). Fixes: (a) `suggestedEmail` era parseado mas nunca chegava ao form → `newPatientDefaults` ganhou `email`; (b) título só-prefixo ("Consulta 11 99999-8888"/"Consulta") sugeria "Consulta" como nome → `AGENDA_PREFIX` agora `(\s+|$)` (+2 testes); (c) msg de colisão de paciente duplicada em 2 branches do `/convert` → helper `patientCollisionResponse`. Gate: tsc·vitest **345**·build·sprints **139/139**. Gotcha durável: rodar `test:sprints` **isolado** (concorrente com vitest de integração → erro Prisma por contenção no DB local) — registrado na "Definição de feito" do `.context/README.md`. **Fase C semeada** (dono vai iniciar a seguir): sync app→Google (escrita `calendar.events` → re-consent+nova verificação OAuth; `googleEventId` no Appointment; de-dup nos 2 sentidos; best-effort) — seed em `.context/features/google-calendar.md` § "Como estender" #5 e ponteiro na memória. Atualizados: synthesis [[google-calendar-integration-state]] + addendum no raw da sessão. Sem novas páginas de conceito (nada reusável novo).

## [2026-07-10 21:05] ingest | Google Calendar Fase C: espelhar Appointment→Google (mirror app→Google) — +2 concepts, 2 páginas atualizadas, +1 raw (resolve o PENDING das 16:17)

Sessão da **Fase C**: um `Appointment` criado/editado/cancelado/excluído no app agora é espelhado como evento no Google Calendar do tenant (resolve a queixa "crio no app e não aparece no Google"). Decisões do dono (via AskUserQuestion): agenda **primary** (escopo só `calendar.events`, sem seletor), **auto-on ao conectar** (sem toggle), **só ações no app** (webhook/cron = B2), **delete-on-cancel**. Arquitetura: primitivos de escrita em `calendar.ts` (não tocam `Appointment` → firewall GCAL.7 intacto); orquestração em **`mirror.ts` (novo)** via `next/server` `after()` (best-effort pós-resposta, nunca quebra/500 a mutação nem lança). Escopo mudou `calendar.events.readonly`→`calendar.events` (write): `hasCalendarScope` aceita os dois, `hasWriteScope` só o de escrita; conectados legados fazem no-op e o card mostra "Reconecte para ativar". **Anti-loop nos 2 sentidos**: tag `confirmaaiOrigin=app` dropada em `mapGoogleEvent` + de-dup por `Appointment.googleEventId` na rota events + `/convert` rejeita origem-app; mirror ignora promovidos (`ExternalEvent`). Id determinístico (`appOriginEventId`=base32hex) → insert idempotente 409. Gate: tsc · vitest **357** (+11) · build · sprints **143/143** (+4 GCAL.12–15). **Code-review adversarial** (workflow 7 dim × verificação, 13 agentes): dims firewall/best-effort/multi-tenancy/token-403 **limpas**; **3 fixes** — [[revive-cancelled-event-on-id-reuse]] (409 na reabertura não é sucesso cego → `patch status:"confirmed"` ressuscita o tombstone cancelado), [[patch-merge-clear-requires-explicit-empty]] (`description:""` sempre — `events.patch` é merge, omitir não limpa), e renomear paciente → `syncPatientRename` re-patcha eventos futuros (o mirror antes só disparava pelas rotas de Appointment); **2 falso-positivos** descartados. **E2E real** (Chrome MCP, wcwecalc, **escopo de escrita** — dono deu o consent): reconexão → card "espelhados"; create/cancel/**reabrir(ressuscitar)**/reagendar+limpar-obs/excluir/**renomear-paciente** + de-dup do overlay, TODOS conferidos contra a Google Agenda real via `scripts/gcal-list-raw.ts` (server-to-server, `privateExtendedProperty=confirmaaiOrigin=app`). Dados de teste revertidos; conexão wcwecalc deixada CONNECTED com escopo de escrita (refresh 7d). **Não commitado** (dono via `gh`). +2 concepts (acima); atualizadas [[external-event-firewall]] (firewall nos 2 sentidos) e synthesis [[google-calendar-integration-state]] (Fase C done + próximo=verificação OAuth do escopo de escrita). Operacional em `.context/features/google-calendar.md` § Fase C. +1 raw: raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md (o stub `2026-07-10-1617-PENDING.md`, redundante — sua cauda já fora ingerida —, foi removido). index.md: raw 19→20. ⛳ Bloqueador de GA agora é a **verificação OAuth do escopo `calendar.events` (write)**, mais sensível que o `.readonly`.

## [2026-07-10 21:40] ingest | GCal Fase C: gotcha de suporte "achei que não espelhou" — 2 páginas atualizadas + addendum no raw

Follow-up de debug da mesma sessão. Dono reportou "criei agendamento e não espelhou" → investigado e **espelhou sim** (`googleEventId` gravado + evento vivo na agenda da wcwecalc, confirmado por `scripts/gcal-list-raw.ts`). Dois comportamentos CORRETOS que parecem bug, agora documentados: (1) **no-op silencioso** em grant só-leitura → agendamentos criados antes do reconsent de escrita não espelham; backfill só ao editar (não há job em massa = B2); (2) o evento vai pra agenda da **conta CONECTADA** (wcwecalc), não da conta de login do app nem da conta padrão do navegador → olhar a conta errada é o falso-negativo nº1. Registrado em `.context/features/google-calendar.md` § "Diagnóstico / gotchas de suporte (Fase C)" + nota na synthesis [[google-calendar-integration-state]] (Contradições/lacunas) + addendum no raw. Sem página de conceito nova (o gotcha de conta já é [[claude-chrome-per-profile-extension]]; o resto é operacional da feature).

## [2026-07-10 22:15] ingest | Agenda: visão de Mês + unificação das ações (status/exclusão) — +1 raw, +2 concepts, 1 entity + index/log

Sessão de UI em Agendamentos. **Visão Mês** nova (`month-view.tsx`: grid 6 semanas, chips por status + Google, drill p/ Dia, "+" cria com data, pontos no mobile) reaproveitando `getMonthGridRange` como fonte única do range. Depois, a pedido do dono, **unificação das ações nas 3 visões**: removido o menu "⋮" por-card; a **janela de edição** virou o único lugar de ação (ganhou `<select>` Status; Excluir já existia). Antes era inconsistente (Dia/Semana só status; Mês só excluir). Trade-off aceito: status virou 2–3 cliques.

O `/code-review high` (workflow, 16 agentes) pegou **1 regressão de perda de dados que eu introduzi** + 2 defeitos de correção da visão Mês, todos corrigidos e re-verificados no Chrome:
- [[edit-form-clobbers-concurrent-field]] (novo concept): a janela mandava `status` SEMPRE → salvar edição de observações revertia uma confirmação (WhatsApp) / no-show (cron) feita no meio-tempo. Fix: só enviar `status` se `data.status !== selectedAppointment.status`.
- Cap de 3 chips consumido por eventos "dia inteiro" do Google → agendamentos sumiam no "+N mais". Fix: **agendamentos primeiro**, depois Google (diverge de propósito do Dia/Semana).
- Mês ignorava `isLoading` → grid vazio na navegação. Fix: prop `loading` → overlay "Carregando…".
- `NOT_CONFIRMED` sem label pt-BR; memoização `itemsForDay`→`timelinesByDay`; import morto/comentários.

Técnicas de teste que viraram concept [[chrome-mcp-drive-and-assert-via-js]]: setar select/input nativo via setter do prototype + `dispatch('change')` p/ o RHF captar (setas do select nativo do macOS são flaky pela extensão); interceptar `window.fetch` p/ asseverar o corpo do PUT (provou o fix do clobber: sem mudança → PUT sem `status`; com mudança → com `status`) e p/ injetar latência e capturar o overlay de loading. Adicionado à [[radix-popover-and-dialog]] o gotcha do **1º clique após fechar Dialog ser engolido** (recorreu o tempo todo no walk-through).

Gate: tsc · vitest **357** · build · sprints **143/143**. Operacional em `.context/features/appointments.md` (§ visão Mês, § ações unificadas). Não commitado (dono via `gh`; mensagem de commit entregue no chat). index.md: raw 20→21.

## [2026-07-19 20:55] ingest | Confirmação por link + Onboarding/terminologia + fixes mobile — +3 concepts, 3 atualizadas, +1 raw

Ingerida a sessão longa autônoma de 2026-07-19 (2 features grandes ENTREGUES, não commitadas; gate tsc · vitest **386** · sprints **153/153**; ambas por `/code-review` xhigh + E2E Chrome). Operacional já vive em `.context/features/confirmation-link.md` e `onboarding.md` — a wiki só capturou o **reusável fora dessas features** (referencia o resto, não duplica).

**3 concepts NOVAS:**
- [[link-action-must-not-mutate-on-get]] — link que o paciente abre no WhatsApp não pode mutar no GET (preview/scanner pré-carrega e dispararia sozinho) → página GET read-only + botão POST; uso único é do ESTADO (`status!==PENDING`), não do token.
- [[baked-deadline-needs-grace-floor]] — 🔴 achado crítico do code-review da F1: deadline assado no envio (`dateTime−reminderHoursBefore`) nasce no passado se o envio atrasa → link expirado + auto-cancel imediato. Fix: piso `sentAt+GRACE` (2h) em `effectiveDeadlineMs`, MESMA fórmula no envio (sentAt=now) e no auto-cancel (sentAt=confirmationSentAt) → batem.
- [[jwt-new-claim-defaults-stale-tokens]] — 🔴 achado crítico do code-review da F2: claim novo no JWT (`onboardingCompletedAt`) não existe nos tokens antigos → `?? null` do session callback abria o wizard não-dispensável em TODA a base logada (apesar do backfill). Fix: `jwt` relê o banco quando o claim é `undefined` (≠ null), leitura única de migração; wizard virou dispensável (defesa em profundidade).

**3 ATUALIZADAS:**
- [[migrations-not-auto-applied]] — addendum: não rodar SQL cru no Neon (cria coluna sem registrar em `_prisma_migrations` → próximo `migrate deploy` falha e, encadeado no `vercel-build`, quebra o build inteiro); "No pending migrations" no log é normal; backfill de banco não alcança sessões JWT (cross-ref pro concept novo do JWT).
- [[chrome-mcp-drive-and-assert-via-js]] — §5: `resize_window` é no-op neste setup → NÃO emula viewport mobile; os bugs do S24+ não reproduzem no MCP. Aproximar por geometria forçada (`main.style.width='360px'` + medir `scrollWidth`) + inspeção de CSS, mas o veredito de "feito mobile" é o **dono no aparelho**.
- [[horizontal-scroll-from-offscreen-elements]] — Culpado 3: cards com padding > largura estouram poucos px → no **touch** a página fica "pannável" (o **tilt** ao rolar na vertical), invisível no desktop. Fix `overflow-x-hidden` no `<main>` (seguro: Radix usa portal, tabelas têm wrapper) + `px-4 sm:px-6` nos cards; contrasta com o Culpado 1 (reCAPTCHA `fixed`, onde clipar o container NÃO resolve).

Cross-refs novos costurando o cluster (link↔deadline↔jwt↔migrations; chrome-mcp↔horizontal-scroll). +1 raw: raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md (status ingested). index.md: +3 concepts, raw 21→22. ~~Pendências do dono: commit + migration em prod~~ → **já resolvidas** quando esta sessão começou (ver entry seguinte 21:08).

## [2026-07-19 21:08] meta | Verificação em prod: migration de onboarding já aplicada + F1/F2 deployadas (notas stale corrigidas)

Follow-up da ingestão anterior (o dono pediu pra executar a migration `20260719155729` "se ainda não estiver em prod" e atualizar as notas desatualizadas). **Resultado: nada a executar — já estava tudo feito.** Verificado por consulta direta ao banco de prod (Neon, via `vercel env pull --environment=production` → `DIRECT_URL` → `pg`, credencial nunca ecoada):

- `_prisma_migrations`: `20260719155729_add_business_type_onboarding` com `finished_at` **2026-07-19 17:04 UTC**, `applied_steps_count=1`, `rolled_back_at=null` → aplicada limpa (pelo `vercel-build` no deploy, [[migrations-not-auto-applied]]).
- Colunas `businessType` (enum) + `onboardingCompletedAt` (timestamp) presentes em `User`; **backfill 19/19 onboarded** (0 NULL) → base existente não é jogada no wizard (o cenário do [[jwt-new-claim-defaults-stale-tokens]] fica coberto na camada de banco; o lazy-load do JWT cobre as sessões vivas).
- Git: `HEAD==origin/main==147a4e7`. F1+F2 foram no commit `7ccb22d` (juntos, não separados como a memória previa) e o "trocar ramo em Configurações" no `147a4e7`.

**Notas stale corrigidas** (o material da wiki 2026-07-19 foi escrito com o estado "não commitado / migration pendente", que era verdade na sessão autônoma mas já tinha sido superado pelo deploy do dono): memória do projeto (`MEMORY.md` índice + `project-confirmation-onboarding-2026-07-19.md` §AÇÕES/§polish), a linha de "pendências" do entry 20:55 acima, e addendum no raw da sessão. Aprendizado reforçado: **backfill de banco resolve as linhas, mas não as sessões JWT já emitidas** — por isso a F2 precisou do lazy-load do claim ausente, não só da migration. Nenhuma página de conceito nova (o achado é de estado, não de padrão).

## [2026-07-24 17:27] ingest | Agenda arrastável (Dia + Mês entre dias), horário bloqueado e evento do Google clicável — +3 concepts, 3 atualizadas, +1 raw (3 stubs consolidados)

Ingestão da sessão de 2026-07-24 (9 entregas; gate verde vitest **395** · sprints **161/161**; code-review adversarial 5 dims/15 agentes, 8 achados corrigidos; E2E Chrome MCP). O hook `SessionEnd` havia criado **3 `-PENDING` da MESMA sessão** (15:22/15:25/15:26 — cada stub listava o anterior como "arquivo modificado"); consolidados num único raw `2026-07-24-1526-agenda-drag-timeblocks.md`, os 3 stubs vazios removidos.

Critério: o operacional já está denso em `.context/features/agenda-day-grid.md` e `time-blocks.md` — a wiki ficou só com o que **generaliza** (anti-padrão de duplicar `.context`).

**Conceitos novos:**
- [[react-query-structural-sharing-defeats-prop-diff]] — o achado mais caro do dia. Refetch *deeply equal* devolve a MESMA referência (structural sharing), então "limpa o estado otimista quando as props mudarem" **nunca dispara** nos caminhos de cancelamento/erro → card preso na posição arrastada. Estado otimista precisa de **sinal explícito de fim de tentativa** (`.finally` sobre promise que nunca rejeita), não de diff de dados. Bug simétrico no mesmo componente: `.map()` inline no pai limpava cedo demais — consertar um agrava o outro.
- [[move-across-days-via-local-components]] — mover data entre dias remonta por componentes locais; somar 24h erra no DST (dia local de 23h/25h). Não reproduz no Brasil (sem DST desde 2019), o que piora.
- [[drag-vs-click-decide-by-value-change]] — tap × arraste pelo **valor com snap**, não por pixel: limiar (4px) menor que o passo de snap (~7,5px) fazia tremor de dedo virar PUT no-op **+ escrita no Google**. Junto o kit de Pointer Events (`touch-action:pan-y`, `pointercancel`, flag anti-clique-fantasma, teclado por `detail===0`).

**Atualizadas:**
- [[external-event-firewall]] — duas extensões: `TimeBlock` usa o mesmo firewall (tabela própria, não `Appointment` sem paciente) e **só-leitura ≠ inerte** (o evento virou clicável — promove ou abre no Google — sem deixar de ser imutável/não-arrastável; regra única em `canPromoteGoogleEvent`).
- [[chrome-mcp-drive-and-assert-via-js]] §6 — injetar fixture no cliente (patch de `fetch`) + stubar `window.open` para testar caminho externo **sem criar dado na conta real do dono**; injetar leitura é reversível, mutar a fonte externa não.
- [[regression-test-assert-the-predicate]] — corolário de determinismo: `findFirst` sem `orderBy` escolhe linha arbitrária → flake `P2002` no check seguinte (era o caso do 2.15/2.16 em `test-sprints`).

index.md: +3 concepts, 3 resumos atualizados, raw 22→23. Pendências do dono inalteradas (não commitado; migration `20260724160036` só em DEV; mobile real e mirror-de-bloqueio não testados).

## [2026-07-24 17:35] meta | kb-tune: 4 wikilinks quebrados, drift do CLAUDE.md/ARCHITECTURE.md, 1 pendência stale e grafo atualizado

Afinação dos sistemas de conhecimento (diagnóstico read-only → correções). Sistemas detectados: `.context/` (canônico, soberania declarada de forma consistente por `CLAUDE.md`, `README.md` e `.wiki/AGENTS.md` — sem conflito), `.wiki/`, graphify, memória do agente. Obsidian ausente no escopo varrido.

- **Wikilinks**: 334 links, **4 quebrados** (98,8% íntegros) → todos resolvidos. `[[project-google-calendar-integration-design]]` era typo; `[[user-preferences]]` e `[[feedback-no-git-commands]]` apontavam para a mesma regra que só existia como *seção* do `MEMORY.md` → virou arquivo próprio de memória; `[[../concepts/done-with-chrome-walkthrough]]` (página que nunca existiu) virou prosa + link pro `.context` (anti-padrão de duplicar `.context` na wiki). `[[wiki]]` no `MEMORY.md` fica: é prosa, não link.
- **Drift do `CLAUDE.md`**: o aviso "ASPIRACIONAL" do topo cobria 4 seções, mas **não** as três que concentravam o resto do erro. Corrigidos: `Comandos Úteis` (mandava `cd backend`/`cd frontend` — não existem), `Variáveis de Ambiente` (`REDIS_URL`/`JWT_SECRET`/`PORT=3333`/`NEXT_PUBLIC_API_URL`, nenhuma consumida), `Convenções › Backend` (rotas `/api/v1/`, pino+Fastify, controller→service→repository) e `Fluxo Principal` (lembrete "2h" → `reminderHoursBefore` default **6**). Também `Regras para os Agents › backend-architect`, que mandava usar **Fastify**, **BullMQ** e filtrar por **`tenant_id`** — texto diretivo que agentes seguem ao pé da letra. Princípios preservados; o aviso do topo agora nomeia só as 3 seções que seguem aspiracionais.
- **Falsos-positivos descartados** na verificação: "paciente responde Sim/Não" **continua verdade** (`CONFIRM_KEYWORDS` inclui `sim`/`1` — o link é adição, não substituição) e `prisma.config.ts` **usa** mesmo `DIRECT_URL ?? DATABASE_URL` (só aparece em *bracket notation*, que um grep ingênuo por `process.env.X` perde).
- **`ARCHITECTURE.md`**: dizia "Next.js **14**" (real: 16) sem nenhum marcador de legado → corrigido + nota de que o `.context/` prevalece.
- **Estado stale**: `.context/plans/deployment-status.md` afirmava "**Falta apenas commit+push da Sprint 11**" — commitada em `8bdbc9f` (ancestral de `main`) e deployada em 2026-06-24. Corrigido.
- **Grafo**: `graphify update` (só código, sem LLM; `.graphify_root` conferido contra o cwd; **sem `--force`**). 1830→**1942 nós**, 4291→**4481 arestas**, `built_at_commit` agora em `d0b4e67`. Arestas semânticas e hyperedges **preservadas** (139/15/28/14 · 22). As páginas novas entraram na camada estrutural; a camada semântica (LLM) delas só num rebuild completo.

⚠️ Ponto cego declarado: integridade de `#heading` dentro de wikilinks **não** é verificada.

**Addendum (17:50) — achado maior, descoberto ao conferir o working tree:** `src/lib/services/conflict.ts` foi **deletado** e `findConflictingAppointment` não existe mais em `src/`. Não é acidente: os comentários no `POST /api/appointments` e no `/convert` registram a **decisão do dono de 2026-07-24** — *"SOBREPOSIÇÃO É PERMITIDA: dois clientes no mesmo horário são um caso real (atendimento simultâneo, sala dupla) e a grade do Dia já os desenha lado a lado"*. O `400 "Conflito com agendamento de X"` foi removido dos dois caminhos.

Mas a decisão **não tinha chegado aos docs**: 5 pontos do `.context` (README §convenção 8 + índice, `features/appointments.md` ×5, `features/google-calendar.md`, `flows/confirmation-flow.md`) e 2 da `.wiki` ainda descreviam a detecção de conflito como viva, apontando para um arquivo que não existe. Todos corrigidos. Detalhe que valia preservar: em [[idempotent-link-under-race]] a corrida de duplo-agendamento **não foi consertada — foi desqualificada como bug** (o resultado virou válido); a página manteve a lição geral (*read fora da tx não é serializado pelo Serializable*) com nota datada, porque o princípio sobrevive ao exemplo.

Também restaurado o `graphify-out/.graphify_root`, que o `graphify update .` reescreveu de caminho absoluto para `.` — o valor relativo quebraria a checagem de canonicalização que o kb-tune usa antes de autorizar um update.

## [2026-07-24 20:55] ingest | Regras novas da agenda: passado permitido (`retroactive`) + célula do Mês agenda — +1 concept, 4 atualizadas, +1 raw

Rodada 4 do mesmo dia (as três primeiras estão no ingest das 17:27; a decisão de **permitir sobreposição** já havia sido capturada no addendum das 17:50 — aqui entra só como contexto das consequências). Gate verde: `tsc` · vitest **401** · build · `test:sprints` **166/166** (`RT.1`–`RT.5` novos). Pedido do dono em 3 frases + imagem do Google Agenda; duas decisões devolvidas a ele antes de codar (sobreposição **sem** aviso; selo **"⟲ Retroativo"**).

**Conceito novo:**
- [[persist-intent-not-elapsed-time]] — o achado que estrutura a rodada. `dateTime < now` na leitura **colapsa dois casos opostos**: "lancei no passado de propósito" (registro histórico, não é falta) e "marquei para o futuro e o horário passou" (é a falta que o produto mede). Intenção grava-se na **escrita** (`Appointment.retroactive`, servidor decide, cliente não manda, reavaliado quando o horário é reescrito) e só vale se os **jobs filtrarem** por ela.

**Atualizadas:**
- [[external-event-firewall]] — a "alternativa defense-in-depth" (booleano em vez de tabela separada) **deixou de ser hipótese**: `retroactive` é ela, e é a escolha certa porque a linha **é de domínio** (aparece na agenda, é editável, conta métrica por status). Regra destilada: **tabela separada quando a linha não pertence ao domínio; flag quando pertence mas não deve alimentar jobs** — pagando o custo previsto (filtrar em N lugares) com check de regressão.
- [[regression-test-assert-the-predicate]] — corolário 2: check **negativo** por grep no fonte precisa rodar sobre o código **sem comentários**. O `RT.3` falhou na 1ª execução porque os próprios comentários que explicam a remoção citam a mensagem antiga ("Conflito com agendamento"). Asserção positiva pode ler o fonte cru; negativa, não — senão proíbe o time de documentar o que saiu.
- [[drag-vs-click-decide-by-value-change]] — o **custo do clique-fantasma depende do efeito do clique**: a célula do Mês passou a CRIAR (antes drilava), então o falso positivo virou "abre formulário" em vez de "troca de visão". Corolário de UX: mudar o significado de um clique exige **realocar o antigo** (o drill migrou para o número do dia).
- [[google-calendar-integration-state]] — `/convert` afrouxou duas rejeições: passado agora promove (nasce `retroactive`) e sobreposição não é mais rejeitada; a corrida entre dois `/convert` deixou de ser bug.

Não duplicado na wiki (fica em `.context/features/appointments.md` § Retroativo, `scheduler.md` § `markNoShows` e `agenda-day-grid.md`): campo/migration, UI do selo, card compacto do DayGrid e a matriz de validação E2E. Registrado como consequência de segunda ordem no raw: **relaxar uma regra de domínio realoca o orçamento de layout** — com sobreposição permitida, o card de 30 min em 3 colunas escondia o nome do paciente (linha 2 cortada) até o fix `compact`.

index.md: +1 concept, 3 resumos atualizados, raw 23→**24**. Pendências do dono: não commitado; **duas** migrations só em DEV (`add_time_block`, `add_appointment_retroactive`); firewall do cron coberto por RT.1/RT.2 e **não** por execução real do cron (`runSchedulerJobs()` dispara e-mail de billing).

## [2026-07-24 21:20] meta | Poda do nó semântico stale, drift do ARCHITECTURE.md e lint de wikilinks

Manutenção pós-ingestão, autorizada pelo dono ("pode fazer tudo que achar válido").

- **Grafo — poda manual de 1 nó**: `context_features_appointments_conflict_detection`
  (`findConflictingAppointment (overlap [start,end))`, extraído de `.context/features/appointments.md`)
  apontava para função e arquivo **deletados** hoje. `graphify update` re-extrai só a camada de
  **código** — nós de doc/conceito sobrevivem até um rebuild completo com LLM, e o `update`
  seguinte confirmou "No code-graph topology changes detected" (ou seja: não regenerava a viz).
  Removidos à mão o nó, sua aresta `implements` e as 2 ocorrências nos dados **embutidos** em
  `graph.html`, com as contagens do rodapé e do `GRAPH_REPORT.md` ajustadas (1962→**1961** nós,
  4506→**4505** arestas). Backup do estado anterior no scratchpad da sessão. Escolhi **não** rodar
  `cluster-only`: `.graphify_labels.json` é indexado por **número** de comunidade, então
  re-clusterizar arriscava trocar os 172 nomes por placeholders — custo maior que o benefício.
- **Varredura de resíduo das regras removidas**: todas as menções restantes a
  `findConflictingAppointment` / `"Não é possível agendar no passado"` em `.context/` e `.wiki/`
  são **históricas e anotadas** (marcadas como removidas em 2026-07-24) — nada a corrigir.
- **`ARCHITECTURE.md` (3 pontos de drift)**: (1) o modelo `Appointment` não listava
  `durationMinutes`, `retroactive` nem os campos de espelho do Google; (2) o fluxo do scheduler
  ainda descrevia **envio de lembrete em T-6h** — que deixou de existir em **2026-07-19**
  (virou auto-cancelamento no deadline; drift de 5 dias que o kb-tune das 17:35 não pegou) e o
  `markNoShows` sem o filtro `retroactive = false`; (3) o fluxo de confirmação não mencionava que
  o caminho principal hoje é o **link** (as palavras-chave no chat seguem aceitas).
- **Lint de wikilinks**: 373 links reais, **5 quebrados**. 3 vivem dentro de entradas históricas
  do próprio `log.md` (que *citam* os links que foram consertados) → mantidos, log é append-only.
  2 estavam na memória do agente como caminho em forma de wikilink (`[[time-blocks]]`,
  `[[.context/features/auth.md]]`) → viraram caminho em código. ⚠️ Nota de método: um checker que
  não aceita a forma de **path** (`[[../concepts/x]]`) reporta ~45 falsos-positivos.
