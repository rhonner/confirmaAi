---
title: Validar escopo concedido ANTES de gravar a conexão (sem "meio conectado")
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [oauth, google-calendar, invariant, callback]
sources:
  - raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
related:
  - pages/concepts/oauth-state-cookie-ttl-expiry.md
  - pages/concepts/external-event-firewall.md
status: draft
---

# Validar escopo concedido ANTES de gravar a conexão (sem "meio conectado")

> No callback OAuth, checar o escopo concedido **antes** de qualquer `upsert` da conexão. Assim, um consent incompleto (usuário não marcou o escopo do calendário) rejeita limpo — nunca deixa um registro "meio conectado".

## Contexto

Pergunta do dono (2026-07-10): "se eu conecto e não marco o checkbox de permissão, fico meio conectado?" **Não.** O callback (`src/app/api/integrations/google-calendar/callback/route.ts:82-87`) faz, nesta ordem:

1. troca o code por tokens;
2. **`if (!hasCalendarScope(tokens.grantedScopes))`** → revoga o grant recém-criado (higiene, quando seguro) e `return redirectTo("?gcal_error=scope")`;
3. só DEPOIS: `prisma.googleCalendarConnection.upsert(...)`.

Como o retorno de erro acontece **antes** do upsert, nenhuma linha é gravada.

## Pontos-chave

- **Fresh connect (sem linha) + escopo faltando** → revoga o grant novo + `gcal_error=scope`, **DISCONNECTED** (não limbo). Confirmado E2E: DB fica `(sem linha)`.
- **Reconnect da MESMA conta com conexão saudável + escopo faltando** → a conexão existente fica **intacta** (o scope-mismatch não a toca; não revoga um grant saudável do par conta+app). Isso é o fix do code-review de 2026-07-05 (só revoga o grant novo se NÃO existe conexão OU é conta diferente).
- **Revogar 1 refresh token derruba o grant INTEIRO do par conta+app** no Google → por isso a revogação de higiene é condicional.

## Princípio reusável

Ao integrar OAuth de terceiros: **complete-or-nothing**. Valide que o grant tem tudo que a feature precisa (escopo, refresh token) antes de persistir a conexão. Uma conexão parcial é pior que nenhuma — engana o usuário e a UI.

## Cross-refs

- [[oauth-state-cookie-ttl-expiry]] — o outro caminho de `gcal_error` (timeout, não escopo).
- [[external-event-firewall]] — a outra invariante de segurança do GCal.
- `.context/features/google-calendar.md` — § Fluxo OAuth + § "não existe meio-conectado".

## Fontes

- raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
