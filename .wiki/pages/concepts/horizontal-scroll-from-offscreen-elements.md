---
title: Scroll horizontal no mobile vindo de elementos fora da viewport
type: concept
created: 2026-06-24
updated: 2026-06-24
tags: [css, mobile, recaptcha, ux, gotcha]
sources:
  - raw/sessions/2026-06-24-bugfix-cadastro-login.md
related:
  - .context/features/auth.md
  - .context/features/lgpd-account.md
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

## Pontos-chave

- `overflow-x: hidden` no `<body>` mascara o sintoma mas não resolve elementos `fixed` (relativos à viewport) — prefira eliminar a fonte.
- Em dev sem `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` o badge nem carrega → o bug só aparece em prod; reproduzir exige a chave (ou raciocinar pelo CSS do badge).

## Cross-refs

- `.context/features/auth.md` — validação manual no browser (sem scroll lateral com erros na tela).
- [[dev-fallback-without-secrets]] — por que o reCAPTCHA não roda em dev.

> Fonte: `src/app/globals.css`, `src/app/(auth)/registro/page.tsx`, `raw/sessions/2026-06-24-bugfix-cadastro-login.md`.
