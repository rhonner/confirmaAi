---
title: Structural sharing do React Query derrota "limpar estado otimista quando as props mudam"
type: concept
created: 2026-07-24
updated: 2026-07-24
tags: [react-query, optimistic-ui, drag-and-drop, gotcha, frontend]
sources:
  - raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
  - .context/features/agenda-day-grid.md
related:
  - pages/concepts/stale-async-response-guard.md
  - pages/concepts/drag-vs-click-decide-by-value-change.md
  - pages/concepts/chrome-mcp-drive-and-assert-via-js.md
status: stable
---

# Structural sharing derrota o diff por referência

> O TanStack Query faz **structural sharing**: se o refetch traz dados *deeply equal*, ele devolve a **MESMA referência**. Qualquer efeito do tipo "limpe o estado otimista quando as props mudarem" **nunca dispara** justamente nos caminhos em que o servidor não mudou nada — que são os caminhos de **cancelamento e de erro**.

## Contexto

Grade de agenda com arraste (`day-grid.tsx`, `month-view.tsx`). Ao soltar um card, a posição nova é mantida num estado local `pending` para o item não "pular de volta" enquanto a mutação viaja (anti-flicker). A limpeza do `pending` era feita por um efeito que observava a **referência** dos arrays `appointments`/`blocks`: chegou dado novo → limpa.

Funciona no caminho feliz. Mas em 2026-07-24, no E2E do modo Mês, o card ficou **preso na posição arrastada** em dois cenários:

- o usuário arrastou para cima de um bloqueio e clicou **"Voltar"** no aviso → nada foi mutado;
- a mutação **falhou** → o servidor continua com o valor antigo.

Nos dois casos o refetch devolve exatamente os mesmos dados. O structural sharing preserva as referências. O efeito não roda. O `pending` nunca sai.

## Por que é traiçoeiro

- **Falha só no caminho infeliz.** O golden path (o dado realmente muda) limpa normal — o bug passa por todo teste de "arrastar e soltar funciona".
- **Parece bug de estado, é bug de premissa.** A premissa "props novas ⇒ referência nova" é falsa por design: structural sharing existe justamente para evitar re-render quando nada mudou.
- **Memoizar o pai é necessário mas não suficiente.** No mesmo componente havia o defeito *simétrico*: `.map()` inline no pai recriava as arrays a todo render, e aí o `pending` era limpo **cedo demais** (o card voltava ao lugar antigo durante a mutação). Consertar isso — memoizando os arrays — deixa o outro bug ainda mais provável, porque agora as referências realmente se estabilizam.

## A regra

**Estado otimista precisa de um sinal EXPLÍCITO de fim de tentativa — não de um diff de dados.** "A tentativa terminou" e "os dados mudaram" são eventos diferentes; só o primeiro delimita a vida do estado otimista.

Contrato adotado:

- O handler de reagendamento devolve uma **promise que resolve quando a tentativa termina de verdade**: mutação + `invalidateQueries` (refetch aguardado), **ou** desistência no modal (`onDismiss` → invalida → resolve). O erro é engolido com `.catch(() => {})` — o toast já é da mutação — para a promise **nunca rejeitar**.
- Quem tem o estado otimista faz `Promise.resolve(onReschedule(...)).finally(() => limpaChave(pending))`. No sucesso os dados já chegaram e limpar é invisível; no cancelamento/erro o item volta ao lugar.
- O efeito por referência **continua** como caminho rápido. Os dois se complementam; o `.finally` é a garantia.

## Quando aplicar / quando NÃO

- **Aplique** em qualquer UI otimista sobre React Query cujo estado local precise sobreviver *até a confirmação*: drag-and-drop, reordenação, toggles otimistas, edição inline.
- **Cuidado com o oposto**: se o dado realmente muda a cada refetch (timestamps, contadores), o diff por referência dispara sempre e mascara o problema — até o dia em que não dispara.
- **NÃO** desligue structural sharing para "consertar" isso. Ele é otimização legítima; o defeito está em usar identidade de dados como sinal de ciclo de vida.

## Cross-refs

- `.context/features/agenda-day-grid.md` § "Armadilha: `pending` precisa de sinal EXPLÍCITO" — contrato operacional, nomes de função e a validação E2E.
- [[stale-async-response-guard]] — outra família de bug em que a resposta assíncrona chega fora de ordem/contexto.

## Fontes

- raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
