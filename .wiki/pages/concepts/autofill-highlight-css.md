---
title: Neutralizar o highlight de autofill do browser
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [css, forms, ui, gotcha]
sources:
  - raw/sessions/2026-06-27-paonetone-ui-feedback.md
related:
  - pages/concepts/tailwind-v4-button-cursor.md
status: stable
---

O Chrome/Safari pintam campos preenchidos por **autofill** com um fundo amarelo/azul nativo via a pseudo-classe `:-webkit-autofill`, que persiste até o campo ser editado manualmente. Isso destoa do tema.

## Sintoma

A sócia reportou o campo "Nome da Clínica" do signup ficando **destacado** "depois de preencher". Não era bug de CSS do projeto: era o autofill nativo — e aparecia só nesse campo porque `autoComplete="organization"` casava com um valor salvo no perfil do browser (o campo CPF tem `autoComplete="off"`, então não acende). Não dá pra reproduzir "sob demanda" via script — depende do estado salvo do browser.

## Fix (em `globals.css`, dentro de `@layer base`)

```css
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  -webkit-text-fill-color: var(--foreground);
  -webkit-box-shadow: 0 0 0px 1000px var(--background) inset; /* única forma de sobrescrever o fundo */
  caret-color: var(--foreground);
  transition: background-color 5000s ease-in-out 0s; /* evita o flash do fundo */
}
```

O `box-shadow inset` gigante é o truque consagrado para "pintar por cima" do fundo de autofill (não dá pra mudar `background` direto). Mantém o autofill funcional, só neutraliza a cor. Vale global (todos os inputs).

> Fonte: raw/sessions/2026-06-27-paonetone-ui-feedback.md
