# Sessão 2026-07-10 — Google Calendar: validação E2E real, UX, config de prod e go-live (dark)

- **Branch**: `v1.0.1` → mergeada em `main` (PR #2, `f10b4dc`).
- **Objetivo**: retomar a Fase A do Google Calendar (commitada em `bc3b1e5`), validar E2E com a credencial REAL, configurar produção e destravar o caminho pro GA.

## O que foi feito

1. **Validação E2E real (Chrome MCP, credencial wcwecalc)** — fechou os gaps que a rodada de 2026-07-05 só cobriu com credencial fake:
   - **Overlay com eventos REAIS**: timed, dia-inteiro pinado, privado → "Ocupado", intercalação por horário com agendamentos reais, sem ações de WhatsApp/status.
   - **OAUTH-06** (revoke externo → NEEDS_RECONSENT → banner + overlay some + card "Reconexão necessária" → reconnect → CONNECTED).
   - **OAUTH-05** (refresh + rotação) e **OAUTH-07** (scope-mismatch da MESMA conta não revoga/corrompe) de bônus.
   - **OAUTH-08** (troca de conta) tentada mas falhou por timeout de state (ver abaixo); ficou pendente.

2. **Melhoria de UX (feedback do dono ao vivo)**: erro do callback OAuth virou **alerta persistente no card** (`google-calendar-connection.tsx`) + botão "Tentar novamente", não só toast efêmero. Code-review xhigh (18 agentes) → 4 fixes: limpar o alerta ao desconectar; não limpar otimista no retry (retry que falha mantém a mensagem); sem botão duplicado; mensagens `scope`/`state` sem label PT-BR fixo do Google. Gate: tsc · vitest 326 · build · sprints 135/135.

3. **Config de produção (Vercel + OAuth client)**: 4/4 env vars do GCal em prod (`GOOGLE_CLIENT_ID`/`GOOGLE_OAUTH_REDIRECT_URI` pelo assistente via CLI; `GOOGLE_CLIENT_SECRET`/`GCAL_TOKEN_ENC_KEY` pelo dono — o classificador de credencial bloqueia o assistente de materializar secret). Redirect de prod adicionado ao cliente OAuth. App OAuth **renomeado "ConfirmaAí" → "Clínica Organizada"** (consistência marca↔domínio). Política de privacidade ganhou seção "Integração com o Google Calendar" (afirmação de Uso Limitado) — `src/lib/legal/content.ts`.

4. **Go-live (dark)**: dono commitou (`169b448`) + PR + merge → **deploy de produção Ready** (`saas1-i4closbyv`), migration aplicada, smoke check OK. Backend do GCal **vivo em prod mas DARK** (PREMIUM `hidden:true`).

## Aprendizados não-óbvios (viram páginas concept)

- **Cookie de state/PKCE tem TTL ~10 min** → consent real lento (aviso "app não verificado" + hesitação) estoura → `gcal_error=state`. Derrubou 2 tentativas de reconnect na sessão. → [[oauth-state-cookie-ttl-expiry]]
- **O callback valida o escopo concedido ANTES de gravar a conexão** → não existe estado "meio conectado". Connect do zero sem marcar o checkbox do calendário rejeita limpo (revoga o grant novo, não grava linha, fica DISCONNECTED). Confirmado E2E (`callback/route.ts:82-87`). → [[oauth-scope-check-before-persist]]
- **Verificação OAuth de escopo sensível** (`calendar.events.readonly`): exige política de privacidade com disclosure + afirmação de Uso Limitado, consistência nome↔domínio, logo. **CNPJ NÃO é exigido** pelo Google (nem pela LGPD-PF: campo aceita CPF). Vídeo demo normalmente NÃO é obrigatório para escopo *sensível* (é para *restrito*). → [[google-oauth-verification-sensitive-scope]]
- **Preview deploys da Vercel falham no `vercel-build`** (`prisma migrate deploy` sem `DIRECT_URL`/`DATABASE_URL`, que são Production-only por design). Não afeta prod (que tem as vars). → [[vercel-preview-build-no-db-creds]]

## Gotchas de operação (menores, sem página)

- **Google Cloud Console exige `authuser=2`** para a conta wcwecalc; `u/0` (rhonner.matheus) não tem acesso ao projeto `confirmaai-501623`. Confirmar sempre pela conta, não pelo nome (o perfil WeCalc tem 3 contas Google). Ver [[claude-chrome-per-profile-extension]].
- **Assistente não materializa secret**: o classificador bloqueou até imprimir prefixo/sufixo mascarado. Secrets vão pro Vercel por pipe do `.env`/clipboard rodado pelo **dono**.

## Estado final

- Fase A **em produção (dark)**. Falta pro GA (dono): preencher controlador na política (nome + **CPF** + DPO), **verificação OAuth** (maior), `plans.ts hidden:false`. OAUTH-08 + logo/vídeo pendentes.
- Detalhe operacional completo: `.context/features/google-calendar.md`.

> Fonte: conversa da sessão 2026-07-10 (dev local em :3001, conta Chrome WeCalc/wcwecalc).
