---
title: TTL curto do cookie de state/PKCE derruba consent lento
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [oauth, google-calendar, csrf, gotcha, ux]
sources:
  - raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
related:
  - pages/concepts/oauth-scope-check-before-persist.md
  - pages/synthesis/google-calendar-integration-state.md
status: draft
---

# TTL curto do cookie de state/PKCE derruba consent lento

> O cookie httpOnly que guarda o `state` (anti-CSRF, HMAC-bound ao userId) e o PKCE verifier expira em ~10 min. Se o usuário demora mais que isso na tela de consent do Google, o callback rejeita com `gcal_error=state` mesmo tendo feito tudo certo.

## Contexto

No fluxo OAuth do Google Calendar (`connect` → consent do Google → `callback`), o `POST /connect` planta `gcal_oauth_state` + `gcal_oauth_verifier` em cookies httpOnly com **TTL de 600s**. O `callback` valida o `state` do cookie contra o da query (comparação constant-time) antes de trocar o code por tokens.

## Pontos-chave

- O relógio dos 600s começa no clique em **Conectar/Reconectar**, não no callback.
- Um consent REAL é lento: tela **"O Google não verificou este app"** (app não verificado) + tela de re-login + tela de escopo + hesitação humana. Passar de 10 min é fácil — aconteceu **2×** na sessão de 2026-07-10.
- Sintoma: callback volta com `?gcal_error=state`. Parece "sessão/CSRF quebrada", mas a causa real é **tempo**. O escopo até pode ter sido concedido (aparece no log do callback) — não adianta, o state já expirou.

## Quando NÃO se confundir

- `gcal_error=state` ≠ scope-mismatch. Se o `scope=` no callback **inclui** `calendar.events.readonly` mas veio `state`, foi timeout, não checkbox. Ver [[oauth-scope-check-before-persist]].

## Mitigação

- **UX**: mostrar o erro de forma **persistente** (alerta no card + "Tentar novamente"), não só toast efêmero — senão a pessoa não entende por que "não conectou". A mensagem de `state` orienta "conecte novamente e conclua sem demora".
- **Ser rápido** nas telas do Google (dirigir o fluxo até a tela final e só então entregar o clique de consent ao dono reduz o tempo humano).
- Se virar fricção recorrente em produção, avaliar **subir o TTL** do cookie (trade-off: janela de CSRF maior).

## Cross-refs

- [[oauth-scope-check-before-persist]] — o outro motivo de callback falhar (escopo).
- `.context/features/google-calendar.md` — fluxo OAuth implementado (§ callback).

## Fontes

- raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
