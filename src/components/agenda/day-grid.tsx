"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, GripVertical, History, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Grade de horas do modo DIA (estilo Google Agenda). Agendamentos e bloqueios
 * podem ser ARRASTADOS (mover o horário) e REDIMENSIONADOS pela alça inferior
 * (estender a duração). Eventos do Google são só-leitura (firewall). Clicar numa
 * área livre cria um agendamento naquele horário.
 *
 * Interação por Pointer Events (mouse e toque). Um movimento curto (< THRESHOLD)
 * conta como clique (abre a edição); acima disso, é arraste. Snap de 15 min.
 * Fonte de verdade do arraste é um `ref` (não o estado) — o `pointerup` precisa
 * ler o preview MAIS RECENTE, não o do closure do início do arraste.
 * Ver .context/features/agenda-day-grid.md.
 */

const HOUR_PX = 56; // altura de 1 hora
const SNAP_MIN = 15;
const MIN_ITEM_PX = 24;
// Abaixo disso o card só mostra UMA linha de texto (30 min = 28px de altura) —
// aí o nome do paciente vai para a mesma linha do horário em vez de ser cortado.
const COMPACT_CARD_PX = 40;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;
const DRAG_THRESHOLD_PX = 4;
const RESIZE_HANDLE_PX = 10;
const MIN_DURATION = 15;
const MAX_APPOINTMENT_DURATION = 480;
const MAX_BLOCK_DURATION = 1440;

// Dica dos eventos do Google. Cobre os DOIS destinos possíveis do clique (o pai
// decide: promover a agendamento, ou abrir no Google quando não há o que
// promover) — antes o clique não fazia NADA e o evento parecia "morto".
const GOOGLE_EVENT_HINT = "clique para promover a agendamento ou abrir no Google";

export type GridAppointment = {
  id: string;
  dateTime: string; // ISO
  durationMinutes: number;
  patientName: string;
  status: string;
  /** Lançado no passado (registro) — fora da automação. Ganha ícone de histórico. */
  retroactive?: boolean;
};

export type GridBlock = {
  id: string;
  dateTime: string; // ISO
  durationMinutes: number;
  title: string;
};

export type GridGoogleEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
};

type DayGridProps = {
  day: Date;
  appointments: GridAppointment[];
  blocks: GridBlock[];
  googleEvents: GridGoogleEvent[];
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  onEditAppointment: (id: string) => void;
  onEditBlock: (id: string) => void;
  /**
   * Clique num evento do Google. O componente NÃO decide o que acontece (não
   * conhece a regra de promoção nem o `htmlLink`) — só reporta o id e o pai
   * resolve: promover a agendamento ou abrir no Google.
   */
  onSelectGoogleEvent: (id: string) => void;
  onCreateAt: (start: Date) => void;
  onReschedule: (id: string, newStart: Date, newDurationMinutes: number) => Promise<unknown> | void;
  onRescheduleBlock: (id: string, newStart: Date, newDurationMinutes: number) => Promise<unknown> | void;
};

type ItemKind = "appointment" | "block";

type DragState = {
  key: string; // prefixado ("a:<id>" / "b:<id>") — identidade interna
  entityId: string; // id cru p/ callbacks/mutação
  kind: ItemKind;
  mode: "move" | "resize";
  pointerId: number;
  startClientY: number;
  originStartMin: number;
  originDurationMin: number;
  previewStartMin: number;
  previewDurationMin: number;
  moved: boolean;
};

function minutesOfDay(iso: string): number {
  const d = parseISO(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function googleDurationMin(e: GridGoogleEvent): number {
  return Math.max(15, Math.round((parseISO(e.end).getTime() - parseISO(e.start).getTime()) / 60000));
}

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function fmtMinLabel(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = ((totalMin % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Layout de colunas para itens que se sobrepõem (nada fica um em cima do outro).
type LaidOut = { col: number; cols: number };
function layoutColumns(
  items: Array<{ id: string; startMin: number; endMin: number }>,
): Record<string, LaidOut> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: Record<string, LaidOut> = {};
  let cluster: typeof sorted = [];
  let clusterEnd = -1;

  const flush = () => {
    const colEnds: number[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= it.startMin) {
          colEnds[c] = it.endMin;
          result[it.id] = { col: c, cols: 0 };
          placed = true;
          break;
        }
      }
      if (!placed) {
        colEnds.push(it.endMin);
        result[it.id] = { col: colEnds.length - 1, cols: 0 };
      }
    }
    const total = colEnds.length;
    for (const it of cluster) result[it.id].cols = total;
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length) flush();
  return result;
}

export function DayGrid({
  day,
  appointments,
  blocks,
  googleEvents,
  getStatusColor,
  getStatusLabel,
  onEditAppointment,
  onEditBlock,
  onSelectGoogleEvent,
  onCreateAt,
  onReschedule,
  onRescheduleBlock,
}: DayGridProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Suprime o `click` sintético que o browser dispara no fim de um arraste
  // (pointerdown no item, pointerup sobre a área livre → click no ancestral comum
  // = corpo da grade → abriria "Novo Agendamento" sem querer).
  const suppressClickRef = useRef(false);
  // Posição "pendente" após soltar, mantida até o refetch trazer o valor real
  // (evita o item pular de volta ao lugar antigo antes do servidor responder).
  const [pending, setPending] = useState<Record<string, { startMin: number; durationMin: number }>>({});
  useEffect(() => {
    setPending({});
  }, [appointments, blocks]);

  const timedGoogle = useMemo(() => googleEvents.filter((e) => !e.allDay), [googleEvents]);
  const allDayGoogle = useMemo(() => googleEvents.filter((e) => e.allDay), [googleEvents]);

  // Faixa de horas visível: default 07–21, expandida p/ caber qualquer item fora.
  const { startHour, endHour } = useMemo(() => {
    let minH = DEFAULT_START_HOUR;
    let maxH = DEFAULT_END_HOUR;
    const consider = (startMin: number, durationMin: number) => {
      minH = Math.min(minH, Math.floor(startMin / 60));
      maxH = Math.max(maxH, Math.ceil((startMin + durationMin) / 60));
    };
    for (const a of appointments) consider(minutesOfDay(a.dateTime), a.durationMinutes);
    for (const b of blocks) consider(minutesOfDay(b.dateTime), b.durationMinutes);
    for (const e of timedGoogle) consider(minutesOfDay(e.start), googleDurationMin(e));
    return { startHour: Math.max(0, minH), endHour: Math.min(24, Math.max(maxH, minH + 1)) };
  }, [appointments, blocks, timedGoogle]);

  const gridStartMin = startHour * 60;
  const gridEndMin = endHour * 60;
  const totalHeight = ((gridEndMin - gridStartMin) / 60) * HOUR_PX;

  const clampStart = (startMin: number, durationMin: number) =>
    Math.max(gridStartMin, Math.min(startMin, gridEndMin - durationMin));

  const effective = (key: string, baseStart: number, baseDur: number) => {
    if (drag && drag.key === key) return { startMin: drag.previewStartMin, durationMin: drag.previewDurationMin };
    const p = pending[key];
    if (p) return { startMin: p.startMin, durationMin: p.durationMin };
    return { startMin: baseStart, durationMin: baseDur };
  };

  // Layout de colunas (todos os itens cronometrados juntos, posição de props).
  const layout = useMemo(() => {
    const items: Array<{ id: string; startMin: number; endMin: number }> = [];
    for (const a of appointments) {
      const s = minutesOfDay(a.dateTime);
      items.push({ id: `a:${a.id}`, startMin: s, endMin: s + a.durationMinutes });
    }
    for (const b of blocks) {
      const s = minutesOfDay(b.dateTime);
      items.push({ id: `b:${b.id}`, startMin: s, endMin: s + b.durationMinutes });
    }
    for (const e of timedGoogle) {
      const s = minutesOfDay(e.start);
      items.push({ id: `g:${e.id}`, startMin: s, endMin: s + googleDurationMin(e) });
    }
    return layoutColumns(items);
  }, [appointments, blocks, timedGoogle]);

  // ── Drag global via window (fonte de verdade = dragRef) ─────────────────────
  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const deltaPx = ev.clientY - d.startClientY;
      const deltaMin = snap((deltaPx / HOUR_PX) * 60);
      const moved = d.moved || Math.abs(deltaPx) >= DRAG_THRESHOLD_PX;
      let next: DragState;
      if (d.mode === "move") {
        const start = clampStart(d.originStartMin + deltaMin, d.originDurationMin);
        next = { ...d, previewStartMin: start, previewDurationMin: d.originDurationMin, moved };
      } else {
        const maxDur = d.kind === "block" ? MAX_BLOCK_DURATION : MAX_APPOINTMENT_DURATION;
        const rawDur = d.originDurationMin + deltaMin;
        const dur = Math.max(MIN_DURATION, Math.min(rawDur, maxDur, gridEndMin - d.originStartMin));
        next = { ...d, previewStartMin: d.originStartMin, previewDurationMin: dur, moved };
      }
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
      // Decide pela mudança REAL do valor com snap (não pelo pixel): um toque com
      // micro-tremor (< 1 passo de snap) NÃO deve reagendar — abre a edição. Evita
      // PUT no-op + escrita no Google e faz o tap-para-editar funcionar no mobile.
      const changed =
        d.mode === "move"
          ? d.previewStartMin !== d.originStartMin
          : d.previewDurationMin !== d.originDurationMin;
      if (!changed) {
        if (d.kind === "appointment") onEditAppointment(d.entityId);
        else onEditBlock(d.entityId);
        setDrag(null);
        return;
      }
      // Mudou de verdade → suprime o click sintético que segue o pointerup.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 50);
      const newStart = new Date(day);
      newStart.setHours(0, 0, 0, 0);
      newStart.setMinutes(d.previewStartMin);
      setPending((prev) => ({
        ...prev,
        [d.key]: { startMin: d.previewStartMin, durationMin: d.previewDurationMin },
      }));
      setDrag(null);
      // Solta o `pending` quando a tentativa termina (ver contrato de
      // `rescheduleAppointment`/`rescheduleBlock` em agenda/page.tsx): ao CANCELAR
      // o aviso de bloqueio (ou em erro) nada muda no servidor, o React Query
      // devolve a MESMA referência e o efeito de props não dispararia — o item
      // ficaria preso na posição arrastada mesmo sem nada ter sido salvo.
      Promise.resolve(
        d.kind === "appointment"
          ? onReschedule(d.entityId, newStart, d.previewDurationMin)
          : onRescheduleBlock(d.entityId, newStart, d.previewDurationMin),
      ).finally(() =>
        setPending((prev) => {
          if (!(d.key in prev)) return prev;
          const next = { ...prev };
          delete next[d.key];
          return next;
        }),
      );
    };
    // pointercancel (ex.: o browser assume o gesto p/ rolar a página no touch) →
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.key, drag?.mode, drag?.pointerId]);

  const beginDrag = (
    e: React.PointerEvent,
    key: string,
    entityId: string,
    kind: ItemKind,
    mode: "move" | "resize",
    startMin: number,
    durationMin: number,
  ) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    e.preventDefault();
    const state: DragState = {
      key,
      entityId,
      kind,
      mode,
      pointerId: e.pointerId,
      startClientY: e.clientY,
      originStartMin: startMin,
      originDurationMin: durationMin,
      previewStartMin: startMin,
      previewDurationMin: durationMin,
      moved: false,
    };
    dragRef.current = state;
    setDrag(state);
  };

  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // clicou num item
    if (dragRef.current) return;
    if (suppressClickRef.current) {
      // click sintético logo após um arraste — ignora (não cria agendamento).
      suppressClickRef.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const min = gridStartMin + Math.floor(((offsetY / HOUR_PX) * 60) / 30) * 30;
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(Math.max(gridStartMin, Math.min(min, gridEndMin - 30)));
    onCreateAt(start);
  };

  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);

  const now = new Date();
  const isToday = format(now, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= gridStartMin && nowMin <= gridEndMin;

  const colStyle = (key: string): React.CSSProperties => {
    const l = layout[key];
    if (!l || l.cols <= 1) return { left: "2px", right: "2px" };
    const widthPct = 100 / l.cols;
    return { left: `calc(${l.col * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` };
  };

  return (
    <div className="rounded-lg border bg-card">
      {allDayGoogle.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b p-3">
          {allDayGoogle.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelectGoogleEvent(e.id)}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-blue-400/40 bg-blue-500/5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-blue-500/10"
              title={GOOGLE_EVENT_HINT}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate">{e.title}</span>
              <Badge variant="outline" className="ml-auto border-blue-400/50 text-blue-700 dark:text-blue-400">
                Google
              </Badge>
            </button>
          ))}
        </div>
      )}

      <div className="flex">
        {/* Gutter de horas */}
        <div className="w-14 shrink-0 select-none" style={{ height: totalHeight }}>
          {hours.map((h, i) => (
            <div key={h} className="relative pr-2 text-right text-xs text-muted-foreground" style={{ height: HOUR_PX }}>
              {i > 0 && <span className="absolute -top-2 right-2">{fmtMinLabel(h * 60)}</span>}
            </div>
          ))}
        </div>

        {/* Corpo da grade */}
        <div className="relative flex-1 cursor-copy" style={{ height: totalHeight }} onClick={handleBackgroundClick}>
          {hours.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 border-t border-border/60" style={{ top: i * HOUR_PX }} />
          ))}

          {showNow && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
              style={{ top: ((nowMin - gridStartMin) / 60) * HOUR_PX }}
            >
              <div className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
              <div className="h-px flex-1 bg-red-500" />
            </div>
          )}

          {/* Eventos do Google (não arrastáveis — firewall; clicáveis) */}
          {timedGoogle.map((e) => {
            const s = minutesOfDay(e.start);
            const dur = googleDurationMin(e);
            const top = ((s - gridStartMin) / 60) * HOUR_PX;
            const height = Math.max(MIN_ITEM_PX, (dur / 60) * HOUR_PX);
            return (
              <button
                key={`g:${e.id}`}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectGoogleEvent(e.id);
                }}
                className="absolute z-10 overflow-hidden rounded-md border border-dashed border-blue-400/50 bg-blue-500/10 px-2 py-1 text-left text-xs transition-colors hover:bg-blue-500/20"
                style={{ top, height, ...colStyle(`g:${e.id}`) }}
                title={`${format(parseISO(e.start), "HH:mm")}–${format(parseISO(e.end), "HH:mm")} · ${e.title} (Google) — ${GOOGLE_EVENT_HINT}`}
              >
                <span className="font-medium text-blue-700 dark:text-blue-300">{format(parseISO(e.start), "HH:mm")}</span>{" "}
                <span className="text-blue-800/80 dark:text-blue-200/80">{e.title}</span>
              </button>
            );
          })}

          {/* Bloqueios (arrastáveis) */}
          {blocks.map((b) => {
            const key = `b:${b.id}`;
            const base = minutesOfDay(b.dateTime);
            const eff = effective(key, base, b.durationMinutes);
            const top = ((eff.startMin - gridStartMin) / 60) * HOUR_PX;
            const height = Math.max(MIN_ITEM_PX, (eff.durationMin / 60) * HOUR_PX);
            const active = drag?.key === key;
            return (
              <div
                key={key}
                className={`group absolute z-10 select-none overflow-hidden rounded-md border border-zinc-400/50 bg-[repeating-linear-gradient(45deg,rgba(113,113,122,0.16)_0px,rgba(113,113,122,0.16)_6px,transparent_6px,transparent_12px)] px-2 py-1 text-xs shadow-sm ${
                  active ? "z-30 ring-2 ring-zinc-400" : ""
                }`}
                style={{ top, height, touchAction: "pan-y", ...colStyle(key) }}
                onPointerDown={(e) => beginDrag(e, key, b.id, "block", "move", eff.startMin, eff.durationMin)}
                title="Horário bloqueado — arraste para mover, alça para estender, clique para editar"
              >
                <div className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-200">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span className="truncate">{b.title}</span>
                </div>
                <span className="text-[11px] text-zinc-600/80 dark:text-zinc-300/70">
                  {fmtMinLabel(eff.startMin)}–{fmtMinLabel(eff.startMin + eff.durationMin)}
                </span>
                <ResizeHandle onPointerDown={(e) => beginDrag(e, key, b.id, "block", "resize", eff.startMin, eff.durationMin)} />
              </div>
            );
          })}

          {/* Agendamentos (arrastáveis) */}
          {appointments.map((a) => {
            const key = `a:${a.id}`;
            const base = minutesOfDay(a.dateTime);
            const eff = effective(key, base, a.durationMinutes);
            const top = ((eff.startMin - gridStartMin) / 60) * HOUR_PX;
            const height = Math.max(MIN_ITEM_PX, (eff.durationMin / 60) * HOUR_PX);
            // Cabe só uma linha de texto (≤ 30 min): layout de 1 linha.
            const compact = height < COMPACT_CARD_PX;
            const active = drag?.key === key;
            return (
              <div
                key={key}
                className={`group absolute z-10 flex select-none flex-col overflow-hidden rounded-md border bg-card px-2 py-1 text-xs shadow-sm transition-shadow hover:shadow-md ${
                  active ? "z-30 ring-2 ring-primary" : ""
                }`}
                style={{ top, height, touchAction: "pan-y", ...colStyle(key) }}
                onPointerDown={(e) => beginDrag(e, key, a.id, "appointment", "move", eff.startMin, eff.durationMin)}
                title={`${fmtMinLabel(eff.startMin)} · ${a.patientName}${a.retroactive ? " · Retroativo (só registro, sem WhatsApp nem falta automática)" : ""} — arraste para mover, alça para estender, clique para editar`}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                  <span className="shrink-0 font-medium">{fmtMinLabel(eff.startMin)}</span>
                  {a.retroactive && (
                    <History
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-label="Retroativo"
                    />
                  )}
                  {/* Card baixo (ex.: 30 min = 28px) só tem UMA linha visível — o
                      nome sobe para cá, senão ficava cortado e o card virava
                      "10:00 Pendente" sem dizer de QUEM é. Ficou crítico quando
                      sobrepor passou a ser permitido (3 colunas lado a lado). */}
                  {compact && <span className="truncate font-medium">{a.patientName}</span>}
                  <Badge className={`${getStatusColor(a.status)} ml-auto shrink-0 px-1.5 py-0 text-[10px]`}>
                    {getStatusLabel(a.status)}
                  </Badge>
                </div>
                {!compact && <span className="truncate font-medium">{a.patientName}</span>}
                <ResizeHandle onPointerDown={(e) => beginDrag(e, key, a.id, "appointment", "resize", eff.startMin, eff.durationMin)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center opacity-0 transition-opacity group-hover:opacity-100"
      style={{ height: RESIZE_HANDLE_PX, touchAction: "none" }}
      onPointerDown={onPointerDown}
      title="Arraste para estender a duração"
    >
      <div className="mb-0.5 h-1 w-8 rounded-full bg-foreground/30" />
    </div>
  );
}
