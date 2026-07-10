---
title: Radix Popover & Dialog — gotchas
type: entity
created: 2026-05-07
updated: 2026-07-10
tags: [radix, ui, gotcha, testing]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
  - raw/sessions/2026-07-10-2200-agenda-month-view.md
related:
  - .context/features/plan-quota.md
  - pages/concepts/chrome-mcp-drive-and-assert-via-js.md
status: stable
---

> Comportamentos não-óbvios descobertos durante teste manual no Chrome MCP do Sprint 3 (UX paywall).

## Popover: `.click()` programático não dispara

```ts
document.querySelector('[data-testid="usage-badge"]').click();
// → não abre o popover
```

Radix Popover usa **pointer events** (`onPointerDown` interno), não o `click` clássico. Programmatic `.click()` em Node/test runner não simula pointer event corretamente.

**Implicações pra teste:**
- E2E Playwright: `page.click()` funciona (Playwright simula pointer corretamente).
- Smoke via JS no DevTools/MCP: prefer Chrome MCP `computer.left_click(coordinate)` que dispara pointer event de verdade.
- Unit test em React Testing Library: `userEvent.click()` funciona, `fireEvent.click()` pode falhar.

## Dialog: variant `hard` (não-fechável até CTA)

`<Dialog>` do Radix tem `onOpenChange(next)` que dispara em qualquer tentativa de fechar (X, click fora, ESC). Pra criar um modal bloqueante até CTA explícito:

```tsx
<Dialog
  open={open}
  onOpenChange={(next) => {
    if (!next && variant === "hard") return; // suprime o close
    onOpenChange(next);
  }}
>
  <DialogContent showCloseButton={!isHard}>
    {/* ... */}
  </DialogContent>
</Dialog>
```

`showCloseButton={false}` esconde o X. `onOpenChange` ignora close-from-outside. Resultado: usuário só fecha clicando num CTA dentro do modal (`<Link href="/billing">`).

**Validado no Chrome MCP** (Sprint 3):
- Click fora → não fecha ✓
- ESC → não fecha ✓
- Click no "Assinar Pro" → navega ✓

## Dialog: o 1º clique após fechar é engolido

Ao fechar um `Dialog`/`AlertDialog` (via `Cancelar`, ESC, click-fora, ou submit que fecha), o teardown do Radix (remoção do overlay + release do focus/pointer-events lock) **absorve o clique imediatamente seguinte**. No próprio Radix isso raramente incomoda um humano (o clique some num piscar), mas em **roteiro de teste no Chrome MCP** é determinístico e recorrente: o primeiro `computer.left_click` depois de fechar um modal não faz nada.

**Implicações pra teste (Chrome MCP):**
- Depois de fechar um Dialog, **clique 2×** no próximo alvo (ou intercale um `screenshot`/`wait`).
- Vale também para fechar um `AlertDialog` sobreposto a um Dialog: o clique seguinte (ex.: `Cancelar` do Dialog de baixo) é engolido; use `Escape` ou re-clique.
- Não é bug da app — é o ciclo de vida do Radix. Não "conserte" no produto por causa do teste.

Faz par com as técnicas em [[chrome-mcp-drive-and-assert-via-js]].

## Implicação pra Definition of Done

**Esses bugs não são pegáveis por typecheck nem vitest.** Só validação no browser real (Chrome MCP) garante. Isso reforça [[../concepts/done-with-chrome-walkthrough]] (regra hard).

## Wikilinks

- Sprint 3 ([[monetization-v2-state]])

> Fonte: `src/components/billing/paywall-modal.tsx`, validação manual via Chrome MCP em 2026-05-07.
