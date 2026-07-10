"use client";

import { useMemo } from "react";
import {
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Loader2 } from "lucide-react";
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
};

type MonthViewProps = {
  /** Qualquer dia dentro do mês a renderizar (a grade cobre 6 semanas). */
  month: Date;
  /** Agendamentos já filtrados, agrupados por `yyyy-MM-dd`. */
  appointmentsByDay: Record<string, MonthAppointment[]>;
  /** Eventos do Google (overlay) agrupados por `yyyy-MM-dd`. */
  googleEventsByDay: Record<string, GcalEvent[]>;
  /** Clique num dia (área livre / número) → abre aquele dia na visão Dia. */
  onSelectDay: (day: Date) => void;
  /** Clique num chip de agendamento → abre o diálogo de edição. */
  onSelectAppointment: (appointment: MonthAppointment) => void;
  /** Botão "+" da célula → novo agendamento já com a data preenchida. */
  onCreateOnDay: (day: Date) => void;
  /** Reaproveita as cores/rótulos de status da página (fonte única). */
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  /** Busca dos agendamentos em andamento — mostra overlay em vez de grid "vazio". */
  loading?: boolean;
};

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

type CellItem =
  | { kind: "appointment"; time: number; appointment: MonthAppointment }
  | { kind: "google"; time: number; event: GcalEvent; allDay: boolean };

/**
 * Visão mensal da agenda — grade fixa de 6 semanas (estilo Google Agenda).
 * Cada célula lista os agendamentos do dia como chips (cor por status) e os
 * eventos do Google (overlay, azul tracejado). No mobile os chips viram pontos
 * coloridos para caber. Clicar num dia abre a visão Dia; clicar num chip de
 * agendamento abre a edição; o "+" cria um agendamento naquele dia.
 */
export function MonthView({
  month,
  appointmentsByDay,
  googleEventsByDay,
  onSelectDay,
  onSelectAppointment,
  onCreateOnDay,
  getStatusColor,
  getStatusLabel,
  loading,
}: MonthViewProps) {
  const today = new Date();

  const days = useMemo(() => {
    const { start, end } = getMonthGridRange(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  // Timeline por dia, memoizada (as 42 células consultariam isto a cada render).
  // Ordem: AGENDAMENTOS primeiro (por horário) — são os itens acionáveis e não
  // podem ser empurrados para o "+N mais" por eventos do Google — depois os
  // eventos do Google (dia inteiro e, por fim, os com horário). Difere de
  // propósito do Dia/Semana (que intercalam por horário) por causa do cap de
  // chips da célula compacta do mês.
  const timelinesByDay = useMemo(() => {
    const acc: Record<string, CellItem[]> = {};
    for (const day of days) {
      const dayKey = format(day, "yyyy-MM-dd");
      const appts = (appointmentsByDay[dayKey] ?? [])
        .map<CellItem>((appointment) => ({
          kind: "appointment",
          time: parseISO(appointment.dateTime).getTime(),
          appointment,
        }))
        .sort((a, b) => a.time - b.time);
      const gcal = googleEventsByDay[dayKey] ?? [];
      const allDay = gcal
        .filter((e) => e.allDay)
        .map<CellItem>((event) => ({ kind: "google", time: 0, event, allDay: true }));
      const timedGoogle = gcal
        .filter((e) => !e.allDay)
        .map<CellItem>((event) => ({
          kind: "google",
          time: parseISO(event.start).getTime(),
          event,
          allDay: false,
        }))
        .sort((a, b) => a.time - b.time);
      acc[dayKey] = [...appts, ...allDay, ...timedGoogle];
    }
    return acc;
  }, [days, appointmentsByDay, googleEventsByDay]);

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

          return (
            <div
              key={dayKey}
              onClick={() => onSelectDay(day)}
              className={cn(
                "group relative flex min-h-[3.75rem] flex-col gap-1 border-b border-r p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[6.5rem]",
                "cursor-pointer hover:bg-accent/40",
                !inMonth && "bg-muted/20",
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
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAppointment(a);
                        }}
                        title={`${format(parseISO(a.dateTime), "HH:mm")} — ${a.patient?.name ?? "Paciente"} (${getStatusLabel(a.status)})`}
                        className={cn(
                          "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[0.7rem] font-medium transition-opacity hover:opacity-80",
                          getStatusColor(a.status),
                        )}
                      >
                        <span className="shrink-0 tabular-nums">
                          {format(parseISO(a.dateTime), "HH:mm")}
                        </span>
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
                        onSelectDay(day);
                      }}
                      title={`Google Agenda: ${event.title}`}
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
