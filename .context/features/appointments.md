# Feature: Agendamentos

> CRUD de agendamentos com status workflow e visualização diária/semanal/mensal.
> ⚠️ **Sobreposição de horário é PERMITIDA** desde 2026-07-24 (decisão do dono) — o antigo bloqueio por conflito foi removido.

## Arquivos que compõem a feature

| Camada              | Caminho                                                |
| ------------------- | ------------------------------------------------------ |
| Rota lista/criar    | `src/app/api/appointments/route.ts`                    |
| Rota item           | `src/app/api/appointments/[id]/route.ts`               |
| Rota export         | `src/app/api/appointments/export/route.ts`             |
| Validação Zod       | `src/lib/validations/appointment.ts`                   |
| ~~Service conflito~~ | ~~`src/lib/services/conflict.ts`~~ — **arquivo deletado em 2026-07-24** (sobreposição permitida) |
| Hook React Query    | `src/hooks/use-api.ts` → `useAppointments`, `useCreateAppointment`, `useUpdateAppointment`, `useDeleteAppointment` |
| Página              | `src/app/(dashboard)/agenda/page.tsx`                  |
| Mini-calendário     | `src/components/agenda/month-calendar.tsx`             |
| Visão do mês        | `src/components/agenda/month-view.tsx`                 |
| Seletor de horário  | `src/components/forms/time-select.tsx`                 |
| Tipo                | `AppointmentResponse` em `src/lib/types/api.ts`        |
| Modelo Prisma       | `Appointment` em `prisma/schema.prisma`                |

## Regras de negócio

- **Status (enum `AppointmentStatus`)**: `PENDING` → `CONFIRMED` | `NOT_CONFIRMED` | `CANCELED` | `NO_SHOW`.
- **Default**: `PENDING`. Default `durationMinutes`: `30`.
- **Range de duração**: 5–480 minutos.
- **⚠️ AGENDAR NO PASSADO É PERMITIDO (2026-07-24, decisão do dono)** — vira um registro **Retroativo** (ver seção própria abaixo). O antigo `400 "Não é possível agendar no passado"` foi removido do `POST /api/appointments` e do `/convert` do Google.
- **⚠️ SOBREPOSIÇÃO É PERMITIDA (2026-07-24, decisão do dono)**: dois agendamentos no mesmo horário são um caso real (atendimento simultâneo, sala dupla) e a grade do Dia já os desenha lado a lado, como o Google Agenda. O guard `findConflictingAppointment` e o `400 "Conflito com agendamento de <nome>"` **foram removidos** do `POST /api/appointments`, do `PUT /api/appointments/[id]` e do `/convert` do Google Calendar; `src/lib/services/conflict.ts` foi **deletado**. Não existe mais checagem de conflito agendamento×agendamento em lugar nenhum.
  - **Consequência positiva**: a corrida de duplo-agendamento entre dois `/convert` simultâneos deixou de ser um risco — agendamentos sobrepostos são resultado **válido** agora (ver [[idempotent-link-under-race]] na wiki).
  - **O que NÃO mudou**: o aviso de **horário bloqueado** (`TimeBlock`) continua existindo e é **suave** — modal "Horário bloqueado" com "Agendar mesmo assim". É outro mecanismo, em `time-blocks.md`.
  - ⚠️ **Ao reintroduzir qualquer checagem de sobreposição**, lembre que a UI (grade do Dia com colunas lado a lado, arraste) foi desenhada assumindo que sobrepor é legítimo.
- **`patientId`** ao criar/editar é validado: deve pertencer ao mesmo usuário.
- **`notes`**: máx 2000 chars, opcional. **UI (2026-06-27, feedback da sócia)**: o `<Textarea>` de Observações em `agenda/page.tsx` agora tem `maxLength={2000}` (impede digitar/colar além do limite já de cara, antes só validava no submit), `className="max-h-40 resize-none overflow-y-auto"` (texto grande **rola dentro** do campo em vez de estourar o Dialog — bug do `field-sizing-content` sem `max-h`), contador `X/2000` (vermelho ao atingir o limite) e exibição de `errors.notes`. O schema local do form também ganhou `.max(2000)`. O `DialogContent` da agenda ganhou `max-h-[85vh] overflow-y-auto` (defesa em profundidade). Validado no Chrome MCP: colar ~2500 chars → campo rola internamente, contador 2519/2000 em vermelho, Dialog intacto.
- **`onDelete: Cascade`**: ao deletar um Appointment, seus `MessageLog`s são removidos.
- **Mini-calendário (date picker) + dias com agendamento (2026-07-04)**: o rótulo de data (ex: "28 jun - 04 jul 2026" / "sábado, 04 de julho") virou um **`PopoverTrigger`** que abre um **`MonthCalendar`** (`src/components/agenda/month-calendar.tsx`, autossuficiente — só `date-fns` + Tailwind, sem `react-day-picker`). Selecionar um dia seta `anchorDate` (funciona nos dois modos: Dia = aquele dia; Semana = a semana que contém o dia) e fecha o popover. O grid é **sempre 6 semanas fixas (42 células)** — `eachDayOfInterval(startOfWeek(startOfMonth(month)), +41 dias)` — p/ a **altura do popover não pular** ao paginar entre meses (fev = 4 linhas naturais, ago = 6). Os dias com ao menos um agendamento recebem um **ponto** (teal). A fonte dos pontos é uma query `useAppointments` extra que busca **a grade visível inteira** (`calendarGridStart`..`calendarGridStart+41`, cobrindo os dias "vazando" dos meses vizinhos, não só `startOfMonth..endOfMonth`) e só roda quando o popover está aberto (`useAppointments(range, { enabled: calendarOpen })` — o hook ganhou o 2º parâmetro `options.enabled`). ⚠️ **Regressão a evitar**: buscar só o mês (não a grade) faz os dias de meses vizinhos (clicáveis) nunca ganharem ponto → falso "dia livre". Validado no Chrome MCP (pontos em 9/15/16/22 jul + no dia "1" ago que vaza na grade de julho; navegação de mês re-busca; dark mode). Achados de code-review xhigh 2026-07-04 endereçados.
- **Jitter horizontal do layout (2026-07-04)**: `src/app/(dashboard)/layout.tsx` — o `<main>` (scroller `overflow-y-auto`) ganhou `[scrollbar-gutter:stable]`. Antes, alternar entre uma página que rola (dia com agendamentos) e uma que não rola (dia/semana vazios) fazia a barra de rolagem aparecer/sumir e o conteúdo "pulava" ~15px na horizontal. `scrollbar-gutter: stable` reserva o espaço da barra sempre. Em macOS com overlay scrollbars a barra tem largura 0 (bug não reproduz), mas o fix garante estabilidade em sistemas com barra clássica (onde a sócia viu). Ver [[scrollbar-gutter-stable]] na wiki.
- **Visualização Mês (2026-07-10)**: o toggle virou **Dia ⇄ Semana ⇄ Mês** (`viewMode: "day" | "week" | "month"`). No modo **Mês**, `agenda/page.tsx` renderiza `<MonthView>` (`src/components/agenda/month-view.tsx`) — grade fixa de 6 semanas (estilo Google Agenda), reaproveitando `getMonthGridRange(anchorDate)` do `month-calendar.tsx` como **fonte única** do intervalo (a busca `useAppointments` usa o MESMO range da grade, cobrindo os dias que "vazam" dos meses vizinhos — senão cantos da grade ficariam falsamente vazios). Navegação `Anterior/Próximo` anda de **mês em mês** (`addMonths`); label vira "julho de 2026". Cada célula lista os agendamentos como **chips** (cor por status via `getStatusColor`/`getStatusLabel`, passados como props — reuso, sem duplicar o mapa) e os eventos do Google (overlay azul tracejado, mesmo `googleEventsByDay`); cap de **3 chips** + "+N mais". Interações: **clicar num chip de agendamento → editar** (`stopPropagation`, não drila); **clicar na área livre / número do dia → drill para a visão Dia** daquele dia (`handleDrillToDay`); **botão "+" (hover, desktop) → novo agendamento com a data pré-preenchida** (`handleCreateOnDay`). No **mobile** (`< sm`) os chips viram **pontos coloridos** (`sm:hidden` ↔ `hidden sm:flex`; cor sólida via `statusDotClass`, azul p/ Google), cap de 4 + "+N", pois 7 colunas não cabem chips num celular. ⚠️ **Regressão a evitar**: buscar só `startOfMonth..endOfMonth` (não a grade de 6 semanas) deixa os dias vazando sem agendamentos. Validado no Chrome MCP (grid Jul/Ago, chips por status + evento Google, chip→editar, área/número→Dia, "+"→criar com data, navegação de mês, Hoje, dark mode; contagem/cores dos pontos conferidas via DOM). **Correções de code-review (2026-07-10):** (1) o cap de 3 chips ordena **agendamentos primeiro** (por horário), depois eventos do Google (dia inteiro, depois com horário) — senão eventos "dia inteiro" do Google consumiam o cap e escondiam os agendamentos (itens acionáveis) no "+N mais"; a divergência proposital do interleave por horário do Dia/Semana é por causa da célula compacta. (2) A visão Mês recebe `loading={isLoading}` e mostra um **overlay "Carregando…"** durante a busca — antes renderizava o grid **vazio** enquanto buscava (parecia "nada agendado"), pois o branch do Mês não passava pelo `isLoading` do Dia/Semana. (3) `itemsForDay` virou `timelinesByDay` (memo por `[days, appointmentsByDay, googleEventsByDay]`) — era recalculado 42×/render. Validado no Chrome MCP (ordenação conferida via DOM no dia 11; overlay capturado navegando p/ mês não-cacheado com `fetch` atrasado).
- **Ações unificadas nas 3 visões (2026-07-10, feedback do dono)**: antes o modelo de ações era **inconsistente** — Dia/Semana tinham um menu "⋮" (`DropdownMenu`) que só trocava status (excluir ficava escondido dentro da janela de edição), e a visão Mês não tinha "⋮" nenhum (dava pra excluir via chip→janela, mas **não dava pra mudar status**). Corrigido para que **as 3 visões façam exatamente o mesmo**: o menu "⋮" por-card foi **removido** (com ele, `handleStatusChange`, os imports de `DropdownMenu*` e `MoreVertical`), e a **janela de edição virou o único lugar de ação** — ela ganhou um `<select>` **Status** (só aparece ao **editar**; novo/promoção nasce PENDING) + o botão **Excluir** que já existia. O card de Dia/Semana agora mostra só o `Badge` de status (display) e o clique no card inteiro abre a janela. O `<select>` de status usa `dialogStatusOptions` (memo): são as 4 opções de `statusOptions`, mas se o status atual do agendamento não estiver na lista (ex.: `NOT_CONFIRMED`, que a UI não produz), ele é **prependado** — assim "Atualizar" nunca troca o status silenciosamente por um default. No submit de edição, `status` só entra no payload do PUT **se mudou** (`data.status !== selectedAppointment.status`) — ⚠️ **regressão de perda de dados pega no code-review**: enviar sempre o valor capturado ao abrir a janela sobrescreveria uma mudança feita pelo servidor no meio-tempo (paciente confirma no WhatsApp / cron de no-show roda), revertendo o status ao salvar uma simples edição de observações/horário. A rota `[id]` já trata `status` no `updateData` explícito, sem efeitos de lifecycle. **Validado no Chrome MCP** (interceptando o `fetch`: editar sem mexer no status → PUT **sem** `status`; mudar o status → PUT **com** `status`). (Mês: status Faltou→Confirmado persiste — toast + cor do chip + reabrir confirma valor salvo — e revertido; Dia/Semana/Mês sem "⋮"; card/chip→janela com Status+Excluir; Excluir→diálogo de confirmação; "Novo Agendamento" sem seletor de status; sem erros no console).
- **Correções mobile (2026-07-18, feedback do dono — S24+)**: dois bugs de overflow horizontal na agenda no mobile, com a MESMA raiz (a página ganhava alguns px de largura extra → no touch a página ficava "pannable" → cards com o `Badge` de status **cortado na direita** + **balanço/"tilt"** ao rolar na vertical). Diagnosticado medindo a geometria real no browser (a janela do MCP não redimensiona; simulei a largura do device e a padding mobile via JS). Fixes: (1) **`overflow-x-hidden` no `<main>`** (`layout.tsx`) — clipa qualquer estouro horizontal residual, matando o "tilt" de vez; seguro porque Radix (dialog/popover/dropdown) usa portal no body e tabelas têm o próprio `overflow-x-auto` (ver `ui/table.tsx`). (2) **`min-w-0`** na coluna `flex` do conteúdo (`layout.tsx`) — permite a coluna encolher até a viewport. (3) **`px-4 sm:px-6`** no `CardHeader`+`CardContent` dos cards de dia/semana (`agenda/page.tsx`) — reduz a padding no mobile; com isso o `Badge` fica dentro do card e o nome do paciente trunca (verificado: cabe até **320px** de viewport; antes o `px-6` fazia o badge estourar em telas < ~370px, o que pega o S24+ com "Display size" ampliado). (4) `flex-wrap` no grupo de botões do header (rede de segurança; no mobile o "Exportar CSV" já vira "CSV"). ⚠️ **Regressão a evitar**: o `overflow-x-hidden` do `<main>` só é seguro porque nada depende de scroll horizontal nele — qualquer conteúdo largo novo (tabela etc.) precisa do próprio wrapper `overflow-x-auto`, senão será clipado.
- **Seletor de horário custom (2026-07-18, feedback do dono — S24+)**: o campo Horário deixou de ser `<input type="time">` (que no Android abre o **relógio Material nativo** — overlay enorme que cobre o diálogo e destoa do design; relato "bug visual") e virou **`<TimeSelect>`** (`src/components/forms/time-select.tsx`): **dois `<select>` (Hora 00–23 / Minuto 00–59)** lado a lado, com o mesmo estilo do `<select>` de Duração ao lado. Selects nativos abrem um "wheel" compacto no mobile, sem overlay gigante. **Precisão total preservada** (00–59) — horários fora do passo de 5 min já existentes (ex.: 23:12) continuam editáveis, sem regressão. Valor de fora continua `"HH:mm"` (o form monta `new Date(\`${date}T${time}:00\`)` igual). ⚠️ **Correção de code-review (finding CONFIRMED)**: o `TimeSelect` **só emite um `"HH:mm"` válido quando as DUAS partes estão escolhidas**; incompleto emite `""` → o Zod (`time.min(1)`) barra com "Informe o horário". A 1ª versão fazia a outra parte assumir `"00"`, o que **criava silenciosamente** um agendamento em `00:30` (só o minuto) ou `HH:00`. Para a escolha parcial ficar visível mesmo emitindo `""`, o componente tem **estado local das 2 partes** + `useEffect` guardado por `lastEmitted` ref (re-sincroniza só em mudança externa de `value`, ignora o eco do próprio emit). O `Controller` passa `field.ref` → `forwardRef` no `<select>` de hora (RHF consegue focar/scrollar até o campo no erro). A linha Horário/Duração virou `grid-cols-1 sm:grid-cols-2` (empilha no mobile p/ os 2 selects terem largura). Wired via `Controller` (era `register`). E2E: helpers `selectTime`/`expectTime` em `tests/e2e/helpers.ts` (usam `select[aria-label="Hora"|"Minuto"]`) substituíram `page.fill('input[id="time"]')` em `full-crud.spec.ts` e `fluxo-completo.spec.ts`. **Validado no Chrome MCP**: editar → selects mostram 15/00 e 09/30; escolha só-minuto → "Informe o horário" (não cria); criar 09:30 Ana Costa ✓ + excluído; status "Faltou" preservado em edição só de `time`.
- **Visualização Dia/Semana (2026-06-27, rodada 2 do feedback da sócia)**: `agenda/page.tsx` tem um toggle **Dia ⇄ Semana** (`viewMode`, padrão `week`, persistido em `localStorage["agenda-view-mode"]` via efeito — não no init, p/ não quebrar hydration). No modo **Dia** renderiza só o dia âncora (`anchorDate`), "Hoje" foca o dia atual sem scroll (a dor relatada: no modo Semana o dia de hoje fica no fim e exige scroll), navegação `Anterior/Próximo` anda de dia em dia, label vira "sábado, 27 de junho" (`first-letter:uppercase`), empty-state "Nenhum agendamento neste dia". No modo **Semana** é o comportamento antigo (7 cards, navegação por `addWeeks`). A query usa `startDate===endDate` (dia) vs intervalo da semana. Bônus: "Novo Agendamento" no modo Dia já abre com a Data = dia visto. Validado no Chrome MCP (toggle, navegação, Hoje, criação/edição/exclusão).
- **Grade de horas ARRASTÁVEL no modo Dia (2026-07-24, decisão do dono)**: o modo **Dia** deixou de ser lista de cards e virou uma **grade de horas** (`<DayGrid>`, `src/components/agenda/day-grid.tsx`) estilo Google Agenda — arrastar p/ mover o horário + alça inferior p/ estender a duração (Pointer Events, snap 15min, colunas de sobreposição, linha do "agora", clique em área livre cria). **Semana segue como estava** (lista). O `PUT /api/appointments/[id]` (que roda o espelho no Google; **sem** guard de conflito desde 2026-07-24) é o backend do arraste. Detalhes e regressões da interação em [`agenda-day-grid.md`](agenda-day-grid.md). O nome do paciente na **lista** (Semana) deixou de truncar (`break-words`, sem perder info — feedback da imagem 3 do dono).
- **Arraste ENTRE DIAS no modo Mês (2026-07-24, decisão do dono: "ao mover pra outro dia, mantém a hora original")**: arrastar um chip para outra célula do Mês reagenda **mantendo hora/minuto e duração** — a célula do mês é um dia inteiro, não tem eixo de tempo, então lá o arraste só muda a **data** (para mover o horário, é no Dia). Hit-test por `data-month-day` + `document.elementFromPoint`; clique × arraste decide pela **troca real de dia** (não por pixels); soltar na mesma célula é **tap → editar**; preview vivo (o chip acompanha a célula sob o cursor) e `pending` até o refetch; só nos **chips (≥ sm)** — no mobile a célula mostra pontos, sem identidade por item. Reusa `rescheduleAppointment`, então o **aviso de horário bloqueado também vale no Mês**. Helper puro `moveKeepingTime` (exportado, testado) monta a data pelos componentes locais — ⚠️ **regressão a evitar**: somar 24h/`addDays` no timestamp desloca o horário em qualquer mudança de offset. Detalhes em [`agenda-day-grid.md`](agenda-day-grid.md), incluindo a armadilha do `pending` × structural sharing do React Query (bug pego no E2E).
- **Evento do Google clicável nas grades (2026-07-24, feedback do dono: "clico neles e nada acontece")**: nas grades Dia/Mês o evento do Google era inerte (`div` mudo no Dia; no Mês o chip só drilava para o Dia, onde também nada acontecia). Agora o clique **promove** (diálogo da Fase B) ou, quando não há o que promover (**dia inteiro** ou **"Ocupado"**), **abre o evento no Google**. As grades só reportam o id (`onSelectGoogleEvent`); quem decide é `handleGoogleEventClick` + `canPromoteGoogleEvent` (regra única, também usada pelo botão "Promover" da Semana). Evento segue **não arrastável** (firewall). Ver [`google-calendar.md`](google-calendar.md) § "Onde o usuário dispara a promoção".
- **Clique na célula do Mês AGENDA (2026-07-24, decisão do dono)**: a área livre da célula deixou de drilar para a visão Dia — agora abre o **diálogo de agendamento** com a data preenchida (`onCreateOnDay`). Quem abre o dia é o **número do dia** e o **"+N mais"**. Igual ao Google Agenda (clique na célula cria, clique na data abre o dia). O botão "+" do hover continua existindo como affordance.
- **Horário bloqueado + aviso de sobreposição (2026-07-24)**: agenda ganhou o botão "Bloquear horário" (feature `TimeBlock`, tabela separada — ver [`time-blocks.md`](time-blocks.md)). Ao criar/arrastar um agendamento que sobrepõe um bloqueio, `onSubmit`/`rescheduleAppointment` chamam `overlappingBlockFor` e, se houver overlap, abrem um `AlertDialog` de confirmação (`blockedConfirm`) — bloqueio é **suave** (só avisa). O guard `scheduleChanged` evita reabrir o aviso ao editar só observações.

## Retroativo — agendar no passado (2026-07-24)

> Decisão do dono: *"deve ser possível agendar em dias/horários que já passaram
> simplesmente para organização, mas que fique flaggeado de alguma forma"*.

- **Campo**: `Appointment.retroactive Boolean @default(false)` (migration
  `20260724202407_add_appointment_retroactive`).
- **Quem decide**: o **servidor**, sempre — regra única `isRetroactive(dateTime, now?)`
  em `src/lib/retroactive.ts` (`dateTime < now`, comparação estrita), usada por
  `POST /api/appointments`, `PUT /api/appointments/[id]` (só quando o `dateTime` é
  reescrito) e `/convert` do Google. **O cliente nunca envia `retroactive`** — não está
  no schema Zod. Unit: `tests/unit/retroactive.test.ts`.
- **⚠️ Por que é PERSISTIDO e não derivado de `dateTime < now` na leitura**: um
  agendamento marcado para o **futuro** que simplesmente **passou** tem de continuar
  sendo varrido pelo cron — é exatamente a falta que o produto mede. O flag distingue
  *"lancei no passado de propósito"* de *"passou do horário"*. Derivar na leitura mataria
  a métrica de no-show.
- **Firewall (é o que faz o selo significar algo)** — `src/lib/services/scheduler.ts`:
  - `markNoShows` filtra `retroactive: false` → registro retroativo **nunca** vira
    `NO_SHOW` automático. Sem isso o cron o marcaria como falta em até 30 min e
    corromperia a taxa de faltas.
  - a query de confirmação (`CONFIRMATION.where`) filtra `retroactive: false` → **nada de
    WhatsApp** (o atendimento já aconteceu) e ele não fica eternamente na fila de
    candidatos sendo pulado item a item.
  - Checks de regressão: `RT.1` (firewall), `RT.2` (comportamento no DB) em
    `scripts/test-sprints.ts`.
- **Reversível pelo horário**: mover o agendamento para o futuro (edição ou arraste)
  **limpa** o flag e devolve o registro ao fluxo normal; mover para o passado marca.
- **Nasce CLASSIFICADO (2026-07-25, fix de review)**: o retroativo **não** nasce mais
  `PENDING`. Ao criar com horário passado, o `Select` de status aparece no diálogo (antes
  era só na edição) com default **"Confirmado"** (compareceu — o caso comum de backfill) e
  **sem a opção "Pendente"**. `createAppointmentSchema` ganhou `status` opcional e o
  `POST` só o honra quando `retroactive` é true — agendamento **futuro ignora** qualquer
  status enviado e nasce `PENDING` (senão daria para criar um "Confirmado" que nunca passou
  pela confirmação). Check `RT.6`.
  - **Por quê**: `PENDING` tem semânticas OPOSTAS nos dois casos. Num agendamento normal é
    **transitório** — o cron sempre resolve (CONFIRMED ou NO_SHOW). Num retroativo é
    **terminal**, porque o cron pula retroativo. O dashboard não distingue os dois: cada
    registro de backfill deixado em Pendente entrava no **denominador** de
    `noShowRate`/`confirmationRate` e diluía a métrica para sempre. Backfillar 50 consultas
    derrubava a taxa de faltas sem nada ter mudado na clínica.
- **Métricas contam por status normalmente** (o dashboard **não** filtra `retroactive`) — se
  o profissional marcar "Faltou", conta como falta: é uma falta real, só registrada depois.
  Foi decisão explícita do dono manter o retroativo na métrica, e é o que torna o parágrafo
  acima necessário.
- **Arrastar para o passado avisa**: `rescheduleAppointment` compara o estado anterior com
  `isRetroactive(newStart)` (mesma função pura do servidor) e, **só na transição**, emite um
  toast "Marcado como Retroativo — fica só como registro". Um arraste é gesto de baixa
  intenção para uma chave que remove o registro do controle de faltas (cenário real: clínica
  atrasada arrasta o card das 14h para 14h30 às 15h).
- **UI**: selo `RetroactiveBadge` ("⟲ Retroativo") na lista da Semana; ícone `History`
  no card da grade do Dia e no chip do Mês (`aria-label="Retroativo"`, tooltip explica a
  consequência). No diálogo, ao escolher um horário passado aparece o aviso *"Este horário
  já passou — vai entrar como **Retroativo**: serve para organizar o histórico, sem
  confirmação por WhatsApp nem falta automática"* (também ao **editar**, porque mover para
  o passado tira da automação).

### Validação manual no browser — retroativo em PRODUÇÃO (2026-07-25)

Chrome MCP, `clinicaorganizada.com`, conta `clinicazeroum`, paciente **já existente**
("Teste Smoke" — regra: não criar paciente em prod, cada `Patient` queima uma vaga vitalícia).

- **Nasce classificado**: no diálogo de **criação** com data de ontem (24/07 10:30) apareceu o
  aviso âmbar + o `Select` de Status com `CONFIRMED` default e opções **Confirmado / Cancelado /
  Faltou** — **"Pendente" não existe** na lista. Após salvar, `GET /api/appointments` devolveu
  `status: "CONFIRMED"`, `retroactive: true`, `googleEventId` setado (espelho no Google), e a UI
  mostrou chip verde `10:30 ⟲ Teste Smoke` no Mês e card com badge **Confirmado** no Dia.
- **Contraprova (futuro)**: 25/07 15:00 → **sem** aviso âmbar e **sem** Select de status;
  nasceu `PENDING` (badge âmbar "Pendente").
- **Toast só na transição** (arraste na grade Dia):
  1. 15:00 → 09:00 (passado): toast **"Marcado como Retroativo — O horário já passou, então
     isto vira só registro: sem WhatsApp e fora do controle de faltas."** + selo ⟲ no card;
     servidor gravou `retroactive: true`.
  2. 09:00 → 08:00 (ainda passado): **só** "Agendamento atualizado com sucesso" — o aviso
     **não** repetiu.
  3. 08:00 → 15:45 (futuro): selo ⟲ **desapareceu** e `retroactive: false` — flag reversível.
  - ⚠️ **Armadilha de teste**: o sonner **pausa** os timers quando o mouse está sobre a pilha de
    toasts. Terminar o arraste dentro da área do toast (top-center) mantém toasts antigos na
    tela e esconde o novo — parece "o toast não disparou". Soltar o card fora dessa faixa (ou
    dar `hover` longe dela antes do screenshot).
- Ambos os agendamentos de teste foram **excluídos** ao fim (`Excluir` no diálogo → AlertDialog
  do shadcn, **não** `confirm()` nativo; 24/07 e 25/07 voltaram a ficar vazios).

## Endpoints

| Método | Path                            | Body / Query                                                                                  | Resposta                                                          |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/appointments`             | `?date=YYYY-MM-DD` ou `?startDate=&endDate=` (dia local), `?status=`, `?patientId=`, `?page=&limit=` | `ApiResponse<AppointmentResponse[]>` ou `PaginatedResponse<...>` |
| POST   | `/api/appointments`             | `CreateAppointmentInput`                                                                      | `ApiResponse<AppointmentResponse>` 201                            |
| GET    | `/api/appointments/[id]`        | —                                                                                             | `ApiResponse<AppointmentResponse>`                                |
| PUT    | `/api/appointments/[id]`        | `UpdateAppointmentInput`                                                                      | `ApiResponse<AppointmentResponse>`                                |
| DELETE | `/api/appointments/[id]`        | —                                                                                             | `ApiResponse<null>`                                               |
| GET    | `/api/appointments/export`      | —                                                                                             | CSV                                                               |

## Pontos sensíveis

- **Date string `yyyy-MM-dd`** é interpretada como **dia em `America/Sao_Paulo`** (00:00:00 → 23:59:59.999 BRT), via `startOfDayInAppTz`/`endOfDayInAppTz` de `@/lib/timezone`. **Não** usar `new Date(y, m, d, 0, 0, 0, 0)` — em runtime UTC (Vercel) isso vira meia-noite UTC = 21:00 BRT do dia anterior, drift de 3h.
- **Export CSV**: `dt.toLocaleDateString/Time` antigos não passavam `timeZone` e renderizavam em UTC no Vercel. Hoje usa `formatInTimeZone(dt, APP_TIMEZONE, ...)` para data e hora.
- **Export CSV é entitlement pago** (`checkEntitlement(userId, "export.csv")` → 402 `PLAN_REQUIRED` no Free). **Front (2026-06-29, feedback da sócia)**: o botão deixou de ser um `<a href download>` cru — virou `src/components/billing/export-csv-button.tsx` (`<ExportCsvButton url="/api/appointments/export" />`, mesmo componente em `pacientes/page.tsx`). Antes, no Free, o browser mostrava uma falha de download genérica ("Erro de servidor desconhecido"). Agora o clique faz `fetch`: `401` → `signOut` (igual ao `fetchApi`); `402` → abre `PaywallModal` (variant **soft**, dismissível) com reason/upgrade do corpo (reason validado contra a lista conhecida do modal p/ não crashar em `meta.title`); `ok` → baixa via Blob (filename do `Content-Disposition`); erro → toast amigável. Botão mostra spinner "Exportando…" (`aria-busy`) durante o fetch. Usuário Free vê **cadeado** (gate em `!usage.isLoading` p/ PRO não ver cadeado piscando no load). Achados endereçados na code-review xhigh 2026-06-29. Validado no Chrome MCP (Free→paywall 402, Pro→download 200).
- **`dateTime`** chega como ISO string (`z.string().datetime()`); convertido com `new Date(dateTime)`.
- **Includes padrão**: `patient { id, name, phone }` e `messageLogs` (orderBy `sentAt: desc`).
- **Multi-tenancy**: tudo filtrado por `userId: session.user.id`.
- **Lifecycle automático**:
  - `confirmationSentAt` → setado pelo cron `sendConfirmations` (ver `features/scheduler.md`).
  - `reminderSentAt` → setado pelo cron `sendReminders`.
  - `confirmedAt` + `status=CONFIRMED` → setado pelo webhook quando paciente responde "1/sim/...".
  - `status=CANCELED` → setado pelo webhook quando paciente responde "2/não/...".
  - `status=NO_SHOW` → setado pelo cron `markNoShows` para `PENDING` cuja `dateTime < now`.

## Fluxos relacionados

- [flows/confirmation-flow.md](../flows/confirmation-flow.md) — fluxo completo de confirmação.

## Como estender

- **Novo status**: adicionar no enum `AppointmentStatus` no Prisma → migrate → `appointmentStatusValues` em validations → tratar nas UIs (`getStatusColor`/`getStatusLabel` em `agenda/page.tsx` e `dashboard/page.tsx`).
- **Recorrência**: requer novo modelo (`AppointmentSeries` ou similar) + lógica para gerar instâncias. Mexe em dashboard, scheduler e nas grades da agenda.
- **Relembrar de novos campos**: passar pelo Zod schema E pelo `updateData` no PUT (atualização parcial explícita, não `...validation.data`).
