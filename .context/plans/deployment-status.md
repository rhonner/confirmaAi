# Deployment Status — Stop & Resume Snapshot

> Snapshot do progresso de subir a infraestrutura de produção do ConfirmaAí.
> **Última atualização**: 2026-06-10 (Sprint 7 em andamento — auditoria completa do estado real).

---

## 📊 ESTADO REAL (auditado em 2026-06-10)

A v1 **JÁ ESTÁ EM PRODUÇÃO** — boa parte deste documento foi executada em sessões de maio. Auditoria via SSH + Cloudflare + Vercel:

### ✅ Funcionando em produção
- **Domínio**: `clinicaorganizada.com` (Cloudflare, conta rhonner.matheus@gmail.com).
- **DNS**: raiz A `76.76.21.21` (Vercel) + `www` CNAME `cname.vercel-dns.com` + `evolution` A `49.13.202.135` — todos DNS-only (cinza).
- **App**: Vercel projeto `saas1` (team `besenacis-projects`, plano Hobby), deploy da branch `main` (v1 sem monetização).
- **Evolution API**: `evoapicloud/evolution-api:v2.3.7` + Postgres 16 + Redis 7 via Docker, up 5+ semanas. Caddy com HTTPS válido em `evolution.clinicaorganizada.com` → `127.0.0.1:8080`.
- **VPS hardening**: UFW (22/80/443), fail2ban ativo, swap 2GB, unattended-upgrades, **sshd key-only** (`PasswordAuthentication no` aplicado em 2026-06-10 via `/etc/ssh/sshd_config.d/99-hardening.conf`).
- **Cadência do cron RESOLVIDA**: crontab root na VPS `*/30 * * * * /usr/local/bin/clinica-cron.sh` → `GET https://clinicaorganizada.com/api/cron/run` com Bearer CRON_SECRET. Log em `/var/log/clinica-cron.log`, respostas `{"ok":true}` consistentes. (Vercel Cron `0 3 * * *` continua como redundância diária.)
- **Disco**: 26% usado (9/38 GB). RAM: ~1GB/3.7GB usados.

### Envs de produção na Vercel (inventário 2026-06-10)
Existem (v1): `CRON_SECRET`, `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_WEBHOOK_BASE_URL`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`.

### 🔴 Pendências do go-live v2 (Sprint 7)
| # | Item | Quem | Status / Detalhe |
| - | ---- | ---- | ---------------- |
| 1 | `DATABASE_URL` → **pooled** | dev (CLI) | ✅ 2026-06-10 — host trocado para `ep-divine-recipe-acbdf1sw-pooler...` via `vercel env`. Migrations continuam na URL direta. |
| 2 | Conta **Asaas produção** | — | ✅ 2026-06-12 — KYC aprovado (usuário); chave `confirmaai-producao-vercel` gerada (2FA SMS) e adicionada à Vercel via **clipboard relay** (`pbpaste \| vercel env add` — valor nunca passou pelo chat/contexto), validada com `GET /customers` → 200, clipboard limpo após. Webhook já estava ✅ desde 2026-06-10. NF-e fica pra quando houver CNPJ. |
| 3 | **reCAPTCHA v3** | — | ✅ 2026-06-10 — site criado via automação (projeto GCP "MakeItLand", domínio `clinicaorganizada.com`), **chaves na Vercel** (`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY`). Admin: google.com/recaptcha (conta Google /u/2). |
| 4 | **Resend** | — | ✅ 2026-06-10 — conta criada (usuário), API key gerada e **na Vercel** (`RESEND_API_KEY`), domínio `clinicaorganizada.com` adicionado (região sa-east-1) e **4 registros DNS criados na Cloudflare via automação**: TXT `resend._domainkey` (DKIM via clipboard), MX `send` → `feedback-smtp.sa-east-1.amazonses.com` (prio 10), TXT `send` (SPF), TXT `_dmarc`. `dig` confirma propagação; **domínio VERIFICADO no Resend** ("ready to send emails"). Sender do código: `noreply@clinicaorganizada.com` (⚠️ display name diz "ConfirmaAí" — divergência de marca com Clínica Organizada, corrigir na Sprint 10). |
| 5 | Envs v2 na Vercel | dev (CLI) | ✅ **COMPLETO 2026-06-12 — 16/16 envs em produção** (8 da v1 + pepper, billing provider, 3×Asaas, 2×reCAPTCHA, Resend). Conferido via `vercel env ls production`. |
| 6 | Migrations v2 em prod | dev | ✅ 2026-06-10 — 7 migrations aplicadas via `migrate deploy` (URL direta) + backfill `backfill-quota-slots.ts` com pepper de prod: 14 patients → 14 slots PHONE, 6 users atualizados, 8/8 users com Subscription FREE/ACTIVE. Users atuais são contas de teste (nenhum WA conectado). |
| 7 | Merge `v2.0.0` → `main` | **usuário** (gh) | ✅ 2026-06-12 — deploy `saas1-cc1sphyeg` **Ready**. Verificado na sequência: `/precos` 200, `/api/billing/subscription` 401 auth-gate, webhook 401 sem HMAC. **V2 EM PRODUÇÃO.** |
| 8 | Smoke test E2E | dev + usuário | ✅ 2026-06-12 — ciclo completo validado em produção: login → badge 2/5→3/5 + modal soft 60% disparou → `/billing` ok → QR WhatsApp escaneado (webhook `connection.update` confirmou) → paciente "Teste Smoke" (CPF obrigatório no Free ✓) → agendamento 14:30 → cron disparado via script da VPS (`confirmationsSent: 1`, stats Sprint 6 ✓) → mensagem chegou no WhatsApp → resposta "1" → **bug do nono dígito encontrado e corrigido** (deploy `saas1-a8r9kjdfn`) → reteste → **CONFIRMED** ✅. Pendente do roteiro: Pix R$ 1 real no upgrade Pro (opcional, quando o usuário quiser). |

> 🏁 **GO-LIVE 100% CONCLUÍDO em 2026-06-12.** O ConfirmaAí v2 está vendendo em produção com o fluxo core validado fim-a-fim. Próximo do roadmap: Sprint 8 (resiliência WhatsApp) ANTES de campanha de marketing.
| 9 | **Sandbox Asaas** | — | ✅ 2026-06-10 — conta sandbox criada (botão em Integrações → Início da conta prod), chave `confirmaai-dev-local` gerada (2FA SMS do usuário) e salva no `.env` local **entre aspas simples** (prefixo `$aact_` seria expandido pelo dotenv-expand do Next). Validada com `GET /customers` → 200. `BILLING_PROVIDER` segue comentado (Mock é o default em dev); descomentar pra exercitar o `AsaasProvider` real. Webhook sandbox NÃO configurado — exige URL pública; quando precisar, subir túnel (ex: `cloudflared tunnel`) e cadastrar em sandbox.asaas.com → Integrações → Webhooks. |

> ⚠️ Ordem importa: merge (7) por último — a v2 em produção sem reCAPTCHA/Resend/Asaas quebra signup e billing.
> ⚠️ `CPF_HASH_PEPPER` de produção é **imutável** (rotacionar exige rehash da base toda). Valor está na Vercel; não regenerar.

---

## ✅ O que JÁ está feito

### Conta Hetzner
- **Email**: `rhonner.matheus@tecnofit.com.br`
- **Customer number**: `K0511120726`
- **Tipo de conta**: Individual
- **Cartão cadastrado**: Mastercard, válido até 11/2033, em nome de Rhonner Matheus
- **Project ID Hetzner Cloud**: `14438873`

### VPS de produção criada
| Atributo            | Valor                                                |
| ------------------- | ---------------------------------------------------- |
| Nome                | `evolution-prod`                                     |
| Type                | CX23 (2 vCPU x86 Intel, 4 GB RAM, 40 GB NVMe)        |
| Location            | Nuremberg (eu-central)                               |
| Image               | Ubuntu 24.04.3 LTS                                   |
| **Public IPv4**     | **`49.13.202.135`**                                  |
| IPv6                | habilitado (default)                                 |
| Backup diário       | ✅ ativo (+20% custo)                                |
| Custo total         | **€5.29/mês ≈ R$ 31** (€3.99 server + €0.50 IPv4 + €0.80 backup) |

### SSH configurado localmente
- **Chave dedicada gerada**: `~/.ssh/hetzner_confirmaai_ed25519` (privada) e `.pub` (pública)
- Chave pública injetada no servidor durante o create (label: `rhonner-confirmaai-hetzner`)
- **Não toca nas chaves de trabalho** (Tecnofit/Bitbucket): `id_rsa_work`, `id_ed25519`, `id_rsa` continuam intactas
- Entrada adicionada em `~/.ssh/config`:
  ```
  Host evolution-prod
    HostName 49.13.202.135
    User root
    IdentityFile ~/.ssh/hetzner_confirmaai_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes
  ```
- Backup do config anterior em `~/.ssh/config.bak.<timestamp>` (datado da sessão)
- **Conexão validada**: `ssh evolution-prod` funciona sem senha
- **Estado da VPS no momento da pausa**: Ubuntu fresco, 400 MB usados, 35 GB livres, kernel 6.8.0

---

## 🟡 BLOQUEADO — Decisão pendente: nome + domínio

Sócio precisa entrar na conversa antes de avançar. Reasoning já feito:

### Domínios indisponíveis
- ❌ `confirmaai.com`
- ❌ `confirmaai.com.br`
- ❌ `confirmaai.app`

### Top opções livres avaliadas

| Domínio                    | Preço/ano  | Tese                                             |
| -------------------------- | ---------- | ------------------------------------------------ |
| `confirmaai.io`            | ~R$ 250    | Tech-friendly, segura nome, internacionalizável  |
| `confirmaai.co`            | ~R$ 150    | Quase-`.com`, sem mudar nome                     |
| `getconfirmaai.com`        | ~R$ 60     | Padrão SaaS americano (Stripe, Slack)            |
| `usaconfirmaai.com`        | ~R$ 60     | CTA em PT, slogan = domínio                      |
| `confirmou.app`            | ~R$ 70     | Sinônimo, `.app` HTTPS automático                |
| `semfaltas.com.br`         | ~R$ 50     | Problem-first, vende a dor                       |

### Outras ideias listadas (não validadas):
- Mantendo nome: `confirmaai.tech`, `confirmaai.dev`, `confirmaai.cc`, `confirmaaiapp.com`, `tryconfirmaai.com`
- Variações PT: `confirma.com.br`, `confirmaja.com.br`, `agendaaí.com.br`, `lembraaí.com.br`
- Problem-first: `semnoshow.com.br`, `zerofaltas.com.br`, `pacienteok.com.br`

### Onde comprar
- **Registro.br** (`.com.br`, Pix, R$ 50/ano)
- **Cloudflare Registrar** (TLDs internacionais a preço de custo)
- **Namecheap** (TLDs internacionais)

---

## 🔜 Próximos passos quando o domínio estiver decidido

### 1. Comprar domínio + apontar DNS
- [ ] Registrar domínio escolhido
- [ ] Criar registro A: `evolution.<dominio>` → `49.13.202.135` (TTL 300)
- [ ] Aguardar propagação (`dig evolution.<dominio>` resolve para o IP) — minutos a 1h normalmente

### 2. Hardening do servidor (~15 min)
- [ ] Update + upgrade Ubuntu: `apt update && apt upgrade -y`
- [ ] Habilitar `unattended-upgrades` para patches automáticos
- [ ] Configurar UFW: liberar portas 22, 80, 443, drop o resto
- [ ] Configurar `sshd_config`: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `PubkeyAuthentication yes`
- [ ] Instalar `fail2ban` (defesa anti-brute-force no SSH)
- [ ] Criar swap de 2 GB (Hetzner CX23 não vem com swap por default)

### 3. Stack Evolution (~20 min)
- [ ] Instalar Docker + docker-compose plugin
- [ ] Criar `/opt/evolution/docker-compose.yml` com:
  - Evolution API (`atendai/evolution-api:latest` ou tag estável)
  - Postgres dedicado pra Evolution (separado do nosso Neon)
  - Redis
  - Volumes persistentes em `/opt/evolution/data`
- [ ] Gerar `EVOLUTION_API_KEY` aleatória (`openssl rand -hex 32`) e guardar
- [ ] `docker compose up -d`

### 4. Reverse proxy + HTTPS (~10 min)
- [ ] Instalar Caddy (`apt install caddy`)
- [ ] `/etc/caddy/Caddyfile`:
  ```
  evolution.<dominio> {
    reverse_proxy localhost:8080
  }
  ```
- [ ] `systemctl reload caddy` — Caddy emite Let's Encrypt automaticamente
- [ ] Testar: `curl -I https://evolution.<dominio>` deve retornar 200/401 (não 502)

### 5. Conectar a app Next.js
- [ ] Vercel: deploy da app (se ainda não estiver) — domínio principal `app.<dominio>` ou `<dominio>` raiz
- [ ] Vercel env vars (Production):
  ```
  EVOLUTION_API_URL=https://evolution.<dominio>
  EVOLUTION_API_KEY=<a chave gerada no passo 3>
  EVOLUTION_WEBHOOK_BASE_URL=https://app.<dominio>     # ou https://<dominio>
  NEXT_PUBLIC_APP_URL=https://app.<dominio>
  NEXTAUTH_URL=https://app.<dominio>
  NEXTAUTH_SECRET=<gerar nova: openssl rand -base64 32>
  DATABASE_URL=<URL do Neon de produção>
  ```
- [ ] Migração: `npx prisma migrate deploy` contra DB de produção
- [ ] Smoke test: criar usuário no signup, conectar WhatsApp pelo `/configuracoes`, scanear QR

### 6. Validação E2E (referência: `.context/flows/confirmation-flow.md`)
- [ ] Cadastrar paciente de teste com seu próprio número
- [ ] Criar agendamento daqui a 1h
- [ ] Forçar configuração: `confirmationHoursBefore = 1` e `reminderHoursBefore < 1`
- [ ] Aguardar cron disparar (a cada 30 min — ver `.context/features/scheduler.md`)
- [ ] Confirmar recebimento da mensagem no seu WhatsApp
- [ ] Responder "1" e validar que `Appointment.status` virou `CONFIRMED`

---

## 📍 Pontos de atenção registrados

1. **Toast resíduo no console Hetzner**: aparece "SSH key has invalid format" — IGNORAR, é da primeira tentativa que falhou no `type` do form. A segunda tentativa (via clipboard `pbcopy`) passou e a chave está corretamente injetada na VPS.

2. **A VPS Nuremberg vs latência Brasil**: ~200ms — irrelevante para webhook de WhatsApp (caminho lento é WA ↔ celular do paciente, não nós ↔ Evolution).

3. **MEI**: usuário planejava abrir após o primeiro cliente pagar. Quando abrir, **migrar conta Hetzner de Individual → Organization** via ticket de suporte (recursos não são afetados, só dados de fatura).

4. **Backup gerencia disk só** — não inclui volumes (não temos volumes anexados). Restore em 1 clique no painel.

5. **Custos confirmados** (`.context/plans/billing-and-audit-roadmap.md` § "Análise de custo"):
   - Hoje (1 VPS): **R$ 31/mês**
   - 0 clientes: ~R$ 31/mês
   - Cabe folgado em até ~15 tenants pequenos antes de precisar upgrade pra CX32 (R$ 45)

---

## 📂 Arquivos relacionados (índice rápido)

- Roadmap geral: `.context/plans/billing-and-audit-roadmap.md`
- Stack atual: `.context/README.md`
- Como Evolution se integra com nosso código: `.context/features/whatsapp.md`
- Webhook: `.context/features/webhook-evolution.md`
- Scheduler / cron: `.context/features/scheduler.md`
- Multi-tenancy: `.context/flows/multi-tenancy.md`
- Fluxo de confirmação E2E: `.context/flows/confirmation-flow.md`
