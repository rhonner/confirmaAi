---
title: Dirigir e asseverar a app via JS no Chrome MCP
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [chrome-mcp, testing, react-hook-form, fetch, gotcha]
sources:
  - raw/sessions/2026-07-10-2200-agenda-month-view.md
related:
  - pages/entities/radix-popover-and-dialog.md
  - pages/concepts/rhf-radix-gotcha.md
status: stable
---

> Técnicas para os walk-throughs no Chrome MCP quando clicar/digitar "de verdade" é flaky ou não prova o suficiente. Complementa o clique via `computer` — não substitui (o teste visual continua sendo a regra de "feito").

## 1. Setar input nativo/RHF que o React realmente enxerga

`<select>` nativo do macOS **não muda de forma confiável via setas** pela extensão: o popup do OS não renderiza no screenshot e engole as teclas. E setar `element.value` cru **não** dispara o `onChange` do React/RHF.

Use o **setter nativo do prototype + evento que borbulha** — o React escuta `change` no root e o RHF (via `register`) tem o handler no elemento:

```js
const el = document.getElementById('status');
const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
setter.call(el, 'CONFIRMED');
el.dispatchEvent(new Event('change', { bubbles: true }));
```

Para `<input>` (ex.: `type="time"`, `type="date"`) o mesmo padrão com `HTMLInputElement.prototype` e disparando **`input` e `change`**. (O setter do prototype fura o value-tracker do React; só `.value =` seria ignorado.)

## 2. Interceptar `window.fetch` para asseverar payload

O `read_network_requests` do MCP dá URL/método/status mas **não o corpo**. Para provar o que a UI manda, monkey-patch antes de disparar a ação:

```js
window.__put = [];
const orig = window.fetch;
window.fetch = function (url, opts) {
  if (opts?.method === 'PUT' && String(url).includes('/api/appointments/'))
    window.__put.push(JSON.parse(opts.body));
  return orig.apply(this, arguments);
};
// ...aja na UI, depois: window.__put[at(-1)]  → { hasStatus: 'status' in body }
```

Foi assim que se provou o fix de [[edit-form-clobbers-concurrent-field]]: editar sem mexer no status → PUT **sem** `status`; mudar o status → PUT **com** `status`.

## 3. Injetar latência para observar estados de loading

Um fetch de localhost resolve rápido demais para capturar um overlay de "Carregando…". Envolva a promise num `setTimeout` para segurar a resolução:

```js
const orig = window.fetch;
window.fetch = (url, opts) => {
  const p = orig(url, opts);
  const slow = String(url).includes('/api/appointments?') && (!opts || opts.method === 'GET' || !opts.method);
  return slow ? new Promise((r) => setTimeout(() => r(p), 15000)) : p;
};
```

Depois navegue para um estado **não-cacheado** (React Query só fica `isLoading` sem dado em cache — num mês já visitado ele mostra o cache e `isLoading=false`). Recarregue a página ao terminar para limpar os patches.

## 4. O 1º clique após fechar um Dialog do Radix é engolido

Ao fechar um `Dialog`/`AlertDialog`, o teardown de pointer-events do Radix **absorve o clique seguinte**. Em roteiro de teste, espere clicar 2× (ou intercalar um screenshot/espera). Detalhe em [[radix-popover-and-dialog]].

## Higiene

- **Reverta o estado** ao fim (status/notes que você mudou; dados criados). Um PUT direto (`fetch('/api/...', {method:'PUT', body})`) é o jeito rápido de restaurar — mas ele **não invalida o cache do React Query**, então a UI pode mostrar o valor antigo até o reload (o banco está certo).
- Recarregar a aba limpa qualquer monkey-patch de `fetch` (vive no contexto da página).

## Wikilinks

- [[radix-popover-and-dialog]] · [[rhf-radix-gotcha]] · [[edit-form-clobbers-concurrent-field]]

> Fonte: raw/sessions/2026-07-10-2200-agenda-month-view.md
