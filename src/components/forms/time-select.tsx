"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Dois <select> (Hora / Minuto) no lugar do <input type="time">.
//
// Motivo (feedback do dono, mobile): no Android, `type="time"` abre o relógio
// nativo do Material — um overlay enorme que cobre o diálogo e destoa do design
// (ver .context/features/appointments.md). Dois selects nativos abrem um "wheel"
// compacto no rodapé, consistentes com o <select> de Duração ao lado, e sem
// perder precisão (00–59, então horários fora do passo de 5 min — ex.: 23:12 já
// existentes — continuam editáveis).
//
// O valor de fora é sempre "HH:mm" (o que o form espera para montar o Date) —
// ou "" quando incompleto (ver `update`).

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs transition-all duration-200 outline-none focus-visible:border-primary/50 focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-primary/20";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function splitTime(value?: string): [string, string] {
  if (!value || !value.includes(":")) return ["", ""];
  const [h, m] = value.split(":");
  // Só aceita partes que existem nas listas (senão o <select> ficaria com um
  // value "fantasma" que não casa com nenhuma <option>).
  return [HOURS.includes(h) ? h : "", MINUTES.includes(m) ? m : ""];
}

type TimeSelectProps = {
  /** Valor no formato "HH:mm" (vazio = nada selecionado). */
  value?: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** id do <select> de hora, para o <label htmlFor>. */
  id?: string;
};

export const TimeSelect = forwardRef<HTMLSelectElement, TimeSelectProps>(
  function TimeSelect({ value, onChange, invalid, id }, ref) {
    // Estado local das duas partes: precisa existir separado do `value` para uma
    // escolha PARCIAL (só hora ou só minuto) ficar visível mesmo emitindo "".
    const [parts, setParts] = useState<[string, string]>(() => splitTime(value));
    const [h, m] = parts;

    // Re-sincroniza quando `value` muda POR FORA (abrir p/ editar, reset) — mas
    // ignora o "eco" do nosso próprio emit (senão a escolha parcial, que emite
    // "", zeraria o select que o usuário acabou de mexer).
    const lastEmitted = useRef(value ?? "");
    useEffect(() => {
      if ((value ?? "") !== lastEmitted.current) {
        setParts(splitTime(value));
        lastEmitted.current = value ?? "";
      }
    }, [value]);

    const update = (nextH: string, nextM: string) => {
      setParts([nextH, nextM]);
      // Só propaga um horário VÁLIDO quando as DUAS partes existem; incompleto
      // vira "" para a validação barrar ("Informe o horário") — igual ao
      // <input type="time"> nativo antigo, que não deixava enviar hora pela
      // metade (senão o form montaria 00:mm / HH:00 sem o usuário perceber).
      const next = nextH && nextM ? `${nextH}:${nextM}` : "";
      lastEmitted.current = next;
      onChange(next);
    };

    return (
      <div className="grid grid-cols-2 gap-2">
        <select
          id={id}
          ref={ref}
          aria-label="Hora"
          aria-invalid={invalid}
          value={h}
          onChange={(e) => update(e.target.value, m)}
          className={cn(SELECT_CLASS, invalid && "border-destructive/50")}
        >
          <option value="" disabled>
            Hora
          </option>
          {HOURS.map((hh) => (
            <option key={hh} value={hh}>
              {hh}
            </option>
          ))}
        </select>
        <select
          aria-label="Minuto"
          aria-invalid={invalid}
          value={m}
          onChange={(e) => update(h, e.target.value)}
          className={cn(SELECT_CLASS, invalid && "border-destructive/50")}
        >
          <option value="" disabled>
            Min
          </option>
          {MINUTES.map((mm) => (
            <option key={mm} value={mm}>
              {mm}
            </option>
          ))}
        </select>
      </div>
    );
  },
);
