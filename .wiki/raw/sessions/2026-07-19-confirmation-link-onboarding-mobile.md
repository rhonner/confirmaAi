---
type: session
date: 2026-07-19
branch: main
status: ingested
files_touched:
  - src/lib/services/confirmation-token.ts
  - src/app/confirmar/[token]/page.tsx
  - src/app/api/confirmar/[token]/route.ts
  - src/components/confirmation/confirm-actions.tsx
  - src/lib/services/message-template.ts
  - src/lib/services/scheduler.ts
  - src/lib/appointment-status.ts
  - src/lib/terminology.ts
  - src/hooks/use-terminology.ts
  - src/app/api/onboarding/route.ts
  - src/components/onboarding/onboarding-wizard.tsx
  - src/app/(dashboard)/layout.tsx
  - src/lib/auth.ts
  - prisma/schema.prisma
  - prisma/migrations/20260719155729_add_business_type_onboarding/
  - src/app/configuracoes/page.tsx
---

# Sessão 2026-07-19 — Confirmação por link + Onboarding/terminologia + fixes mobile

## Objetivo da sessão

Sessão longa autônoma (madrugada→manhã) entregando duas features grandes vindas do
feedback do dono/Paonetone: (1) paciente **confirma/cancela por LINK** (não mais
"responda 1/2") com auto-cancelamento no prazo; (2) **onboarding** no 1º login que
escolhe o ramo do negócio e dirige a **terminologia** da UI (Paciente vs Cliente).
Antes disso, fechados 3 bugs mobile do dono no Galaxy S24+ (já commitados em `5395ad0`).

## Resultado

- **Feature 1 — Confirmação por link** entregue e validada E2E no Chrome. Token HMAC
  stateless, página GET read-only + botão POST, deadline com piso de GRACE,
  `autoCancelUnconfirmed` substituindo o antigo lembrete, settings redesenhado
  (editor de "lembrete" removido; `reminderHoursBefore` relabelado p/ auto-cancel).
  Doc operacional: `.context/features/confirmation-link.md`.
- **Feature 2 — Onboarding + terminologia** entregue e validada E2E. `enum BusinessType`
  (HEALTH/AESTHETICS/BEAUTY/FINANCE/OTHER), wizard de passo único, `terminology.ts` +
  `useTerminology`, campos no JWT. **Rota/modelo `Patient` mantêm o nome técnico** — só
  rótulos de UI. Doc: `.context/features/onboarding.md`.
- **Trocar o ramo em Configurações** (era o top follow-up) acabou **entregue na mesma
  sessão**: `<select>` "Ramo do negócio" no card "Dados da clínica", integrado ao form
  de settings (um só Salvar). Foi o que levou o vitest a 386.
- Gate final das duas: tsc · vitest **386** · build · **test:sprints 153/153**. Ambas
  passaram por `/code-review` xhigh (workflow) com achados críticos corrigidos (abaixo).
- ⚠️ **Não commitadas** (dono commita via `gh`; F1 e F2 = commits SEPARADOS; msgs no
  `AUTONOMOUS_PLAN.md` da raiz — que NÃO deve ser commitado).
- ⚠️ **Migration `20260719155729` pendente em produção** (aplicar no deploy via `DIRECT_URL`).

## Decisões / aprendizados

- **Só o link na mensagem** (sai o "Responda 1/2"), mas o parser 1/2 do webhook segue
  vivo como **fallback silencioso**. — Por quê: reduz atrito ("é só clicar") sem perder
  quem responde por texto.
- **Página com botão, nunca confirma no GET.** — Por quê: o WhatsApp pré-carrega o link
  (preview/scanner) e dispararia a ação sozinho. GET read-only, POST muta. → concept
  [[link-action-must-not-mutate-on-get]].
- **Uso único é do ESTADO** (`status !== PENDING`), não do token — sem tabela nova.
- **Terminologia só nos RÓTULOS de UI**; código/rotas/modelos mantêm "Patient". — Por quê:
  renomear o modelo/rota seria migration + risco enorme por ganho cosmético.
- **Default conservador "Paciente"** (HEALTH/null). — Por quê: ramo mais sensível a nome.

## Gotchas / surpresas

- 🔴 **Bug crítico F1 (code-review): link enviado em cima da hora nascia expirado.** O
  deadline `dateTime − reminderHoursBefore` fica no passado se o envio atrasa (backlog do
  cron, WhatsApp reconectou tarde, agendamento last-minute) → link já expirado + auto-cancel
  imediato. Fix: piso `sentAt + GRACE` (2h) em `effectiveDeadlineMs`, mesma fórmula no envio
  (sentAt=now) e no auto-cancel (sentAt=confirmationSentAt). → concept
  [[baked-deadline-needs-grace-floor]].
- 🔴 **Bug crítico F2 (code-review): JWT stale travava a base logada no wizard.** Tokens
  emitidos antes da feature não têm o claim `onboardingCompletedAt` → o `?? null` do session
  callback abria o wizard **não-dispensável** pra todo usuário já logado (mesmo backfillado).
  Fix: o `jwt` callback relê o banco **quando o claim está AUSENTE** (`=== undefined`, ≠ null),
  leitura única de migração; e o wizard virou dispensável (defesa em profundidade). → concept
  [[jwt-new-claim-defaults-stale-tokens]].
- **`resize_window` do Chrome MCP é no-op neste setup** → não emula mobile; os bugs do S24+
  (overflow/tilt) não reproduzem no MCP. Validação real = geometria forçada + **dono no
  aparelho**. → addendum em [[chrome-mcp-drive-and-assert-via-js]] §5.
- **Tilt no touch**: poucos px de overflow horizontal deixam a página "pannável" (desliza de
  leve ao rolar na vertical); some no desktop. Fix `overflow-x-hidden` no `<main>` (seguro:
  Radix usa portal, tabelas têm wrapper próprio). → addendum em
  [[horizontal-scroll-from-offscreen-elements]].
- **Não rodar SQL cru no Neon** pra adiantar coluna (não registra em `_prisma_migrations` →
  próximo `migrate deploy` falha e quebra o build); deploy sem migration nova imprime
  "No pending migrations" — é normal. → addendum em [[migrations-not-auto-applied]].

## Para ingerir na wiki

- [x] criar `pages/concepts/link-action-must-not-mutate-on-get.md` — anti-prefetch do WhatsApp
- [x] criar `pages/concepts/baked-deadline-needs-grace-floor.md` — piso de GRACE
- [x] criar `pages/concepts/jwt-new-claim-defaults-stale-tokens.md` — claim novo coage stale ao default
- [x] atualizar `pages/concepts/migrations-not-auto-applied.md` — nuance SQL cru no Neon + "No pending migrations"
- [x] atualizar `pages/concepts/chrome-mcp-drive-and-assert-via-js.md` — §5 resize_window no-op / mobile
- [x] atualizar `pages/concepts/horizontal-scroll-from-offscreen-elements.md` — tilt no touch + overflow-x-hidden no `<main>`

## Conversa relevante (opcional)

Muito do técnico já vive em `.context/features/confirmation-link.md` e `.context/features/onboarding.md`
(este raw referencia, não duplica). O que subiu pra wiki são os padrões reusáveis fora do
escopo dessas duas features.

## Addendum 2026-07-19 21:08 -03 — commit/deploy + verificação em prod

O bloco "Resultado" acima descreve o fim da **sessão autônoma** (trabalho pronto, ainda **não commitado**,
migration **pendente**). Isso foi superado no mesmo dia pelo dono:

- **Commitado + pushado + deployado**: `7ccb22d` (F1 + F2 num commit só — não separados como o plano previa)
  e `147a4e7` (trocar ramo em Configurações). `HEAD == origin/main == 147a4e7`.
- **Migration `20260719155729` aplicada em PROD** pelo `vercel-build` no deploy — confirmado por consulta
  direta ao `_prisma_migrations` do Neon: `finished_at` 2026-07-19 17:04 UTC, `rolled_back_at` null,
  colunas presentes em `User`, **backfill 19/19 onboarded**. Nada a aplicar manualmente.

Detalhe da verificação no `log.md` (entry 2026-07-19 21:08). Nenhuma pendência desta feature em aberto —
só polish opcional (rótulos server-side, dedup `.toLowerCase()`, passos extra do wizard, débito #3 da F1).
