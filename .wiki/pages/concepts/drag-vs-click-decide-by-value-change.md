---
title: Clique × arraste — decidir pela mudança real do valor, não por limiar de pixels
type: concept
created: 2026-07-24
updated: 2026-07-24
tags: [pointer-events, drag-and-drop, mobile, ux, gotcha, frontend]
sources:
  - raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
  - raw/sessions/2026-07-24-2050-agenda-retroactive-and-month-click.md
  - .context/features/agenda-day-grid.md
related:
  - pages/concepts/react-query-structural-sharing-defeats-prop-diff.md
  - pages/concepts/rhf-radix-gotcha.md
status: stable
---

# Arraste ou toque? Pergunte ao valor, não ao pixel

> Num componente onde o mesmo gesto pode ser **tap** (abrir edição) ou **arraste** (mover), a decisão no `pointerup` deve ser: *o valor com snap mudou?* — não *o ponteiro andou mais que N pixels?*. Limiar de pixels menor que o passo de snap produz reagendamentos-fantasma no toque e mutações no-op.

## Contexto

Grade de agenda com `SNAP_MIN = 15` e `HOUR_PX = 56` → o primeiro passo de snap são **~7,5 px**. A implementação inicial usava `DRAG_THRESHOLD_PX = 4`. Um toque de dedo com micro-tremor de 5 px passava do limiar (vira "arraste") mas não chegava a um passo de snap (o valor não muda) → o app disparava um **PUT no-op** e, via mirror, uma **escrita no Google Calendar**, para um item que não saiu do lugar. Achado de code-review adversarial (2026-07-24).

## A regra

No `pointerup`, compare o **valor previsto** com o de origem:

```ts
const changed = mode === "move"
  ? previewStartMin !== originStartMin
  : previewDurationMin !== originDurationMin;
// não mudou → tap: abre a edição.  mudou → reagenda.
```

No modo Mês, onde o eixo é a data, o mesmo critério vira `overDay !== fromDay` — soltar na própria célula é tap.

**A ideia geral:** o limiar já existe e é o **snap**. Introduzir um segundo limiar (pixels) cria uma faixa morta entre os dois onde o gesto é classificado como arraste mas não produz efeito — e é essa faixa que gera o bug.

⚠️ **Regressão a evitar:** voltar a decidir por `DRAG_THRESHOLD_PX` menor que o primeiro passo de snap reintroduz o defeito. Se um limiar de pixels for mesmo necessário (para não iniciar o *preview* cedo demais), ele governa só o **início visual** do arraste — nunca a decisão final no `pointerup`.

## O resto do kit de Pointer Events

Três detalhes que andam junto e não são óbvios:

- **`touch-action: pan-y`** nos itens arrastáveis: no touch, um swipe vertical devolve o gesto ao browser (rola a página) e emite `pointercancel`; o mouse segue arrastando normal. É o que torna a decisão "arraste é desktop-first, no mobile edita-se pelo modal" implementável sem `preventDefault` manual.
- **`pointercancel` aborta** — sem editar e sem reagendar. Sem esse handler, o scroll do touch termina virando um tap ou um reagendamento.
- **Clique-fantasma pós-arraste**: o browser emite um `click` sintético no ancestral comum (o corpo da grade) ao fim do arraste, que abriria "Novo Agendamento". O guard `dragRef` já é nulo nesse momento — é preciso uma **flag dedicada** setada no `pointerup` e limpa por timeout curto (~50 ms), consumida pelo handler de clique no fundo.
- **Teclado não regride**: o chip continua `<button>`; Enter/Espaço geram `click` com `detail === 0`, e é esse caso que abre a edição (cliques de ponteiro são resolvidos no `pointerup`, não no `onClick`).

## O custo do clique-fantasma depende do que o clique faz (2026-07-24)

O guard anti-clique-fantasma nasceu quando o clique no fundo abria "Novo Agendamento" no
**Dia**. Na mesma semana o mapa de cliques mudou: por decisão do dono, a **área livre da
célula do Mês** deixou de drilar para a visão Dia e passou a **abrir o diálogo de
agendamento**. O mesmo falso positivo que antes era inofensivo (drilar) agora abre um
formulário de criação por cima do arraste que o usuário acabou de fazer.

- **Reavalie os guards quando o significado de um clique muda** — a criticidade deles é
  função do efeito, não do gesto. O que era "ruído tolerável" pode virar "ação indesejada".
- **Mudar o significado de um clique exige realocar o antigo**: quem abre a visão Dia agora
  é o **número do dia** (e o "+N mais"). Trocar o destino sem dar outra porta ao destino
  antigo é remover uma função, não movê-la.
- No teste, isso vira uma asserção mais forte: depois de um arraste, o clique sintético não
  pode chamar `onCreateOnDay` (antes: `onSelectDay`).

## Quando NÃO se aplica

- Arraste **contínuo** sem snap (desenho livre, sliders de precisão): aí não existe "valor discreto que mudou" e um limiar de pixels é legítimo.
- Listas de reordenação com drop-zones explícitas: a própria zona de destino é o sinal.

## Cross-refs

- `.context/features/agenda-day-grid.md` § "Interação de arraste/resize" — constantes, nomes de ref e a matriz de validação E2E.
- [[react-query-structural-sharing-defeats-prop-diff]] — o outro bug da mesma grade: o estado otimista que não sabia terminar.

## Fontes

- raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
