# Feature: Arraste na agenda (grade de horas do Dia + Mês entre dias)

> No modo **Dia**, a agenda deixou de ser lista de cards e virou uma **grade de
> horas estilo Google Agenda**: agendamentos e bloqueios podem ser **arrastados**
> (mover o horário) e **redimensionados** (estender a duração pela alça inferior).
> No modo **Mês**, arrastar um chip para **outra célula (outro dia)** reagenda
> **mantendo o horário original**. Semana segue como estava.
> Feature 2026-07-24 (decisão do dono; o Mês veio na mesma data, logo depois).

## O que muda em cada modo (mapa mental)

| Modo   | Eixo que o arraste altera        | Componente        |
| ------ | ------------------------------- | ----------------- |
| Dia    | **HORÁRIO** (mover) + duração (alça) | `day-grid.tsx`    |
| Mês    | **DATA** (o horário é preservado)    | `month-view.tsx`  |
| Semana | nada (lista)                    | `agenda/page.tsx` |

A célula do Mês representa um dia inteiro — não existe eixo de tempo ali, então
arrastar no Mês **só pode** mudar a data. Para mover o horário, use o Dia.

## Arquivos

| Camada        | Caminho                                                        |
| ------------- | -------------------------------------------------------------- |
| Componente    | `src/components/agenda/day-grid.tsx` (`<DayGrid>`)             |
| Componente    | `src/components/agenda/month-view.tsx` (`<MonthView>` + `moveKeepingTime`) |
| Integração    | `src/app/(dashboard)/agenda/page.tsx` (branches `viewMode === "day"` / `"month"`) |
| Testes unit   | `tests/unit/month-view-drag.test.tsx` (8 testes: helper + interação real) |
| Regressão     | `MV.1`–`MV.3` em `scripts/test-sprints.ts`                     |

## O que a grade faz

- **Faixa de horas** default 07h–21h, expandida automaticamente para caber qualquer
  item fora dela. `HOUR_PX=56`, `SNAP_MIN=15`.
- **Posiciona** agendamentos (cor por status), bloqueios (hachurado cinza, cadeado) e
  eventos do Google (azul tracejado, **só-leitura**) por horário. Eventos do Google de
  dia inteiro ficam pinados num strip acima da grade.
- **Layout de colunas para sobreposição** (`layoutColumns`): itens que se sobrepõem
  dividem a largura em colunas (nada fica um em cima do outro) — validado com
  agendamento + bloqueio no mesmo horário lado a lado.
- **Linha do "agora"** (vermelha) quando o dia é hoje.
- **Clique numa área livre** → cria agendamento naquele horário (snap 30 min) via `onCreateAt`.

## Interação de arraste/resize (Pointer Events)

- **Fonte de verdade = `dragRef`** (não o estado React): o `pointerup` precisa ler o
  preview MAIS RECENTE, não o do closure do início do arraste. Um bug dessa natureza foi
  corrigido cedo (o `onUp` lia estado obsoleto).
- **Identidade**: cada item tem `key` prefixado (`a:<id>` / `b:<id>`) para o casamento
  interno (drag/pending/layout) e `entityId` cru para os callbacks/mutação. Misturar os
  dois foi um bug pego na 1ª revisão.
- **Clique × arraste — decide pela MUDANÇA REAL do valor com snap, não pelo pixel**
  (fix code-review): no `pointerup`, `changed = mode==="move" ? previewStartMin !==
  originStartMin : previewDurationMin !== originDurationMin`. Se **não** mudou → abre a
  **edição** (tap). Se mudou → reagenda. Isso evita: (a) um toque com micro-tremor (< 1
  passo de snap) virar reagendamento; (b) um PUT no-op + escrita no Google quando o item
  não saiu do lugar. ⚠️ **Regressão a evitar**: voltar a decidir por um limiar de pixels
  (`DRAG_THRESHOLD_PX=4`) menor que o 1º passo de snap (~7,5px) reintroduz o bug no mobile.
- **`touch-action: pan-y`** nos itens: no touch, um swipe vertical **rola a página**
  (o browser assume o gesto e emite `pointercancel`); o mouse continua arrastando normal.
  Decisão: **arraste é desktop-first; no mobile a edição é pelo modal (tap)**.
- **`pointercancel`** → aborta o arraste sem editar nem reagendar (ex.: o scroll do touch).
- **Clique-fantasma pós-arraste suprimido** (`suppressClickRef`): o browser dispara um
  `click` sintético no fim do arraste (ancestral comum item+fundo = corpo da grade) que
  abriria "Novo Agendamento". O único guard `dragRef` já é nulo nesse momento, então há uma
  flag dedicada setada no `pointerup` (quando mudou) e limpada por timeout de 50 ms; o
  `handleBackgroundClick` a consome.
- **Anti-flicker (`pending`)**: ao soltar, a posição nova é mantida em `pending` até o
  refetch trazer o valor real (evita o item "pular" de volta). ⚠️ O efeito que limpa o
  `pending` depende das **referências** dos arrays `appointments`/`blocks` — por isso o
  **pai memoiza** esses arrays (`dayGridAppointments`/`dayGridBlocks`/`dayGridGoogleEvents`
  em `agenda/page.tsx`); sem isso, `.map()` inline recriava as arrays a cada render e o
  `pending` era limpo prematuramente (o card voltava ao lugar antigo durante a mutação).

## Arraste entre dias no modo Mês (`month-view.tsx`)

- **Regra**: `moveKeepingTime(dateTimeIso, targetDay)` (exportada e testada) monta a
  nova data pelos **componentes locais** (ano/mês/dia do destino + hora/minuto de
  origem). **Nunca** somar 24h/`addDays` no timestamp — qualquer mudança de offset
  (horário de verão) deslocaria o horário. Duração também é preservada.
- **Hit-test**: cada célula carrega `data-month-day="yyyy-MM-dd"`; o dia sob o ponteiro
  vem de `document.elementFromPoint(x,y).closest("[data-month-day]")`. Isso é o
  equivalente, no Mês, do cálculo de pixels→minutos do Dia.
- **Clique × arraste**: decide pela **troca real de DIA** (`overDay !== fromDay`), não
  por limiar de pixels — mesma lição do Dia (um toque com tremor não pode reagendar).
  Soltar na própria célula = **tap** → abre a edição.
- **Preview vivo**: durante o arraste o chip **pula para a célula sob o cursor** (a
  célula-alvo ganha `ring-primary`) e, ao soltar, fica lá via `pending` até o refetch.
- **Só chips (≥ sm)**: no mobile a célula mostra pontos, sem identidade por item — não há
  arraste. `touch-action: pan-y` + `pointercancel` garantem que o scroll do touch vence.
- **Teclado não regride**: o chip continua um `<button>`; Enter/Espaço gera `click` com
  `detail === 0`, e é ESSE caso que abre a edição no `onClick` (cliques de ponteiro são
  resolvidos no `pointerup`). Não existe arraste por teclado — a data também é editável
  pelo diálogo.
- **Aviso de bloqueio vale no Mês**: o Mês reusa o mesmo `rescheduleAppointment` do pai,
  então cair em cima de um `TimeBlock` abre o modal "Horário bloqueado" (ver
  `time-blocks.md`) — validado E2E.
- Bloqueios ainda **não são renderizados** no Mês (débito #1 de `time-blocks.md`): o
  aviso aparece, mas o usuário não vê o bloco na grade mensal.

## Card BAIXO vira 1 linha (2026-07-24)

Um card de 30 min tem 28px (`HOUR_PX=56`) — cabe **uma** linha de texto. O layout
original punha horário+status na 1ª e o **nome do paciente na 2ª**, que era cortada: o
card lia "10:00 · Pendente", sem dizer de QUEM era. Virou crítico quando sobrepor passou
a ser permitido (3 colunas lado a lado = card estreito e baixo). Agora
`compact = height < COMPACT_CARD_PX (40)` move o nome para a MESMA linha do horário
(`10:00 Ana Costa` + selo de status à direita, tudo com `truncate`/`min-w-0`).

## Clique num evento do Google (nas duas grades)

Antes, um evento do Google era **inerte** nas grades: no Dia era um `<div>` mudo (clique =
nada) e no Mês o chip só drilava para o Dia — onde também não acontecia nada. Feedback do
dono (2026-07-24): "clico neles e nada acontece". Agora:

- As duas grades apenas **reportam o id** (`onSelectGoogleEvent`) — elas **não** conhecem a
  regra de promoção nem o `htmlLink`. Quem decide é `agenda/page.tsx`
  (`handleGoogleEventClick`), então a política vive num lugar só.
- **Promovível → abre o diálogo "Promover evento a agendamento"** (Fase B, pré-preenchido
  com data/hora/duração e os sinais do evento).
- **Não promovível → abre o evento no Google** (`window.open(htmlLink, "_blank",
  "noopener,noreferrer")`). Regra em `canPromoteGoogleEvent`: **dia inteiro não promove**
  (a duração encaixaria em no máx. 8h → mentira silenciosa) e **"Ocupado" não promove**
  (placeholder de evento particular, nada para pré-preencher).
- O evento continua **não arrastável** (firewall: só `Appointment`/`TimeBlock` se movem) e
  visualmente distinto (tracejado azul); ganhou só `hover` e virou `<button>` (teclado).
- ⚠️ **Divergência proposital com a Semana**: na lista, o corpo do evento é um link que
  **abre no Google** e existe um botão **"Promover"** ao lado. Nas grades não cabe um botão,
  então o clique faz a ação do app (promover) e cai no Google quando não há o que promover.
  A regra de "pode promover?" é a **mesma função** nas três visões.

## ⚠️ Armadilha: `pending` (anti-flicker) precisa de sinal EXPLÍCITO para sair

O React Query faz **structural sharing**: quando o refetch traz dados **deeply equal**,
ele devolve a **MESMA referência**. Logo, o efeito "limpa `pending` quando as props
mudam de referência" **nunca dispara** nos caminhos em que nada muda no servidor —
usuário clicou **"Voltar"** no aviso de bloqueio, ou a mutação **falhou**. Resultado do
bug (pego no teste E2E do Mês, 2026-07-24): o card ficava **preso na posição arrastada**
mesmo sem nada ter sido salvo.

Contrato atual (vale para as DUAS grades):

- `rescheduleAppointment`/`rescheduleBlock` (em `agenda/page.tsx`) devolvem uma promise
  que resolve **só quando a tentativa terminou de verdade** — mutação + `invalidateQueries`
  (o refetch é aguardado), ou desistência no modal (`onDismiss` → invalida → resolve).
  Erro é engolido com `.catch(() => {})` (o toast já é da mutação) para a promise
  **nunca rejeitar**.
- As grades fazem `Promise.resolve(onReschedule(...)).finally(...)` e **removem a chave**
  do `pending`. No sucesso os dados já chegaram (limpar é invisível); no cancelamento/erro
  o item volta ao lugar.
- O efeito por referência continua como caminho rápido — os dois se complementam.

## Callbacks (fornecidos pelo `agenda/page.tsx`)

- `onEditAppointment(id)` / `onEditBlock(id)` → abrem os diálogos existentes.
- `onCreateAt(start)` → novo agendamento pré-preenchido no horário clicado.
- `onReschedule(id, start, dur)` → `rescheduleAppointment` (PUT; **avisa se cair em
  bloqueio** — ver `time-blocks.md`; `.catch` invalida `["appointments"]`).
- `onRescheduleBlock(id, start, dur)` → `rescheduleBlock` (PUT do TimeBlock).

## Validação

**Modo Dia** — ver § "Validação manual no browser" em [`time-blocks.md`](time-blocks.md)
(2026-07-24, Chrome MCP): arrastar mover/estender agendamento e bloqueio, tap→editar,
clique→criar, colunas de sobreposição, sem diálogo espúrio.

**Modo Mês** (2026-07-24, Chrome MCP, dev :3001, conta PREMIUM — walk-through completo):

1. Arrastar "15:00 Ana Costa" de 07/07 → 08/07: toast, chip reposicionado **às 15:00**,
   ordenado depois do "11:00 Maria Santos"; **sem** diálogo espúrio. Persistido: DB passou a
   `2026-07-08T18:00:00Z`, 30 min (hora + duração preservadas). Confirmado após **reload**.
2. Bloqueio "Almoço" 09/07 15:00–16:00 → arrastar o mesmo chip 08 → 09: modal **"Horário
   bloqueado"** (o aviso funciona no Mês). **"Voltar"** → o chip **volta para o dia 8** e nada
   é mutado (foi aqui que o bug do `pending` apareceu — ver armadilha acima).
   **"Agendar mesmo assim"** → move para o 9 às 15:00 (opacidade normal, `pending` liberado).
3. **Tap** num chip → diálogo "Editar agendamento" pré-preenchido (Ana Costa, 09/07/2026,
   15:00, 30 min, status, observações).
4. Clique na **área livre** de uma célula → drill-down para a visão Dia daquele dia.
5. Regressão do fix no **Dia**: arrastar 15:00→15:30 em cima do bloqueio → modal → "Voltar" →
   o card **volta para 15:00**.
6. Dados de teste **revertidos** ao fim (agendamento de volta em 07/07 15:00 via API — para o
   espelho do Google acompanhar — e bloqueio excluído).

**Regras novas de agenda** (2026-07-24, Chrome MCP, mesma sessão — ver
`appointments.md` § Retroativo):

- Clique na **área livre da célula do Mês** (dia 13, no passado) → abriu **"Novo
  Agendamento"** com `Data 13/07/2026` (não drilou para o Dia). Ao escolher 10:00 apareceu
  o aviso *"vai entrar como **Retroativo**…"*; "Criar" → **sucesso** (antes era 400).
  Chip no Mês com ícone ⟲, card do Dia `10:00 ⟲ Ana Costa`, selo **"⟲ Retroativo"** na
  Semana. `GET /api/appointments` devolveu `retroactive: true`.
- **Sobreposição**: 3 agendamentos às 10:00 do dia 27/07 (Ana, Pedro, Maria) criados **sem
  nenhum erro de conflito** e renderizados **lado a lado em 3 colunas** no Dia, com o nome
  de cada um visível (fix do card compacto acima).
- **Número do dia** no Mês continua abrindo a visão Dia; o mini-calendário também.
- ⚠️ O **firewall do retroativo** (cron não marca NO_SHOW / não manda WhatsApp) foi
  validado por `RT.1`/`RT.2` (filtro real contra o DB + invariante no fonte), **não**
  rodando o cron de verdade — `runSchedulerJobs()` dispararia também notificações de
  billing (e-mail real). Todos os dados de teste foram apagados no fim.

**Clique em evento do Google** (2026-07-24, Chrome MCP, mesma sessão):

7. Grade **Dia** (09/07) → clique em "17:30 Clinica Organizada - Malu Tester" → diálogo
   **"Promover evento a agendamento"** pré-preenchido (09/07/2026, 17:30, 1 hora, aviso "este
   horário já passou"). Mesmo clique no chip do **Mês** → mesmo diálogo.
8. Caminho **não promovível**: a agenda real não tinha evento de dia inteiro nem "Ocupado",
   então injetei os dois **no cliente** (patch de `fetch`, sem tocar na agenda real do dono) e
   stubei `window.open` → clique nos dois chamou
   `window.open("<htmlLink>", "_blank", "noopener,noreferrer")` e **nenhum diálogo** abriu.

⚠️ **Chrome MCP não redimensiona a viewport** → o comportamento de touch (`pan-y`/scroll) e o
mobile real **não foram testados** — confirmar no device. No Mês isso é menos crítico: abaixo
de `sm` não há chips, logo não há arraste.

Gate: tsc · vitest **395** · build · test:sprints **161/161** (MV.1–MV.4).

## Como estender

- **Grade também na Semana**: generalizar `DayGrid` para N colunas (dias) — bem mais esforço;
  o dono optou por Dia só. Arrastar entre dias numa grade semanal no celular é frágil.
- **Snap configurável / faixa de horas por settings**: hoje `SNAP_MIN`/`DEFAULT_START/END_HOUR`
  são constantes do componente.
- **Bloqueios no Mês**: passar `blocksByDay` ao `MonthView` (chip/ponto cinza) — hoje o aviso
  de sobreposição funciona no Mês, mas o bloco não é visível ali.
- **Arrastar no Mês mudando o horário**: exigiria um popover "que horas?" no drop — o dono
  escolheu explicitamente **manter o horário** (previsível, 1 gesto).
