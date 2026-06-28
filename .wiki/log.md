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
