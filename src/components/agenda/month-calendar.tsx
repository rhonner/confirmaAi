"use client";

import { useMemo } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Cabeçalho de dias da semana (domingo primeiro, casando com weekStartsOn: 0
// usado no resto da agenda). Curto e sem ambiguidade para o pt-BR.
const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Intervalo da grade fixa de 6 semanas (42 dias) exibida para um mês — sempre
 * domingo→sábado. Fonte única compartilhada: o `MonthCalendar` usa para renderizar
 * as células e a página usa para buscar os pontos, evitando que grade e busca
 * saiam de sincronia (dias que "vazam" dos meses vizinhos precisam bater).
 */
export function getMonthGridRange(month: Date): { start: Date; end: Date } {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  return { start, end: addDays(start, 41) };
}

type MonthCalendarProps = {
  /** Dia atualmente selecionado (âncora da agenda). */
  selected: Date;
  /** Mês exibido no grid (controlado pelo pai para poder buscar os dots). */
  month: Date;
  /** Chamado ao navegar para outro mês (‹ ›) — pai refaz a busca do mês. */
  onMonthChange: (month: Date) => void;
  /** Dias (yyyy-MM-dd) que têm ao menos um agendamento — recebem um ponto. */
  datesWithAppointments: Set<string>;
  /** Chamado ao clicar num dia. */
  onSelect: (day: Date) => void;
};

/**
 * Mini-calendário mensal autossuficiente (sem dependência externa; usa date-fns
 * + Tailwind). Renderiza um grid de 6 semanas, marca o dia selecionado, "hoje",
 * dias fora do mês (esmaecidos) e um ponto sob os dias com agendamento.
 */
export function MonthCalendar({
  selected,
  month,
  onMonthChange,
  datesWithAppointments,
  onSelect,
}: MonthCalendarProps) {
  const today = new Date();

  // Sempre 6 semanas fixas (42 células) — a altura do popover não pula ao paginar
  // entre meses (fev = 4 linhas, ago = 6). Casa com o `fixedWeeks` do
  // react-day-picker/shadcn e com o "grid de 6 semanas" do docstring.
  const days = useMemo(() => {
    const { start, end } = getMonthGridRange(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  return (
    <div className="w-[17rem] p-3">
      {/* Cabeçalho: mês/ano + navegação */}
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Mês anterior"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium first-letter:uppercase">
          {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Próximo mês"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Cabeçalho de dias da semana */}
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-7 items-center justify-center text-[0.7rem] font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          const inMonth = isSameMonth(day, month);
          const hasAppointments = datesWithAppointments.has(dayKey);

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${format(day, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}${isSelected ? " (selecionado)" : ""}`}
              aria-current={isToday ? "date" : undefined}
              className={`relative flex h-9 w-full flex-col items-center justify-center rounded-md text-sm transition-colors cursor-pointer ${
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : isToday
                    ? "bg-accent font-medium text-foreground"
                    : inMonth
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground/40 hover:bg-accent/50"
              }`}
            >
              <span className="leading-none">{format(day, "d")}</span>
              {hasAppointments && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${
                    isSelected ? "bg-primary-foreground" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
