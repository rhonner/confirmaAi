---
title: TipTap v3 — node view em DOM puro evita flushSync; nodeInputRule sem captura
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [tiptap, prosemirror, react, editor, gotcha]
sources:
  - raw/sessions/2026-06-27-paonetone-ui-feedback.md
related:
  - pages/concepts/rhf-radix-gotcha.md
status: stable
---

Aprendizados ao construir o **editor de chips de template** (variáveis `{nome}` viram tokens atômicos) com TipTap v3 — ver `.context/features/settings.md` e `src/components/settings/template-editor.tsx`.

## 1. `ReactNodeViewRenderer` → erro `flushSync`

Usar `ReactNodeViewRenderer(Component)` para renderizar o chip dispara, no console:

> flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering.

O renderer React do TipTap usa `flushSync` para montar os node views, o que colide com a fase de render do React (16 erros no load, com 8 chips). O Next dev mostra "2 Issues".

**Fix**: usar **node view em DOM puro** — `addNodeView()` retornando `{ dom }` com `document.createElement`. Sem React, sem flushSync, zero erros. O botão `×` do chip é um `<button>` com `addEventListener("mousedown", …)` (mousedown + `preventDefault` pra não roubar a seleção antes), que despacha `tr.delete(pos, pos + node.nodeSize)` via `getPos()`. Classes Tailwind como strings literais no .tsx (o scanner do Tailwind v4 pega).

## 2. `nodeInputRule` com grupo de CAPTURA preserva os delimitadores

Para "digitar `{nome}` vira chip", `nodeInputRule({ find: /\{(nome|...)\}$/ })` parece óbvio — mas com **grupo de captura** o TipTap substitui só a palavra capturada (`nome`) e **mantém as chaves**, virando `{` + chip + `}` = serializa `{{nome}}` (preview quebra).

**Fix**: grupo **não-capturante** `/\{(?:nome|data|hora|clinica)\}$/` (substitui o `match[0]` inteiro) e extrair o nome com `match[0].slice(1, -1)` no `getAttributes`.

## 3. Outros

- `useEditor({ immediatelyRender: false })` é obrigatório em SSR/Next (evita hydration mismatch).
- Placeholder (`@tiptap/extension-placeholder`) precisa de CSS global: `.ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); … }`.
- Manter a **string `{var}` como fonte da verdade**: serializar no `onUpdate` e reconstruir os nós no load → contrato de banco/API/Zod intacto. Sincronizar `value`→editor só quando difere do serializado (evita pulo de cursor).

## 4. Hardening (achados do code-review)

- **Guarda de foco no sync**: o `useEffect` que faz `setContent(parse(value))` deve checar `if (editor.isFocused) return` ANTES de comparar/sincronizar. Sem isso, se o `value` do RHF chegar atrasado durante digitação rápida, o effect reescreve o doc com o valor velho e apaga o que foi digitado + joga o cursor pro início. Só sincroniza valor externo (load das settings, reset pós-save) — que acontece com o editor desfocado.
- **Desabilitar `hardBreak`** (`StarterKit.configure({ hardBreak: false })`): `serialize` mapeia hardBreak→`\n`, mas `parse` só cria parágrafos → round-trip assimétrico (Shift+Enter reaparece como parágrafos no reload). Com só parágrafos, `\n` tem uma única semântica e o round-trip é simétrico.
- **Refs de callback (`onChangeRef`) atualizados em `useEffect`**, não no corpo do render (evita side-effect de render sob Strict Mode).
- **Fonte única das variáveis**: derivar `VARIABLE_REGEX` e o `find` da input rule de `TEMPLATE_VARS` (`new RegExp(...)`), senão add/renomear uma var dessincroniza paleta × regex × tokenização.
- **a11y**: o `<label htmlFor>` não foca um `<div contenteditable>` (não é labelable). Ligar `onClick` do Label ao handle `.focus()` do editor + passar `aria-labelledby` (id do label) para `editorProps.attributes`.

> Fonte: raw/sessions/2026-06-27-paonetone-ui-feedback.md
