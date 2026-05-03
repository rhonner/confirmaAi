# Deployment Status — Stop & Resume Snapshot

> Snapshot do progresso de subir a infraestrutura de produção do ConfirmaAí.
> **Última atualização**: 2026-05-02 (sessão pausada para definir nome/domínio com sócio).

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
