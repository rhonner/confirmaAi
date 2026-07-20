---
title: Scroll horizontal no mobile vindo de elementos fora da viewport
type: concept
created: 2026-06-24
updated: 2026-07-19
tags: [css, mobile, recaptcha, ux, touch, gotcha]
sources:
  - raw/sessions/2026-06-24-bugfix-cadastro-login.md
  - raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
related:
  - .context/features/auth.md
  - .context/features/lgpd-account.md
  - pages/concepts/chrome-mcp-drive-and-assert-via-js.md
status: draft
---

# Scroll horizontal no mobile vindo de elementos fora da viewport

> Sócio relatou "bugadinha de scroll lateral" no cadastro. Causa raiz: elementos posicionados **fora da viewport à direita/esquerda** entram no overflow horizontal do `<body>` e geram scrollbar lateral no mobile. Dois culpados clássicos neste projeto.

## Culpado 1 — badge do reCAPTCHA v3 (`position: fixed`)

O script do reCAPTCHA v3 injeta `.grecaptcha-badge` como `position: fixed` ancorado em `right: -186px` (fica "escondido" mostrando só uma aba). Por ser `fixed`, **não é clipado** pelo `overflow-hidden` de nenhum ancestral — ele expande a largura rolável da viewport → scroll horizontal no mobile.

**Fix**: esconder o badge via CSS global + manter a **atribuição visível** (exigência do ToS do Google):

```css
/* globals.css */
.grecaptcha-badge { visibility: hidden; }
```
```tsx
/* na tela que roda reCAPTCHA */
Protegido por reCAPTCHA. Aplicam-se a [Privacidade] e [Termos] do Google.
```

`visibility: hidden` (não `display:none`) é suficiente: como o badge é `fixed`, esconder a pintura já mata o scroll, sem gap visual.

⚠️ **Footgun**: a regra CSS é global, mas a atribuição só existe na tela que usa `useRecaptcha` (hoje `/registro`). Toda tela nova que chamar o hook **deve** renderizar a atribuição (documentado em `src/hooks/use-recaptcha.ts`), senão esconde o badge sem atribuição = violação do ToS.

## Culpado 2 — honeypot `left: -9999px`

Honeypots anti-bot às vezes usam `position:absolute; left:-9999px` pra sair da tela. Dependendo do ancestral posicionado/overflow, isso **vaza** pro overflow horizontal. Use o padrão `clip`/sr-only, que nunca cria scroll:

```css
position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%);
white-space: nowrap; border: 0;
```

## Como detectar

No browser (Chrome MCP), em viewport estreito:

```js
document.documentElement.scrollWidth > document.documentElement.clientWidth // true = tem scroll lateral
```

Cheque **com os erros de validação na tela** (o relato original era ao aparecer mensagem de campo obrigatório — o reflow só tornou o badge mais perceptível).

## Culpado 3 — cards com padding lateral > largura (addendum 2026-07-19)

Bugs mobile do dono no S24+ ("cards cortados" + a página "entortando"/**tilt** ao rolar). Aqui a fonte não era um elemento fora da tela, e sim conteúdo que estoura **poucos pixels** a largura da viewport (card sem `px` responsivo, tabela larga). No **touch** isso é bem mais visível que no desktop: alguns px de overflow horizontal deixam a página inteira **"pannável"** — ao rolar na vertical, ela desliza de leve na horizontal (o "tilt"). No trackpad/mouse isso quase não aparece; no dedo, aparece sempre.

**Fix aplicado**: `overflow-x-hidden` no **scroll container** (o `<main>`) — mata o pan lateral na raiz —, mais `px-4 sm:px-6` nos cards pra não estourarem. Por que `overflow-x-hidden` no `<main>` é **seguro** aqui (não engole scroll legítimo):

- **Radix usa portal**: Popover/Dialog/Select montam fora do `<main>` → o clip do container não os corta.
- **Tabelas largas têm o próprio wrapper** com `overflow-x-auto` → continuam roláveis dentro da sua caixa; o clip do `<main>` só mata o overflow **da página**.
- Difere do reCAPTCHA (Culpado 1): lá o `overflow-x-hidden` **não** resolveria (o badge é `fixed`, relativo à viewport, não ao container) — por isso o fix de lá é esconder a fonte. Aqui a fonte é conteúdo **dentro** do fluxo, então clipar o container é o remédio certo.

⚠️ **Não confie no Chrome MCP pra validar isto**: `resize_window` é no-op neste setup → a viewport fica desktop e o tilt (que é fenômeno de **touch**) não reproduz. Aproxime por geometria forçada e **confirme no aparelho** — ver [[chrome-mcp-drive-and-assert-via-js]] §5.

## Pontos-chave

- `overflow-x: hidden` no `<body>` mascara o sintoma mas não resolve elementos `fixed` (relativos à viewport) — prefira eliminar a fonte. **Mas** no scroll container (`<main>`), pra overflow vindo de conteúdo **no fluxo**, ele é o fix correto e seguro (portais do Radix + wrappers de tabela sobrevivem).
- No **touch**, poucos px de overflow já bastam pra página ficar "pannável" (o tilt) — sintoma que quase não aparece no desktop. Teste pensando no dedo, não no mouse.
- Em dev sem `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` o badge nem carrega → o bug do Culpado 1 só aparece em prod; reproduzir exige a chave (ou raciocinar pelo CSS do badge).

## Cross-refs

- `.context/features/auth.md` — validação manual no browser (sem scroll lateral com erros na tela).
- [[dev-fallback-without-secrets]] — por que o reCAPTCHA não roda em dev.
- [[chrome-mcp-drive-and-assert-via-js]] §5 — por que o MCP não valida bug de layout mobile (resize_window no-op).

> Fontes: `src/app/globals.css`, `src/app/(auth)/registro/page.tsx`, o `<main>` do `(dashboard)/layout.tsx` + cards com `px-4 sm:px-6`; `raw/sessions/2026-06-24-bugfix-cadastro-login.md`, `raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md`.
