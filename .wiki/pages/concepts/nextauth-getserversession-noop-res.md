---
title: NextAuth v4 — getServerSession descarta escrita de cookie do callback jwt (throttle no token não persiste)
type: concept
created: 2026-07-04
updated: 2026-07-04
tags: [nextauth, auth, performance, gotcha, jwt]
sources:
  - raw/sessions/2026-07-04-agenda-mini-calendar-session-fixes.md
related:
  - .context/features/auth.md
  - pages/concepts/nextauth-credentials-authorize-stub.md
status: draft
---

# `getServerSession` roda o callback `jwt` mas **descarta** o cookie reescrito

> Achado de code-review adversarial (2026-07-04). Ao adicionar revalidação de conta no callback `jwt` com throttle via `token.checkedAt`, o throttle **não funciona no servidor**: cada request autenticado disparava a leitura no banco de novo. Regressão silenciosa — pior ainda no Neon Free.

## Por quê

No App Router / RSC, `getServerSession(authOptions)` é chamado com **um único argumento** → o NextAuth entra no caminho `isRSC` (`node_modules/next-auth/next/index.js`) e passa um `res` **no-op**: `{ getHeader(){}, setCookie(){}, setHeader(){} }`. O action `session` (`core/routes/session.js`) **sempre** invoca `callbacks.jwt`, re-encoda o token e o empurra pra `response.cookies`; mas `_utils.setCookie` escreve via `res.setHeader` — que é no-op. Resultado: o token reescrito (com o novo `checkedAt`) **nunca chega ao browser**. O cookie só é de fato regravado no caminho do **client** `/api/auth/session` (route handler do App Router, com cookies reais) — ou seja, a cada poll (`refetchInterval`) / focus.

Consequência: qualquer estado que você tente "guardar no token pra throttlar" (timestamp, contador) **não persiste** entre chamadas de `getServerSession`. Como `getAuthSession` roda em toda rota protegida (24 rotas), a leitura extra do `jwt` dispara ~sempre → ~2x leituras na tabela `User` no caminho mais quente (a própria `getAuthSession` já faz um `findUnique`).

## Fix (o que ficou)

**Não relê o banco no `jwt` a cada request. Só quando `trigger === "update"`.** Raciocínio:

1. `getAuthSession` (`auth-helpers.ts`) **já** faz um `findUnique` fresco (existência + `deletedAt`) em **todo** request → é a autoridade de revogação (401 → `signOut` no `fetchApi`, imediato). Reler no `jwt` no caminho do `getServerSession` seria leitura **duplicada** no caminho mais quente (crítico no Neon Free).
2. O `jwt` DB-read só tem valor pro **client** (nome no header). Então basta reler quando o client pede refresh explícito: `trigger === "update"` (ex: `useSession().update()` após salvar Configurações) — caminho que **persiste** o cookie.
3. Revogação em nível de shell fica como defense-in-depth via `session.error="AccountRevoked"` + `SessionGuard`.

⚠️ **Anti-padrões que testei e descartei** (não repita):
- Throttle por `token.checkedAt`: não persiste no servidor (este bug) → dispara toda hora.
- `Map<userId, ts>` em memória: colapsa rajada, mas o caminho `getServerSession` (que descarta cookie) **consome** a janela de 60s e inania o caminho client (que persiste) → claims não atualizam; e ainda é leitura duplicada com `getAuthSession`.
- `SessionProvider refetchInterval`: gera polling de DB ocioso (via `jwt`) sem ganho real.

Trade-off aceito: `clinicName` mudado em **outro** device só reflete após re-login/`update()`; aba 100% ociosa só desloga na próxima interação. Cobrem o caso real sem onerar o banco.

## Pontos-chave

- `getServerSession` **executa** `callbacks.jwt`/`callbacks.session` a cada chamada — não os pule assumindo cache.
- Escritas de cookie do `jwt` só "grudam" no caminho client `/api/auth/session`, nunca no `getServerSession` RSC.
- Revogação de JWT stateless: leitura sempre-fresca no helper de sessão (server) + `session.error`→`signOut` no client (`SessionGuard`) + `refetchInterval` no `SessionProvider`. Ver [[nextauth-credentials-authorize-stub]] p/ outra pegadinha de internals do v4.

> Fonte: `src/lib/auth.ts`, `src/lib/auth-helpers.ts`, `node_modules/next-auth/next/index.js`, `.context/features/auth.md`.
