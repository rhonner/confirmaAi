---
title: scrollbar-gutter:stable mata o "pulo" horizontal ao alternar páginas que rolam
type: concept
created: 2026-07-04
updated: 2026-07-04
tags: [css, layout, ux, scrollbar, gotcha]
sources:
  - raw/sessions/2026-07-04-agenda-mini-calendar-session-fixes.md
related:
  - .context/features/appointments.md
  - pages/concepts/horizontal-scroll-from-offscreen-elements.md
status: draft
---

# `scrollbar-gutter: stable` — fim do jitter horizontal entre páginas que rolam e que não rolam

> A sócia relatou que a Agenda "dá uma tiltadinha" ao transitar entre um dia **com** agendamentos (conteúdo alto, rola) e um **sem** (conteúdo baixo, não rola). Causa: a barra de rolagem clássica aparece/desaparece e reduz/devolve ~15px da largura do container, empurrando o conteúdo centralizado na horizontal.

## Onde

O scroller do dashboard é o `<main className="... overflow-y-auto">` em `src/app/(dashboard)/layout.tsx` (o wrapper externo é `overflow-hidden`). Quando o conteúdo não excede a altura, não há barra → sem barra o `clientWidth` é maior → o `max-w-7xl mx-auto` recentra ~7-8px pra cada lado. Ao navegar pra uma página que rola, a barra volta e o conteúdo salta.

## Fix

```tsx
<main className="flex-1 p-4 lg:p-8 overflow-y-auto [scrollbar-gutter:stable]">
```

`scrollbar-gutter: stable` reserva **sempre** o espaço da barra em elementos com `overflow: auto/scroll`, role ou não → largura constante → sem salto.

## Pegadinha ao verificar (macOS)

Em macOS/Chrome com **overlay scrollbars** (padrão), a barra tem largura **0** — o gutter reservado é 0px e o bug **não reproduz** na máquina do dev. Não conclua "não tem bug": o defeito aparece em sistemas com **barra clássica** (Windows/Linux, ou macOS com "Mostrar barras de rolagem: sempre"), que é onde a sócia viu. Verificação honesta:

```js
const main = document.querySelector('main');
getComputedStyle(main).scrollbarGutter; // "stable" (aplicado)
main.offsetWidth - main.clientWidth;    // largura reservada; 0 em overlay (sem bug), >0 em barra clássica (fix agindo)
```

## Pontos-chave

- Aplique no **elemento que rola** (aqui `main`), não no `html` (que não rola neste layout).
- Diferente de [[horizontal-scroll-from-offscreen-elements]] (aquele é overflow-x de elementos `fixed`/off-screen; este é a largura da barra vertical mudando).
- `scrollbar-gutter` é no-op onde a barra tem largura 0 → seguro de aplicar globalmente sem efeito colateral visual.

> Fonte: `src/app/(dashboard)/layout.tsx`, `.context/features/appointments.md`.
