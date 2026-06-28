---
title: next dev serve CSS stale depois de um next build (Turbopack)
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [nextjs, turbopack, dev, gotcha, css]
sources:
  - raw/sessions/2026-06-27-paonetone-ui-feedback.md
status: stable
---

Rodar `npm run build` (produção) e depois `npm run dev` na mesma `.next` faz o **dev server servir CSS compilado stale** — edições recentes no `globals.css` (ex.: regras novas em `@layer base`) **não aparecem**, mesmo após reiniciar o `next dev` e dar reload no browser.

## Sintoma observado

Regras novas em `globals.css` (`:-webkit-autofill`, `.ProseMirror …::before`) ausentes do CSS servido, enquanto regras **antigas** do mesmo `@layer base` (`.grecaptcha-badge`) apareciam → prova de staleness, não de stripping pelo Tailwind. `touch` no arquivo + reload **não** resolveu; restart do `next dev` **não** resolveu (reusa o cache `.next` deixado pelo build).

## Fix

Limpar a `.next` e reiniciar o dev:

```bash
pkill -f "next dev"
node -e "require('fs').rmSync('.next',{recursive:true,force:true})"  # rm -rf .next pode ser bloqueado pelo sandbox
npm run dev
```

## Como verificar via browser (Chrome MCP)

`fetch(<href do link[rel=stylesheet]>, {cache:'no-store'})` e `grep` no texto. Para inspecionar regras já parseadas, recursar em `sheet.cssRules` **incluindo grupos** (`@layer`/`@media` são `CSSLayerBlockRule`/`CSSMediaRule` com `.cssRules` próprio — um loop só no topo não acha regras dentro de `@layer base`).

## Regra prática

Depois de um `npm run build`, **sempre** limpe a `.next` antes de voltar ao `next dev` — senão você debuga um CSS fantasma. Idem ao terminar uma sessão que rodou build: reinicie o dev com `.next` limpa antes de entregar o ambiente.

> Fonte: raw/sessions/2026-06-27-paonetone-ui-feedback.md
