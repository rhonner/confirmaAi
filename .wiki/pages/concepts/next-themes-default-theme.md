---
title: next-themes defaultTheme="system" segue o SO
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [next-themes, theme, ui]
sources:
  - raw/sessions/2026-06-27-paonetone-ui-feedback.md
status: stable
---

Com `<ThemeProvider defaultTheme="system" enableSystem>` (next-themes), o **primeiro** acesso (sem preferência salva em localStorage) resolve o tema pela preferência do **sistema operacional** (`prefers-color-scheme`). Se o SO está em dark, o app nasce dark.

## Decisão (2026-06-27)

A sócia notou o signup aparecendo escuro e pediu **tema claro como padrão** ("o único ser que gosta de tema escuro é dev"). Fix: `defaultTheme="light"` em `src/components/providers.tsx`. Mantido `enableSystem` (só é usado se o usuário escolher explicitamente; o toggle só alterna `light`/`dark`). Usuários antigos com preferência já salva no localStorage mantêm a escolha — `defaultTheme` só afeta quem nunca setou.

## Notas

- As telas de auth **já respeitavam** o tema (sem classe `dark` forçada nem `forcedTheme`); só nasciam escuras por causa do `defaultTheme="system"`. Bastou o provider.
- O toggle de tema estava acoplado ao `app-header` (só no dashboard). Foi extraído para `src/components/layout/theme-toggle.tsx` e colocado também no `(auth)/layout.tsx` (canto superior direito), pois as telas de auth não têm header.
- `<html suppressHydrationWarning>` já presente → sem warning de hydration ao injetar a classe.
- **Toggle deve comparar `resolvedTheme`, não `theme`** (achado do code-review): com `enableSystem`, `theme` pode ser a string `"system"`; `setTheme(theme === "dark" ? "light" : "dark")` daria um clique no-op pra quem tem `"system"` salvo (ainda possível: valor antigo no localStorage). `resolvedTheme` é sempre o tema realmente aplicado (`"light"`/`"dark"`).

> Fonte: raw/sessions/2026-06-27-paonetone-ui-feedback.md
