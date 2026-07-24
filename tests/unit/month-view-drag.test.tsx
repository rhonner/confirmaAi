import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { MonthView, moveKeepingTime, type MonthAppointment } from "@/components/agenda/month-view";

// Arraste entre dias na visão MÊS: mover para outro dia deve reagendar
// PRESERVANDO o horário original (a célula do mês não tem eixo de tempo).
// Ver .context/features/agenda-day-grid.md § "Arraste entre dias (modo Mês)".

describe("moveKeepingTime", () => {
  it("preserva hora e minuto ao trocar de dia", () => {
    const moved = moveKeepingTime("2026-07-20T14:30:00", new Date(2026, 6, 25));
    expect(moved.getFullYear()).toBe(2026);
    expect(moved.getMonth()).toBe(6);
    expect(moved.getDate()).toBe(25);
    expect(moved.getHours()).toBe(14);
    expect(moved.getMinutes()).toBe(30);
    expect(moved.getSeconds()).toBe(0);
    expect(moved.getMilliseconds()).toBe(0);
  });

  it("atravessa a virada de mês/ano sem perder o horário", () => {
    const moved = moveKeepingTime("2026-12-31T08:15:00", new Date(2027, 0, 2));
    expect(moved.getFullYear()).toBe(2027);
    expect(moved.getMonth()).toBe(0);
    expect(moved.getDate()).toBe(2);
    expect(moved.getHours()).toBe(8);
    expect(moved.getMinutes()).toBe(15);
  });

  it("não soma 24h: dias de tamanhos diferentes chegam no mesmo horário local", () => {
    // Se a implementação usasse addDays/+86400000 sobre o timestamp, qualquer
    // mudança de offset (horário de verão) deslocaria o horário.
    const a = moveKeepingTime("2026-02-14T23:45:00", new Date(2026, 1, 15));
    expect(a.getHours()).toBe(23);
    expect(a.getMinutes()).toBe(45);
    expect(a.getDate()).toBe(15);
  });
});

// ── Componente: pointerdown no chip + pointerup em outra célula ───────────────

const APPOINTMENT: MonthAppointment = {
  id: "appt-1",
  dateTime: "2026-07-20T14:30:00",
  status: "PENDING",
  durationMinutes: 45,
  patientId: "pat-1",
  patient: { name: "Ana Costa" },
};

function setup() {
  // Como o pai real (`rescheduleAppointment`), devolve uma promise — aqui ela
  // nunca resolve, simulando "tentativa em andamento" (mutação em voo ou modal
  // de bloqueio aberto), quando o chip deve ficar no destino.
  const onReschedule = vi.fn<
    (id: string, newStart: Date, newDurationMinutes: number) => Promise<void>
  >(() => new Promise<void>(() => {}));
  const onSelectAppointment = vi.fn<(appointment: MonthAppointment) => void>();
  const onSelectDay = vi.fn<(day: Date) => void>();
  const onCreateOnDay = vi.fn<(day: Date) => void>();
  render(
    <MonthView
      month={new Date(2026, 6, 15)}
      appointmentsByDay={{ "2026-07-20": [APPOINTMENT] }}
      googleEventsByDay={{}}
      onSelectDay={onSelectDay}
      onSelectAppointment={onSelectAppointment}
      onCreateOnDay={onCreateOnDay}
      onSelectGoogleEvent={vi.fn()}
      onReschedule={onReschedule}
      getStatusColor={() => "bg-yellow-500/10"}
      getStatusLabel={() => "Pendente"}
    />,
  );
  return { onReschedule, onSelectAppointment, onSelectDay, onCreateOnDay };
}

/** Dispara um evento de ponteiro no window (jsdom não tem PointerEvent). */
function firePointerOnWindow(type: "pointermove" | "pointerup" | "pointercancel", pointerId: number) {
  const ev = new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 });
  Object.defineProperty(ev, "pointerId", { value: pointerId });
  act(() => {
    window.dispatchEvent(ev);
  });
}

function cell(dayKey: string) {
  const el = document.querySelector(`[data-month-day="${dayKey}"]`);
  if (!el) throw new Error(`célula ${dayKey} não encontrada`);
  return el as HTMLElement;
}

// jsdom não faz layout e nem define elementFromPoint → é stubado para simular a
// célula sob o ponteiro (o hit-test real é document.elementFromPoint + closest).
type ElementFromPoint = (x: number, y: number) => Element | null;
type WithEFP = { elementFromPoint?: ElementFromPoint };
let elementFromPoint: ReturnType<typeof vi.fn<ElementFromPoint>>;
function pointerOver(el: HTMLElement) {
  elementFromPoint.mockReturnValue(el);
}

describe("MonthView — arraste entre dias", () => {
  beforeEach(() => {
    elementFromPoint = vi.fn<ElementFromPoint>(() => null);
    (document as unknown as WithEFP).elementFromPoint = elementFromPoint;
  });
  afterEach(() => {
    delete (document as unknown as WithEFP).elementFromPoint;
    vi.restoreAllMocks();
  });

  it("solta em OUTRO dia → reagenda mantendo o horário (não abre a edição)", () => {
    const { onReschedule, onSelectAppointment, onCreateOnDay } = setup();
    const chip = document.querySelector('[data-appointment-id="appt-1"]') as HTMLElement;

    pointerOver(cell("2026-07-25"));
    fireEvent.pointerDown(chip, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 });
    firePointerOnWindow("pointermove", 1);
    firePointerOnWindow("pointerup", 1);

    expect(onSelectAppointment).not.toHaveBeenCalled();
    expect(onReschedule).toHaveBeenCalledTimes(1);
    const [id, newStart, duration] = onReschedule.mock.calls[0];
    expect(id).toBe("appt-1");
    expect(duration).toBe(45);
    expect((newStart as Date).getDate()).toBe(25);
    expect((newStart as Date).getHours()).toBe(14);
    expect((newStart as Date).getMinutes()).toBe(30);

    // O chip é previsto na célula de destino até o refetch (anti-flicker)...
    expect(cell("2026-07-25").querySelector('[data-appointment-id="appt-1"]')).not.toBeNull();
    expect(cell("2026-07-20").querySelector('[data-appointment-id="appt-1"]')).toBeNull();
    // ...e o click sintético pós-arraste NÃO abre o diálogo de agendamento
    // (desde 2026-07-24 o clique na célula CRIA — o clique-fantasma criaria).
    fireEvent.click(cell("2026-07-25"));
    expect(onCreateOnDay).not.toHaveBeenCalled();
  });

  it("solta na MESMA célula → é tap: abre a edição e não reagenda", () => {
    const { onReschedule, onSelectAppointment } = setup();
    const chip = document.querySelector('[data-appointment-id="appt-1"]') as HTMLElement;

    pointerOver(cell("2026-07-20"));
    fireEvent.pointerDown(chip, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 });
    firePointerOnWindow("pointermove", 1);
    firePointerOnWindow("pointerup", 1);

    expect(onReschedule).not.toHaveBeenCalled();
    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
    expect(onSelectAppointment.mock.calls[0][0].id).toBe("appt-1");
  });

  it("pointercancel (scroll no touch) aborta: não reagenda nem edita", () => {
    const { onReschedule, onSelectAppointment } = setup();
    const chip = document.querySelector('[data-appointment-id="appt-1"]') as HTMLElement;

    pointerOver(cell("2026-07-25"));
    fireEvent.pointerDown(chip, { pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 });
    firePointerOnWindow("pointermove", 1);
    firePointerOnWindow("pointercancel", 1);

    expect(onReschedule).not.toHaveBeenCalled();
    expect(onSelectAppointment).not.toHaveBeenCalled();
    // Continua na célula de origem.
    expect(cell("2026-07-20").querySelector('[data-appointment-id="appt-1"]')).not.toBeNull();
  });

  it("tentativa termina sem mudar os dados (cancelou o aviso) → chip VOLTA ao dia de origem", async () => {
    // Regressão: o React Query faz structural sharing — quando nada muda no
    // servidor a referência dos dados é a MESMA, então o efeito que solta o
    // `pending` nunca dispara. O chip só volta porque a grade limpa o `pending`
    // quando a promise do `onReschedule` termina.
    let settle!: () => void;
    const attempt = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const onReschedule = vi.fn<(id: string, newStart: Date, dur: number) => Promise<void>>(
      () => attempt,
    );
    render(
      <MonthView
        month={new Date(2026, 6, 15)}
        appointmentsByDay={{ "2026-07-20": [APPOINTMENT] }}
        googleEventsByDay={{}}
        onSelectDay={vi.fn()}
        onSelectAppointment={vi.fn()}
        onCreateOnDay={vi.fn()}
        onSelectGoogleEvent={vi.fn()}
        onReschedule={onReschedule}
        getStatusColor={() => "bg-yellow-500/10"}
        getStatusLabel={() => "Pendente"}
      />,
    );
    const chip = document.querySelector('[data-appointment-id="appt-1"]') as HTMLElement;
    pointerOver(cell("2026-07-25"));
    fireEvent.pointerDown(chip, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 });
    firePointerOnWindow("pointermove", 1);
    firePointerOnWindow("pointerup", 1);

    // Enquanto a decisão está em aberto (ex.: modal de bloqueio), fica no destino.
    expect(cell("2026-07-25").querySelector('[data-appointment-id="appt-1"]')).not.toBeNull();

    await act(async () => {
      settle();
      await attempt;
    });

    expect(cell("2026-07-20").querySelector('[data-appointment-id="appt-1"]')).not.toBeNull();
    expect(cell("2026-07-25").querySelector('[data-appointment-id="appt-1"]')).toBeNull();
  });

  it("clique na área livre da célula AGENDA naquele dia; número do dia abre o Dia", () => {
    // Mudança de regra 2026-07-24: a célula deixou de drilar para a visão Dia.
    const { onSelectDay, onCreateOnDay } = setup();
    fireEvent.click(cell("2026-07-16"));
    expect(onCreateOnDay).toHaveBeenCalledTimes(1);
    expect((onCreateOnDay.mock.calls[0][0] as Date).getDate()).toBe(16);
    expect(onSelectDay).not.toHaveBeenCalled();

    // O número do dia continua sendo o atalho para a visão Dia.
    const dayNumber = cell("2026-07-16").querySelector("button[aria-label^='Ver ']") as HTMLElement;
    fireEvent.click(dayNumber);
    expect(onSelectDay).toHaveBeenCalledTimes(1);
    expect(onCreateOnDay).toHaveBeenCalledTimes(1); // não duplicou
  });

  it("agendamento retroativo ganha marca de histórico no chip", () => {
    render(
      <MonthView
        month={new Date(2026, 6, 15)}
        appointmentsByDay={{ "2026-07-20": [{ ...APPOINTMENT, retroactive: true }] }}
        googleEventsByDay={{}}
        onSelectDay={vi.fn()}
        onSelectAppointment={vi.fn()}
        onCreateOnDay={vi.fn()}
        onSelectGoogleEvent={vi.fn()}
        onReschedule={vi.fn()}
        getStatusColor={() => ""}
        getStatusLabel={() => "Pendente"}
      />,
    );
    const chip = document.querySelector('[data-appointment-id="appt-1"]') as HTMLElement;
    expect(chip.querySelector("[aria-label='Retroativo']")).not.toBeNull();
    expect(chip.getAttribute("title")).toContain("Retroativo");
  });

  it("chip de evento do Google reporta o clique (antes só drilava para o Dia, onde nada acontecia)", () => {
    const onSelectGoogleEvent = vi.fn<(id: string) => void>();
    const onSelectDay = vi.fn<(day: Date) => void>();
    render(
      <MonthView
        month={new Date(2026, 6, 15)}
        appointmentsByDay={{}}
        googleEventsByDay={{
          "2026-07-20": [
            {
              id: "gcal-1",
              title: "Consulta João",
              start: "2026-07-20T10:00:00",
              end: "2026-07-20T11:00:00",
              allDay: false,
              htmlLink: "https://calendar.google.com/x",
            },
          ],
        }}
        onSelectDay={onSelectDay}
        onSelectAppointment={vi.fn()}
        onCreateOnDay={vi.fn()}
        onSelectGoogleEvent={onSelectGoogleEvent}
        onReschedule={vi.fn()}
        getStatusColor={() => ""}
        getStatusLabel={() => ""}
      />,
    );
    const chip = cell("2026-07-20").querySelector("button[title^='Google Agenda']") as HTMLElement;
    expect(chip).not.toBeNull();
    fireEvent.click(chip);
    expect(onSelectGoogleEvent).toHaveBeenCalledWith("gcal-1");
    // e NÃO faz drill-down (o clique é do evento, não da célula)
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("teclado (Enter/Espaço → click com detail 0) abre a edição", () => {
    const { onSelectAppointment, onSelectDay } = setup();
    const chip = document.querySelector('[data-appointment-id="appt-1"]') as HTMLElement;
    fireEvent.click(chip, { detail: 0 });
    expect(onSelectAppointment).toHaveBeenCalledTimes(1);
    // e não propaga para o drill-down da célula.
    expect(onSelectDay).not.toHaveBeenCalled();
  });
});
