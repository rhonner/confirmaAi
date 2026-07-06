---
type: session
date: 2026-07-05 (noite)
branch: v1.0.1
status: ingested
topic: Google Calendar Fase A — rotas OAuth + card + overlay implementados e validados (credencial fake)
---

# Sessão 2026-07-05 (noite) — Google Calendar Fase A completa em código

## Objetivo

Validar a Fase A backend (sessão da tarde) e implementar o que faltava da Fase A:
rotas OAuth, UI de conexão e overlay na agenda — SEM esperar a credencial real
do Google (decisão da sessão: o código não depende dela; só a validação E2E real).

## Resultado

- **Gate de entrada revalidado** na árvore não-commitada: tsc · vitest 287 · build · sprints 128.
- **Implementado**: `oauth.ts` (auth-code + PKCE S256 + state, env lazy), `calendar.ts`
  (live-fetch com refresh/rotação + mapeamento filtrado), rotas
  `connect/callback/disconnect/status/events`, hooks, card `google-calendar-connection.tsx`,
  `GoogleEventBlock` no agenda/page.tsx, labels de audit, GCAL.1–7 no test-sprints,
  `.env.example`. Detalhe operacional completo em `.context/features/google-calendar.md`
  (§ Fluxo OAuth implementado).
- **Code-review workflow xhigh (35 agentes, verificação adversarial): 15 achados
  CONFIRMED, 14 corrigidos + 1 documentado como classe pré-existente** (drift de fuso
  browser×SP no agrupamento por dia — idêntico aos appointments; fix é app-wide). Os
  mais sérios: state OAuth sem vínculo ao userId (cross-tenant em browser compartilhado
  → HMAC c/ NEXTAUTH_SECRET), revoke no scope-mismatch matando grant saudável da mesma
  conta, 403 de rate-limit virando NEEDS_RECONSENT permanente, eventos overnight
  sumindo do overlay. Lista completa em `.context/features/google-calendar.md` § Code-review.
- **Gate final**: tsc · vitest **326** (+39) · build · sprints **135/135** (+7 GCAL) ·
  **walk-through de UI 23/23** com Playwright headless + credencial FAKE + manipulação
  direta do banco (ver aprendizados) — screenshots salvos no job dir.

## Decisões

1. **Implementar sem credencial real**: tudo degrada graciosamente —
   `isGoogleOAuthConfigured()` inclui `GCAL_TOKEN_ENC_KEY` no check (sem ela o callback
   quebraria no encrypt); connect → 503 amigável; card invisível quando não configurado.
2. **Card invisível para não-PREMIUM sem conexão** (não upsell): PREMIUM está `hidden:true`
   na venda — anunciar feature que não pode comprar é pior que esconder. Exceção: conexão
   remanescente pós-downgrade mantém o card para desconectar.
3. **Semântica do disconnect**: revoke OK → delete da linha; revoke falhou → `REVOKED` +
   MANTÉM token cifrado p/ retry futuro + `revoked:false` na resposta (toast orienta
   myaccount.google.com/permissions). Limitação conhecida: sem cron de retry até a Fase B
   (purga 30d só cobre conta deletada).
4. **State/PKCE em cookies httpOnly** com path restrito à rota da integração e TTL 600s;
   comparação de state em tempo constante; POST /connect devolve `{authUrl}` (client navega)
   em vez de redirect no GET — permite 402 paywall padrão via fetchApi.

## Aprendizados (não-óbvios)

- **Revogar UM refresh token derruba o grant INTEIRO do par conta+app no Google.** Por isso
  o callback só revoga o token antigo quando o `googleAccountEmail` MUDOU (troca de conta);
  revogar na reconexão da mesma conta mataria o token novo recém-emitido.
- **Playwright headless como substituto do Chrome MCP** em sessão background: login real,
  toggle de plano via script, manipulação do banco com blob "g1." replicado (AES-GCM em
  script node puro com `pg` via `createRequire`), e **intercept browser-level da NOSSA API**
  (`page.route` em `/api/integrations/google-calendar/*`) para validar visualmente o overlay
  sem Google real — cobre a renderização de verdade (intercalação, dia-inteiro, "Ocupado").
- **Cookie com `path` restrito é invisível para `ctx.cookies(baseURL)`** no Playwright —
  filtra por URL; consultar com a URL completa do path (falso-FAIL B3 do walk-through).
- **Token fake no revoke real do Google devolve 400** → o `revokeGoogleGrant` já trata 400
  como "sem grant" (idempotente), então o fluxo de disconnect é testável de ponta a ponta
  sem credencial.
- **Erro de refresh com client fake é `invalid_client` (HTTP_ERROR), não `invalid_grant`**
  → cai no caminho `degraded` (UPSTREAM_ERROR), não em NEEDS_RECONSENT — exatamente o
  comportamento desejado para "Google fora do ar": agenda continua funcionando.

## Pendências (dono)

Credencial Google Cloud real + `GCAL_TOKEN_ENC_KEY` em dev/Vercel + iniciar verificação
OAuth → validar matriz OAUTH-01..08 no Chrome real → destravar PREMIUM. Checklist em
`.context/features/google-calendar.md` § Como estender.
