---
title: Toast pausa no hover — falso negativo em teste automatizado
type: concept
created: 2026-07-25
updated: 2026-07-25
tags: [testing, chrome-mcp, sonner, ui, gotcha]
sources:
  - raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md
related:
  - pages/concepts/chrome-mcp-drive-and-assert-via-js.md
  - pages/concepts/drag-vs-click-decide-by-value-change.md
status: stable
---

> O sonner (como a maioria das libs de toast) **pausa os timers de auto-dismiss enquanto o
> ponteiro está sobre a pilha** e **expande a pilha** no hover. Num teste automatizado o
> ponteiro **fica onde você soltou** — se isso cair na faixa do toast, os toasts antigos
> congelam na tela e o novo aparece empilhado atrás: o screenshot mostra o toast **errado** e
> a conclusão vira "o toast não disparou".

## Como apareceu

Validando o toast "Marcado como Retroativo" em produção (fix #3 de `812289e`): arrastei o card
de 15:00 para ~09:00 e o drop terminou em `(700, 139)` — dentro da caixa do toast (top-center,
~x 594–973, y 90–215). O screenshot 2s depois mostrava **dois "Agendamento criado com sucesso"**
de minutos antes, sem sinal do toast novo. Parecia fix quebrado.

Era artefato: bastou `hover` em `(1200, 700)` e esperar 6s para os três aparecerem na ordem
certa — o toast novo no topo. O servidor, aliás, já provava que a ação tinha acontecido
(`retroactive: true`), o que é o primeiro sinal de que o problema estava na **observação**, não
no comportamento.

## Protocolo

1. **Solte fora da faixa do toast.** Num arraste vertical, use um `x` fora da largura da pilha
   (ela é centralizada e estreita) — a coluna do card costuma ser larga o suficiente.
2. **Se já soltou lá**: `hover` num ponto distante + `wait` antes do screenshot. Hover longe
   despausa **e** contrai a pilha.
3. **Melhor que pixel: asseverar no DOM.**
   ```js
   [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent)
   ```
   Determinístico, imune a empilhamento/ordem, e ainda distingue variante (`info` × sucesso)
   pelos atributos. Foi assim que os 4 caminhos do clique em evento do Google foram
   verificados de uma vez.
4. **Toast velho na tela não é prova de nada** — pode estar apenas pausado. Ao asseverar
   ausência ("não deve avisar de novo"), deixe a pilha esvaziar primeiro (mouse longe + espera)
   e só então aja e observe. Sem isso, "não repetiu" e "repetiu mas ficou escondido" são
   indistinguíveis.

## Generalização

Qualquer UI que **pausa/expande no hover** (toast, tooltip com delay, carrossel, menu com
`onMouseLeave`) transforma a **posição final do cursor** em estado escondido do teste. Depois de
um `click`/`drag`, o ponteiro **não desaparece** — ele fica exatamente onde a ação terminou. Em
teste de UI vale tratar a posição de repouso do cursor como parte do setup, não como detalhe.

## Wikilinks

- [[chrome-mcp-drive-and-assert-via-js]] — as outras técnicas de walk-through no Chrome MCP.
- [[drag-vs-click-decide-by-value-change]] — o arraste que produz esse toast.

> Fonte: raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md
