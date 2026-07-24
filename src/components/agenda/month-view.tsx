"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMonthGridRange } from "@/components/agenda/month-calendar";
import type { GcalEvent } from "@/hooks/use-api";

// Cabeçalho de dias da semana (domingo primeiro, casando com weekStartsOn: 0
// usado no resto da agenda).
const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Quantos chips cabem numa célula antes de virar "+N" (desktop). Mantém a altura
// da linha previsível mesmo em dias cheios.
const MAX_CHIPS = 3;
// Quantos pontos mostrar no modo compacto (mobile) antes do "+N".
const MAX_DOTS = 4;

// Cada célula carrega o seu dia neste atributo — é o hit-test do arraste
// (document.elementFromPoint → closest(DAY_SELECTOR) → dia sob o ponteiro).
const DAY_SELECTOR = "[data-month-day]";

// Forma mínima de agendamento que a célula precisa (evita acoplar ao tipo
// completo do hook — a página passa os agendamentos já filtrados).
export type MonthAppointment = {
  id: string;
  dateTime: string;
  status: string;
  durationMinutes?: number | null;
  patientId: string;
  notes?: string | null;
  patient?: { name: string } | null;
  /** Lançado no passado (registro) — fora da automação. Ganha ícone de histórico. */
  retroactive?: boolean;
};

type MonthViewProps = {
  /** Qualquer dia dentro do mês a renderizar (a grade cobre 6 semanas). */
  month: Date;
  /** Agendamentos já filtrados, agrupados por `yyyy-MM-dd`. */
  appointmentsByDay: Record<string, MonthAppointment[]>;
  /** Eventos do Google (overlay) agrupados por `yyyy-MM-dd`. */
  googleEventsByDay: Record<string, GcalEvent[]>;
  /**
   * Abre aquele dia na visão Dia. Disparado pelo NÚMERO do dia e pelo "+N mais"
   * — NÃO pela área livre da célula (essa abre o diálogo de agendamento).
   */
  onSelectDay: (day: Date) => void;
  /** Clique num chip de agendamento → abre o diálogo de edição. */
  onSelectAppointment: (appointment: MonthAppointment) => void;
  /**
   * Novo agendamento já com a data preenchida. Disparado pelo botão "+" da
   * célula E pelo clique na área livre da célula.
   */
  onCreateOnDay: (day: Date) => void;
  /**
   * Clique num chip de evento do Google. O componente NÃO decide o que acontece
   * (não conhece a regra de promoção nem o `htmlLink`) — só reporta o id e o pai
   * resolve: promover a agendamento ou abrir no Google.
   */
  onSelectGoogleEvent: (id: string) => void;
  /**
   * Arrastar um chip para outro dia → reagenda mantendo o horário original.
   * Mesma assinatura do `DayGrid` (o pai reusa `rescheduleAppointment`, que já
   * avisa quando o novo horário cai em cima de um bloqueio).
   */
  onReschedule: (
    id: string,
    newStart: Date,
    newDurationMinutes: number,
  ) => Promise<unknown> | void;
  /** Reaproveita as cores/rótulos de status da página (fonte única). */
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  /** Busca dos agendamentos em andamento — mostra overlay em vez de grid "vazio". */
  loading?: boolean;
};

/**
 * Mesma hora do dia, em outra data. É a regra do arraste no Mês: a célula do mês
 * não tem eixo de tempo (um dia inteiro = uma célula), então mover entre dias
 * muda SÓ a data e **preserva o horário original** (decisão do dono, 2026-07-24).
 * Construída pelos componentes locais (ano/mês/dia + hora/minuto) — nunca por
 * soma de 24h, que quebraria em eventual mudança de fuso/horário de verão.
 */
export function moveKeepingTime(dateTimeIso: string, targetDay: Date): Date {
  const src = parseISO(dateTimeIso);
  return new Date(
    targetDay.getFullYear(),
    targetDay.getMonth(),
    targetDay.getDate(),
    src.getHours(),
    src.getMinutes(),
    0,
    0,
  );
}

// Cor sólida do ponto (modo compacto) — o `getStatusColor` da página usa fundo
// translúcido (/10), fraco demais para um dot; aqui queremos cor cheia.
function statusDotClass(status: string) {
  switch (status.toUpperCase()) {
    case "CONFIRMED":
      return "bg-green-500";
    case "PENDING":
      return "bg-yellow-500";
    case "NO_SHOW":
      return "bg-red-500";
    case "CANCELED":
      return "bg-gray-400";
    default:
      return "bg-gray-400";
  }
}

function minutesOfDay(iso: string): number {
  const d = parseISO(iso);
  return d.getHours() * 60 + d.getMinutes();
}

type CellItem =
  | {
      kind: "appointment";
      /** Chave de ordenação: MINUTO DO DIA (não timestamp) — um chip arrastado
       *  para outra célula guarda o dia antigo no `dateTime` e ordenaria errado. */
      sortKey: number;
      appointment: MonthAppointment;
      /** Está sendo previsto em outra célula (arraste em curso / pós-drop). */
      relocated: boolean;
    }
  | { kind: "google"; sortKey: number; event: GcalEvent; allDay: boolean };

type DragState = {
  id: string;
  pointerId: number;
  /** Dia de origem (`yyyy-MM-dd`) — comparado com o `overDay` p/ decidir mover. */
  fromDay: string;
  /** Dia sob o ponteiro agora (`null` = fora da grade). */
  overDay: string | null;
};

/**
 * Visão mensal da agenda — grade fixa de 6 semanas (estilo Google Agenda).
 * Cada célula lista os agendamentos do dia como chips (cor por status) e os
 * eventos do Google (overlay, azul tracejado). No mobile os chips viram pontos
 * coloridos para caber.
 *
 * Mapa de cliques (2026-07-24): **área livre da célula → novo agendamento** nesse
 * dia; **número do dia** e **"+N mais" → visão Dia**; **chip de agendamento →
 * editar**; **chip do Google → promover/abrir no Google**.
 *
 * **Arraste entre dias** (desktop/tablet, Pointer Events): puxar um chip para
 * outra célula reagenda mantendo o horário. Aqui NÃO há grade de horas — para
 * mover o horário, use o modo Dia (`day-grid.tsx`). Eventos do Google são
 * só-leitura (firewall). Ver .context/features/agenda-day-grid.md.
 */
export function MonthView({
  month,
  appointmentsByDay,
  googleEventsByDay,
  onSelectDay,
  onSelectAppointment,
  onCreateOnDay,
  onSelectGoogleEvent,
  onReschedule,
  getStatusColor,
  getStatusLabel,
  loading,
}: MonthViewProps) {
  const today = new Date();

  const days = useMemo(() => {
    const { start, end } = getMonthGridRange(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  const dayByKey = useMemo(() => {
    const m = new Map<string, Date>();
    for (const day of days) m.set(format(day, "yyyy-MM-dd"), day);
    return m;
  }, [days]);

  // ── Arraste entre dias ──────────────────────────────────────────────────────
  // Fonte de verdade = `dragRef` (não o estado): o `pointerup` precisa ler o dia
  // sob o ponteiro MAIS RECENTE, não o do closure do início do arraste.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Suprime o `click` sintético que o browser dispara no fim de um arraste
  // (pointerdown num chip, pointerup em outra célula → click no ancestral comum
  // = corpo da grade → abriria o drill-down do dia sem querer).
  const suppressClickRef = useRef(false);
  // Dia "pendente" após soltar (id → yyyy-MM-dd), mantido até o refetch trazer o
  // valor real — evita o chip pular de volta ao dia antigo antes da resposta.
  const [pending, setPending] = useState<Record<string, string>>({});
  // O pai memoiza `appointmentsByDay`, então a referência só muda quando os
  // dados mudam de fato (refetch) — é o sinal de que o `pending` cumpriu o papel.
  useEffect(() => {
    setPending({});
  }, [appointmentsByDay]);

  const apptById = useMemo(() => {
    const m = new Map<string, MonthAppointment>();
    for (const list of Object.values(appointmentsByDay)) {
      for (const a of list) m.set(a.id, a);
    }
    return m;
  }, [appointmentsByDay]);

  useEffect(() => {
    if (!drag) return;
    const dayUnder = (x: number, y: number) =>
      document
        .elementFromPoint(x, y)
        ?.closest(DAY_SELECTOR)
        ?.getAttribute("data-month-day") ?? null;

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const over = dayUnder(ev.clientX, ev.clientY);
      // Só re-renderiza quando TROCA de célula (não a cada pixel).
      if (over === d.overDay) return;
      const next = { ...d, overDay: over };
      dragRef.current = next;
      setDrag(next);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      cleanup();
      dragRef.current = null;
      setDrag(null);
      // Decide pela mudança REAL do valor (o DIA), nunca por limiar de pixels:
      // soltar na mesma célula é um TAP → abre a edição, mesmo com micro-tremor.
      const targetKey = d.overDay && d.overDay !== d.fromDay ? d.overDay : null;
      const appointment = apptById.get(d.id);
      if (!appointment) return;
      if (!targetKey) {
        onSelectAppointment(appointment);
        return;
      }
      const targetDay = dayByKey.get(targetKey);
      if (!targetDay) return;
      // Mudou de verdade → suprime o click sintético que segue o pointerup.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 50);
      setPending((prev) => ({ ...prev, [d.id]: targetKey }));
      // Solta o `pending` quando a tentativa termina (ver contrato de
      // `rescheduleAppointment` em agenda/page.tsx): no sucesso os dados já
      // chegaram e limpar é invisível; ao CANCELAR o aviso de bloqueio (ou em
      // erro) nada muda no servidor — sem isso o chip ficaria preso no dia novo.
      Promise.resolve(
        onReschedule(
          appointment.id,
          moveKeepingTime(appointment.dateTime, targetDay),
          appointment.durationMinutes ?? 30,
        ),
      ).finally(() =>
        setPending((prev) => {
          if (!(d.id in prev)) return prev;
          const next = { ...prev };
          delete next[d.id];
          return next;
        }),
      );
    };
    // pointercancel (ex.: no touch o browser assume o gesto p/ rolar a página) →
    // ABORTA sem editar nem reagendar.
    const onCancel = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      cleanup();
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return cleanup;
    // `overDay` nas deps re-assina os listeners a cada TROCA de célula (barato) e
    // com isso o closure do `onUp` sempre vê props/estado atuais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.pointerId, drag?.overDay, apptById, dayByKey]);

  const beginDrag = (e: React.PointerEvent, id: string, dayKey: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    // preventDefault só no mouse (evita seleção de texto ao arrastar). No touch,
    // deixa o browser decidir o gesto: com `touch-action: pan-y` rolar a página
    // vence e o arraste é cancelado via pointercancel.
    if (e.pointerType === "mouse") e.preventDefault();
    const state: DragState = { id, pointerId: e.pointerId, fromDay: dayKey, overDay: dayKey };
    dragRef.current = state;
    setDrag(state);
  };

  // Célula onde o chip deve APARECER agora: preview do arraste em curso, senão o
  // dia pendente pós-drop, senão o dia real do agendamento.
  const relocatedDay = (id: string): string | null =>
    drag?.id === id ? drag.overDay : (pending[id] ?? null);

  // Timeline por dia, memoizada (as 42 células consultariam isto a cada render).
  // Ordem: AGENDAMENTOS primeiro (por horário) — são os itens acionáveis e não
  // podem ser empurrados para o "+N mais" por eventos do Google — depois os
  // eventos do Google (dia inteiro e, por fim, os com horário). Difere de
  // propósito do Dia/Semana (que intercalam por horário) por causa do cap de
  // chips da célula compacta do mês.
  const timelinesByDay = useMemo(() => {
    // 1) Distribui os agendamentos pela célula EFETIVA (preview do arraste /
    //    pendente pós-drop têm precedência sobre o dia real).
    const apptsByCell: Record<string, Array<{ appointment: MonthAppointment; relocated: boolean }>> = {};
    for (const day of days) apptsByCell[format(day, "yyyy-MM-dd")] = [];
    for (const day of days) {
      const dayKey = format(day, "yyyy-MM-dd");
      for (const appointment of appointmentsByDay[dayKey] ?? []) {
        const target = relocatedDay(appointment.id) ?? dayKey;
        // Alvo fora da grade visível (não deve acontecer: a janela buscada é a
        // própria grade) → mantém na origem para o chip não desaparecer.
        const cell = apptsByCell[target] ? target : dayKey;
        apptsByCell[cell].push({ appointment, relocated: cell !== dayKey });
      }
    }

    const acc: Record<string, CellItem[]> = {};
    for (const day of days) {
      const dayKey = format(day, "yyyy-MM-dd");
      const appts = (apptsByCell[dayKey] ?? [])
        .map<CellItem>(({ appointment, relocated }) => ({
          kind: "appointment",
          sortKey: minutesOfDay(appointment.dateTime),
          appointment,
          relocated,
        }))
        .sort((a, b) => a.sortKey - b.sortKey);
      const gcal = googleEventsByDay[dayKey] ?? [];
      const allDay = gcal
        .filter((e) => e.allDay)
        .map<CellItem>((event) => ({ kind: "google", sortKey: 0, event, allDay: true }));
      const timedGoogle = gcal
        .filter((e) => !e.allDay)
        .map<CellItem>((event) => ({
          kind: "google",
          sortKey: minutesOfDay(event.start),
          event,
          allDay: false,
        }))
        .sort((a, b) => a.sortKey - b.sortKey);
      acc[dayKey] = [...appts, ...allDay, ...timedGoogle];
    }
    return acc;
    // `drag`/`pending` entram porque mudam a célula efetiva dos chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, appointmentsByDay, googleEventsByDay, drag?.id, drag?.overDay, pending]);

  // Clicar na área livre da célula ABRE O AGENDAMENTO daquele dia (decisão do
  // dono, 2026-07-24 — antes drilava para a visão Dia). Para ver o dia, use o
  // NÚMERO do dia ou o "+N mais". É o comportamento do Google Agenda: clique na
  // célula cria, clique na data abre o dia.
  const handleCellClick = (day: Date) => {
    if (dragRef.current) return; // arraste em curso
    if (suppressClickRef.current) {
      // click sintético logo após um arraste — ignora (não abre o diálogo).
      suppressClickRef.current = false;
      return;
    }
    onCreateOnDay(day);
  };

  return (
    <div className="relative overflow-hidden rounded-lg border" aria-busy={loading}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/60 text-sm text-muted-foreground backdrop-blur-[1px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      )}
      {/* Cabeçalho de dias da semana */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grade de 6 semanas */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const items = timelinesByDay[dayKey] ?? [];
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          const shown = items.slice(0, MAX_CHIPS);
          const extra = items.length - shown.length;
          // Célula sob o ponteiro durante um arraste vindo de OUTRO dia.
          const isDropTarget = !!drag && drag.overDay === dayKey && drag.fromDay !== dayKey;

          return (
            <div
              key={dayKey}
              data-month-day={dayKey}
              onClick={() => handleCellClick(day)}
              title={`Clique para agendar em ${format(day, "dd 'de' MMMM", { locale: ptBR })} · clique no número do dia para abrir o dia`}
              className={cn(
                "group relative flex min-h-[3.75rem] flex-col gap-1 border-b border-r p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[6.5rem]",
                "cursor-pointer hover:bg-accent/40",
                !inMonth && "bg-muted/20",
                isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
              )}
            >
              {/* Linha do topo: número do dia + botão "+" (hover, desktop) */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label={`Ver ${format(day, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
                  aria-current={isToday ? "date" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDay(day);
                  }}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground hover:bg-accent"
                        : "text-muted-foreground/50 hover:bg-accent/50",
                  )}
                >
                  {format(day, "d")}
                </button>
                <button
                  type="button"
                  aria-label={`Novo agendamento em ${format(day, "dd 'de' MMMM", { locale: ptBR })}`}
                  title="Novo agendamento neste dia"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateOnDay(day);
                  }}
                  className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Chips (desktop / tablet) */}
              <div className="hidden flex-col gap-0.5 sm:flex">
                {shown.map((item) => {
                  if (item.kind === "appointment") {
                    const a = item.appointment;
                    const dragging = drag?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        data-appointment-id={a.id}
                        onPointerDown={(e) => beginDrag(e, a.id, dayKey)}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Enter/Espaço (teclado) não passa por pointerdown →
                          // abre a edição aqui. Cliques de ponteiro já foram
                          // resolvidos no pointerup (tap = editar, arraste = mover).
                          if (e.detail === 0) onSelectAppointment(a);
                        }}
                        title={`${format(parseISO(a.dateTime), "HH:mm")} — ${a.patient?.name ?? "Paciente"} (${getStatusLabel(a.status)})${a.retroactive ? " · Retroativo: só registro, sem WhatsApp nem falta automática" : ""} · arraste para outro dia para reagendar (mantém o horário)`}
                        style={{ touchAction: "pan-y" }}
                        className={cn(
                          "flex w-full cursor-grab select-none items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[0.7rem] font-medium transition-opacity hover:opacity-80 active:cursor-grabbing",
                          getStatusColor(a.status),
                          dragging && "ring-2 ring-primary",
                          item.relocated && !dragging && "opacity-70",
                        )}
                      >
                        <span className="shrink-0 tabular-nums">
                          {format(parseISO(a.dateTime), "HH:mm")}
                        </span>
                        {a.retroactive && (
                          <History className="h-3 w-3 shrink-0" aria-label="Retroativo" />
                        )}
                        <span className="truncate">{a.patient?.name ?? "Paciente"}</span>
                      </button>
                    );
                  }
                  const { event, allDay } = item;
                  return (
                    <button
                      key={`${event.id}-${dayKey}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGoogleEvent(event.id);
                      }}
                      title={`Google Agenda: ${event.title} — clique para promover a agendamento ou abrir no Google`}
                      className="flex w-full items-center gap-1 truncate rounded border border-dashed border-blue-400/40 bg-blue-500/5 px-1.5 py-0.5 text-left text-[0.7rem] font-medium text-blue-700 transition-opacity hover:opacity-80 dark:text-blue-400"
                    >
                      {!allDay && (
                        <span className="shrink-0 tabular-nums">
                          {format(parseISO(event.start), "HH:mm")}
                        </span>
                      )}
                      <span className="truncate">{event.title}</span>
                    </button>
                  );
                })}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(day);
                    }}
                    className="w-full rounded px-1.5 text-left text-[0.7rem] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{extra} mais
                  </button>
                )}
              </div>

              {/* Pontos (mobile) */}
              {items.length > 0 && (
                <div className="mt-auto flex flex-wrap items-center gap-1 sm:hidden">
                  {items.slice(0, MAX_DOTS).map((item, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        item.kind === "google" ? "bg-blue-500" : statusDotClass(item.appointment.status),
                      )}
                    />
                  ))}
                  {items.length > MAX_DOTS && (
                    <span className="text-[0.6rem] leading-none text-muted-foreground">
                      +{items.length - MAX_DOTS}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
