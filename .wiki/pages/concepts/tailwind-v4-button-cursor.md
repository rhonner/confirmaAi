---
title: Tailwind v4 zera cursor:pointer dos <button>
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [tailwind, css, ui, gotcha]
sources:
  - raw/sessions/2026-06-27-paonetone-ui-feedback.md
related:
  - pages/concepts/autofill-highlight-css.md
status: stable
---

O Preflight (reset CSS) do **Tailwind v4** mudou em relação ao v3: ele força `cursor: default` em `<button>` (segue a spec do browser moderno). Resultado: todo `<button>` sem `cursor-pointer` explícito mostra a setinha no hover, não a mãozinha — parece "não-clicável".

## Sintoma

A sócia reportou que vários elementos do signup/login "não viram cursor pointer no mouseover": botão de submit, toggle de senha (olho), links Termos/Privacidade. Todos eram `<button>`. Os `<a>` reais (ex.: reCAPTCHA, "Fazer login" via `<Link>`) **não** sofrem — o Preflight só reseta `<button>`.

## Fix

- **Na raiz**: adicionar `cursor-pointer` na string base do `cva` em `src/components/ui/button.tsx` → conserta TODO `<Button>` do app de uma vez. `disabled:pointer-events-none` (já presente) garante que botão desabilitado não mostre a mãozinha.
- **`<button>` crus** (não passam pelo componente `Button`): precisam de `cursor-pointer` manual. No projeto: `password-input.tsx` (toggle do olho), os 4 `<button>` de Termos/Privacidade em `(auth)/registro/page.tsx` e `(auth)/layout.tsx`.

## Regra prática

Ao criar um `<button>` cru (não-`<Button>`) clicável no Tailwind v4, **sempre** inclua `cursor-pointer`. Preferir o componente `<Button variant="link">` quando for "link que é button".

> Fonte: raw/sessions/2026-06-27-paonetone-ui-feedback.md
