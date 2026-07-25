"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointment,
  useDeleteAppointment,
  useTimeBlocks,
  useCreateTimeBlock,
  useUpdateTimeBlock,
  useDeleteTimeBlock,
  usePatients,
  useGoogleCalendarEvents,
  useGoogleCalendarStatus,
  useGoogleCalendarConvert,
  useGoogleEventSignals,
  type GcalEvent,
  type TimeBlock,
} from "@/hooks/use-api";
import { parseEventSignals } from "@/lib/services/google/promote-signals";
import { isRetroactive } from "@/lib/retroactive";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PatientCombobox } from "@/components/forms/patient-combobox";
import { PatientFormDialog } from "@/components/forms/patient-form-dialog";
import { TimeSelect } from "@/components/forms/time-select";
import { MonthCalendar, getMonthGridRange } from "@/components/agenda/month-calendar";
import { MonthView } from "@/components/agenda/month-view";
import { DayGrid } from "@/components/agenda/day-grid";
import { Plus, ChevronLeft, ChevronRight, Calendar, CalendarDays, Clock, CalendarPlus, Lock, History } from "lucide-react";
import { ExportCsvButton } from "@/components/billing/export-csv-button";
import { format, startOfWeek, endOfWeek, addWeeks, addMonths, addDays, parseISO, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { getStatusColor, getStatusLabel } from "@/lib/appointment-status";
import { useTerminology } from "@/hooks/use-terminology";

const appointmentSchema = z.object({
  patientId: z.string().min(1, "Selecione um paciente"),
  date: z.string().min(1, "Informe a data"),
  time: z.string().min(1, "Informe o horário"),
  durationMinutes: z.number().int().min(5).max(480),
  notes: z
    .string()
    .max(2000, "Observações devem ter no máximo 2000 caracteres")
    .optional(),
  // Status só é editável ao editar um agendamento existente (novo/promoção
  // nasce PENDING). String livre p/ não rejeitar valores fora da lista de UI
  // (ex.: NOT_CONFIRMED) — a lista exibida garante o valor atual (ver dialogStatusOptions).
  status: z.string().optional(),
});

const NOTES_MAX_LENGTH = 2000;

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];

// Cabeçalho de dia ("sábado, 27 de junho") — usado no label de navegação (modo
// Dia) e no título de cada card; mantém os dois formatos em sincronia.
const DAY_HEADER_FORMAT = "EEEE, dd 'de' MMMM";

type AppointmentForm = z.infer<typeof appointmentSchema>;

const statusOptions = [
  { value: "PENDING", label: "Pendente" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "CANCELED", label: "Cancelado" },
  { value: "NO_SHOW", label: "Faltou" },
];

/**
 * Selo de agendamento RETROATIVO (lançado com data/hora que já passou). Existe
 * porque um registro desses é invisível para a automação — sem esse selo o
 * usuário estranharia a ausência de confirmação por WhatsApp. Título explica.
 */
const RETROACTIVE_HINT =
  "Retroativo: lançado depois da data, só para organizar o histórico. Sem confirmação por WhatsApp e sem falta automática.";

function RetroactiveBadge() {
  return (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-muted-foreground/40 text-muted-foreground"
      title={RETROACTIVE_HINT}
    >
      <History className="h-3 w-3" />
      Retroativo
    </Badge>
  );
}

/**
 * Regra ÚNICA de "este evento do Google pode virar agendamento?" — usada pela
 * lista da Semana (botão "Promover") e pelo clique nas grades Dia/Mês.
 *
 * - **Dia inteiro não promove**: `handleOpenPromote` encaixa a duração numa das
 *   `DURATION_OPTIONS` (máx. 8h), então um evento de 24h viraria um agendamento
 *   de 8h — mentira silenciosa. (Achado de code-review da Fase B.)
 * - **Evento particular não promove**: o título chega redigido ("Ocupado") e
 *   descrição/convidados vêm vazios; não há o que pré-preencher.
 *
 * ⚠️ Decide por `isPrivate` (booleano vindo de `visibility` no mapper), **nunca**
 * por `title !== "Ocupado"`. O rótulo é copy pt-BR: renomeá-lo (trabalho do
 * agente `ux-writer`) faria um placeholder particular virar promovível e o
 * `parseEventSignals` sugerir o próprio rótulo como nome do paciente — criando
 * um paciente "Ocupado" e queimando uma vaga vitalícia de quota.
 */
function canPromoteGoogleEvent(event: { isPrivate: boolean; allDay: boolean }) {
  return !event.allDay && !event.isPrivate;
}

/**
 * Bloco somente-leitura de um evento do Google Calendar (overlay PREMIUM,
 * Fase A). Distinto visualmente (tracejado azul) e sem NENHUMA ação de
 * WhatsApp/status — eventos do Google não entram na tabela Appointment
 * (firewall, ver .context/features/google-calendar.md).
 */
function GoogleEventBlock({
  event,
  canPromote,
  onPromote,
}: {
  event: GcalEvent;
  canPromote?: boolean;
  onPromote?: () => void;
}) {
  const timeLabel = event.allDay
    ? "Dia inteiro"
    : `${format(parseISO(event.start), "HH:mm")} – ${format(parseISO(event.end), "HH:mm")}`;
  const info = (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <div className="flex shrink-0 items-center gap-2 text-sm">
        <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="font-medium">{timeLabel}</span>
      </div>
      <span className="truncate text-sm">{event.title}</span>
    </div>
  );
  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-dashed border-blue-400/40 bg-blue-500/5">
      {/* Botão "Promover" fica FORA do link (link dentro de botão/vice-versa é
          HTML inválido). O link do evento continua abrindo no Google. */}
      {event.htmlLink ? (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          title="Evento do Google Calendar (somente leitura) — abrir no Google"
          className="flex min-w-0 flex-1 items-center rounded transition-opacity hover:opacity-80"
        >
          {info}
        </a>
      ) : (
        <div title="Evento do Google Calendar (somente leitura)" className="flex min-w-0 flex-1">
          {info}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {canPromote && onPromote && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onPromote}
            title="Criar um agendamento a partir deste evento"
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Promover
          </Button>
        )}
        <Badge
          variant="outline"
          className="border-blue-400/50 text-blue-700 dark:text-blue-400"
        >
          Google
        </Badge>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const term = useTerminology();
  const patientWord = term.patient.singular.toLowerCase(); // "paciente" | "cliente"
  const patientsWord = term.patient.plural.toLowerCase();
  const [viewMode, setViewMode] = useState<"week" | "day" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<{
    id: string;
    dateTime: string;
    durationMinutes: number;
    patientId: string;
    notes?: string | null;
    status: string;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [patientFilter, setPatientFilter] = useState<string>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [patientDialogOpen, setPatientDialogOpen] = useState(false);
  // Horário bloqueado (feature TimeBlock): diálogo próprio (criar/editar) e o
  // aviso de sobreposição ao agendar em cima de um bloqueio.
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [blockDate, setBlockDate] = useState("");
  const [blockTime, setBlockTime] = useState("");
  const [blockDuration, setBlockDuration] = useState(60);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockDeleteTarget, setBlockDeleteTarget] = useState<string | null>(null);
  // Modal "horário bloqueado — confirmar?" : proceed aplica a ação; onDismiss
  // reverte (ex.: refetch p/ desfazer um arraste cancelado).
  const [blockedConfirm, setBlockedConfirm] = useState<{
    title: string;
    proceed: () => void | Promise<unknown>;
    onDismiss?: () => void;
  } | null>(null);
  // Promoção de evento do Google (Fase B): quando setado, o diálogo de
  // agendamento entra em "modo promoção" e o submit chama /convert.
  const [promoteEvent, setPromoteEvent] = useState<GcalEvent | null>(null);
  // Pré-preenchimento sugerido para o form de NOVO paciente (sinais do evento).
  const [newPatientDefaults, setNewPatientDefaults] = useState<{ name?: string; phone?: string; email?: string }>({});
  // Espelho de `promoteEvent` para o callback assíncrono dos sinais: o onSuccess
  // captura o estado do momento do disparo, então usamos o ref para saber qual
  // evento está ATIVO quando a resposta chega (evita repovoar defaults de um
  // evento abandonado — ver guard no handleOpenPromote).
  const promoteEventRef = useRef<GcalEvent | null>(null);
  useEffect(() => {
    promoteEventRef.current = promoteEvent;
  }, [promoteEvent]);
  // Mini-calendário (date picker): controle de abertura e do mês exibido.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Lembra a última visão escolhida (Dia/Semana/Mês) entre sessões. Em efeito
  // (não no init do useState) para não divergir do HTML do servidor (hydration).
  useEffect(() => {
    const saved = localStorage.getItem("agenda-view-mode");
    if (saved === "day" || saved === "week" || saved === "month") setViewMode(saved);
  }, []);

  const changeViewMode = (mode: "week" | "day" | "month") => {
    setViewMode(mode);
    try {
      localStorage.setItem("agenda-view-mode", mode);
    } catch {
      // localStorage indisponível (ex: aba privada) — segue sem persistir.
    }
  };

  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(anchorDate, { weekStartsOn: 0 });
  const dayStr = format(anchorDate, "yyyy-MM-dd");
  // Grade de 6 semanas do mês âncora (mesma fonte do mini-calendário) — cobre os
  // dias que "vazam" dos meses vizinhos para a visão Mês não deixar cantos vazios.
  const monthGrid = getMonthGridRange(anchorDate);

  // No modo Dia, busca só o dia âncora (startDate === endDate); no modo Semana,
  // o intervalo de domingo a sábado; no modo Mês, a grade inteira de 6 semanas.
  // A API trata a string yyyy-MM-dd como dia local completo (ver features/appointments.md).
  const rangeStart =
    viewMode === "week"
      ? format(weekStart, "yyyy-MM-dd")
      : viewMode === "month"
        ? format(monthGrid.start, "yyyy-MM-dd")
        : dayStr;
  const rangeEnd =
    viewMode === "week"
      ? format(weekEnd, "yyyy-MM-dd")
      : viewMode === "month"
        ? format(monthGrid.end, "yyyy-MM-dd")
        : dayStr;
  const { data: appointments, isLoading } = useAppointments({
    startDate: rangeStart,
    endDate: rangeEnd,
  });
  // Horários bloqueados da MESMA janela (contexto na agenda + detecção de
  // sobreposição). Sem status/paciente → não passam pelos filtros.
  const { data: timeBlocks } = useTimeBlocks({
    startDate: rangeStart,
    endDate: rangeEnd,
  });

  // Overlay Google Calendar (PREMIUM, Fase A): live-fetch somente-leitura na
  // MESMA janela da agenda. Só consulta quando a conexão existe e o plano
  // permite — para os demais usuários, custo zero além do status (cacheado).
  const { data: gcalStatus } = useGoogleCalendarStatus();
  const gcalEnabled = gcalStatus?.allowed === true && gcalStatus?.status === "CONNECTED";
  const { data: gcalData } = useGoogleCalendarEvents(
    { startDate: rangeStart, endDate: rangeEnd },
    { enabled: gcalEnabled },
  );
  // Grant revogado detectado pelo fetch de eventos → invalida o status
  // cacheado (staleTime 30s) para card e agenda refletirem NEEDS_RECONSENT já.
  const queryClient = useQueryClient();
  const gcalNeedsReconsent = gcalData?.needsReconsent === true;
  useEffect(() => {
    if (gcalNeedsReconsent) {
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
    }
  }, [gcalNeedsReconsent, queryClient]);

  // Filtros de status/paciente não se aplicam a eventos do Google (não têm
  // nem status nem paciente) — com filtro ativo o overlay sai de cena, para
  // não mascarar o "nenhum resultado" nem parecer resultado do filtro.
  const googleEvents = useMemo(
    () =>
      gcalEnabled && statusFilter === "ALL" && patientFilter === "ALL"
        ? (gcalData?.events ?? [])
        : [],
    [gcalEnabled, gcalData, statusFilter, patientFilter],
  );

  // Agrupa por dia, expandindo eventos que atravessam a meia-noite: o Google
  // devolve tudo que INTERSECTA a janela, e agrupar só pelo dia de início
  // sumiria com a manhã de um plantão que começou na véspera. Dia-inteiro tem
  // `end` EXCLUSIVO (convenção do Google); timed recua 1ms para não criar um
  // dia extra quando termina exatamente à meia-noite.
  const googleEventsByDay = useMemo(() => {
    const acc: Record<string, GcalEvent[]> = {};
    for (const event of googleEvents) {
      const start = parseISO(event.start);
      const last = event.allDay
        ? addDays(parseISO(event.end), -1)
        : new Date(parseISO(event.end).getTime() - 1);
      for (const d of eachDayOfInterval({ start, end: last < start ? start : last })) {
        const key = format(d, "yyyy-MM-dd");
        (acc[key] ??= []).push(event);
      }
    }
    return acc;
  }, [googleEvents]);

  // Busca os agendamentos da grade visível do mini-calendário (6 semanas fixas,
  // incluindo os dias "vazando" do mês anterior/seguinte) — só quando ele está
  // aberto (enabled) — para sinalizar com um ponto os dias que têm agendamento.
  const calendarGrid = getMonthGridRange(calendarMonth);
  const { data: monthAppointments } = useAppointments(
    {
      startDate: format(calendarGrid.start, "yyyy-MM-dd"),
      endDate: format(calendarGrid.end, "yyyy-MM-dd"),
    },
    { enabled: calendarOpen },
  );

  // Aplica os MESMOS filtros ativos (status/paciente) da agenda aos pontos —
  // senão o mini-calendário marcaria dias que aparecem vazios na lista filtrada.
  const daysWithAppointments = useMemo(
    () =>
      new Set(
        (monthAppointments ?? [])
          .filter((a) => {
            if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
            if (patientFilter !== "ALL" && a.patientId !== patientFilter) return false;
            return true;
          })
          .map((a) => format(parseISO(a.dateTime), "yyyy-MM-dd")),
      ),
    [monthAppointments, statusFilter, patientFilter],
  );

  const { data: patients } = usePatients();
  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();
  const createBlockMutation = useCreateTimeBlock();
  const updateBlockMutation = useUpdateTimeBlock();
  const deleteBlockMutation = useDeleteTimeBlock();
  const convertMutation = useGoogleCalendarConvert();
  const signalsMutation = useGoogleEventSignals();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
  });

  const watchedDate = watch("date");
  const watchedTime = watch("time");
  const watchedNotes = watch("notes");
  const isPastSchedule = useMemo(() => {
    if (!watchedDate || !watchedTime) return false;
    const dt = new Date(`${watchedDate}T${watchedTime}:00`);
    return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
  }, [watchedDate, watchedTime]);

  const daysToRender = useMemo(() => {
    if (viewMode === "day") return [anchorDate];
    // weekStart/weekEnd derivam de anchorDate (recriados a cada render como
    // novos Date), então memoizamos por [viewMode, anchorDate] e recomputamos
    // o intervalo aqui dentro — assim o memo de fato cacheia.
    return eachDayOfInterval({
      start: startOfWeek(anchorDate, { weekStartsOn: 0 }),
      end: endOfWeek(anchorDate, { weekStartsOn: 0 }),
    });
  }, [viewMode, anchorDate]);

  const filteredAppointments = useMemo(() => {
    if (!appointments) return [];
    return appointments.filter((a) => {
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (patientFilter !== "ALL" && a.patientId !== patientFilter) return false;
      return true;
    });
  }, [appointments, statusFilter, patientFilter]);

  const appointmentsByDay = useMemo(() => {
    return filteredAppointments.reduce((acc, appointment) => {
      const day = format(parseISO(appointment.dateTime), "yyyy-MM-dd");
      if (!acc[day]) acc[day] = [];
      acc[day].push(appointment);
      return acc;
    }, {} as Record<string, typeof filteredAppointments>);
  }, [filteredAppointments]);

  // Bloqueios agrupados pelo dia de início. Não sofrem os filtros de
  // status/paciente (são contexto estrutural da agenda, como a própria grade).
  const blocksByDay = useMemo(() => {
    const acc: Record<string, TimeBlock[]> = {};
    for (const b of timeBlocks ?? []) {
      const day = format(parseISO(b.dateTime), "yyyy-MM-dd");
      (acc[day] ??= []).push(b);
    }
    return acc;
  }, [timeBlocks]);

  // Props do DayGrid (modo Dia) memoizadas: senão `.map()` inline recriaria os
  // arrays a cada render do pai e o efeito de limpeza do `pending` no DayGrid
  // dispararia em QUALQUER re-render (ex.: mutação em voo), desfazendo o
  // anti-flicker (o card voltava ao lugar antigo até o refetch). Assim a
  // referência só muda quando os dados de fato mudam. (code-review 2026-07-24)
  const patientSingular = term.patient.singular;
  const dayGridAppointments = useMemo(
    () =>
      (appointmentsByDay[dayStr] ?? []).map((a) => ({
        id: a.id,
        dateTime: a.dateTime,
        durationMinutes: a.durationMinutes ?? 30,
        patientName: a.patient?.name ?? patientSingular,
        status: a.status,
        retroactive: a.retroactive === true,
      })),
    [appointmentsByDay, dayStr, patientSingular],
  );
  const dayGridBlocks = useMemo(
    () =>
      (blocksByDay[dayStr] ?? []).map((b) => ({
        id: b.id,
        dateTime: b.dateTime,
        durationMinutes: b.durationMinutes,
        title: b.title,
      })),
    [blocksByDay, dayStr],
  );
  const dayGridGoogleEvents = useMemo(
    () =>
      (googleEventsByDay[dayStr] ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
      })),
    [googleEventsByDay, dayStr],
  );

  const hasActiveFilter = statusFilter !== "ALL" || patientFilter !== "ALL";

  const step = (prev: Date, dir: 1 | -1) =>
    viewMode === "week"
      ? addWeeks(prev, dir)
      : viewMode === "month"
        ? addMonths(prev, dir)
        : addDays(prev, dir);

  const handlePrevious = () => setAnchorDate((prev) => step(prev, -1));
  const handleNext = () => setAnchorDate((prev) => step(prev, 1));

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  // Ao abrir o mini-calendário, exibe o mês do dia âncora atual.
  const handleCalendarOpenChange = (open: boolean) => {
    if (open) setCalendarMonth(anchorDate);
    setCalendarOpen(open);
  };

  // Selecionar um dia no mini-calendário reposiciona a agenda (dia/semana/mês).
  const handleSelectDate = (day: Date) => {
    setAnchorDate(day);
    setCalendarOpen(false);
  };

  // Clique num dia na visão Mês → foca aquele dia na visão Dia (drill-down).
  const handleDrillToDay = (day: Date) => {
    setAnchorDate(day);
    changeViewMode("day");
  };

  // Botão "+" de uma célula do mês → novo agendamento já com a data preenchida.
  const handleCreateOnDay = (day: Date) => {
    setPromoteEvent(null);
    setNewPatientDefaults({});
    setSelectedAppointment(null);
    reset({
      patientId: "",
      date: format(day, "yyyy-MM-dd"),
      time: "",
      durationMinutes: 30,
      notes: "",
    });
    setDialogOpen(true);
  };

  const handleOpenDialog = (appointment?: typeof selectedAppointment) => {
    setPromoteEvent(null);
    setNewPatientDefaults({});
    if (appointment) {
      setSelectedAppointment(appointment);
      const appointmentDate = parseISO(appointment.dateTime);
      reset({
        patientId: appointment.patientId,
        date: format(appointmentDate, "yyyy-MM-dd"),
        time: format(appointmentDate, "HH:mm"),
        durationMinutes: appointment.durationMinutes ?? 30,
        notes: appointment.notes || "",
        status: appointment.status,
      });
    } else {
      setSelectedAppointment(null);
      reset({
        patientId: "",
        // No modo Dia, já abre na data que o usuário está vendo (pique Google
        // Agenda); no modo Semana, hoje.
        date: format(viewMode === "day" ? anchorDate : new Date(), "yyyy-MM-dd"),
        time: "",
        durationMinutes: 30,
        notes: "",
      });
    }
    setDialogOpen(true);
  };

  // Abre o diálogo em "modo promoção" a partir de um evento do Google.
  const handleOpenPromote = (event: GcalEvent) => {
    setSelectedAppointment(null);
    setPromoteEvent(event);
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const rawMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    // O <select> só lista DURATION_OPTIONS — encaixa na opção mais próxima.
    const duration =
      Number.isFinite(rawMinutes) && rawMinutes > 0
        ? DURATION_OPTIONS.reduce(
            (best, o) => (Math.abs(o - rawMinutes) < Math.abs(best - rawMinutes) ? o : best),
            30,
          )
        : 30;
    // Pré-preenche o nome pelo título já disponível no overlay (instantâneo).
    // `isPrivate` evita sugerir o rótulo redigido como nome do paciente.
    const local = parseEventSignals({ title: event.title, isPrivate: event.isPrivate });
    setNewPatientDefaults({
      name: local.suggestedName,
      phone: local.suggestedPhone,
      email: local.suggestedEmail,
    });
    reset({
      patientId: "",
      date: format(start, "yyyy-MM-dd"),
      time: format(start, "HH:mm"),
      durationMinutes: duration,
      notes: "",
    });
    setDialogOpen(true);
    // Enriquece (telefone/e-mail) com descrição + convidados, de forma assíncrona.
    signalsMutation.mutate(event.id, {
      onSuccess: (res) => {
        // Descarta respostas obsoletas: se o usuário fechou o diálogo ou trocou
        // de evento antes de a busca resolver, os sinais deste evento NÃO podem
        // vazar para os defaults de outro fluxo (ex.: "Novo Agendamento" limpo).
        if (promoteEventRef.current?.id !== event.id) return;
        setNewPatientDefaults((prev) => ({
          name: res.signals.suggestedName ?? prev.name,
          phone: res.signals.suggestedPhone ?? prev.phone,
          email: res.signals.suggestedEmail ?? prev.email,
        }));
      },
    });
  };

  // Clique num evento do Google nas GRADES (Dia/Mês). Antes o clique não fazia
  // NADA no Dia (o bloco era um `div` mudo) e no Mês só drilava para o Dia — ou
  // seja, o evento parecia "morto" (feedback do dono, 2026-07-24).
  // Agora: se dá para promover, abre o diálogo de promoção (a ação útil dentro do
  // app); se não dá (dia inteiro / particular), abre o evento no Google, o único
  // lugar com mais contexto. A lista da Semana segue com o botão "Promover".
  // ⚠️ TODO caminho aqui precisa dar UM feedback: `htmlLink` é `string | null`, e
  // um `if` sem `else` recriaria exatamente o "clico e não acontece nada" que
  // originou esta feature.
  const handleGoogleEventClick = (id: string) => {
    const event = googleEvents.find((e) => e.id === id);
    if (!event) return;
    if (canPromoteGoogleEvent(event)) {
      handleOpenPromote(event);
      return;
    }
    if (event.htmlLink) {
      window.open(event.htmlLink, "_blank", "noopener,noreferrer");
      return;
    }
    toast.info(
      event.allDay
        ? "Evento de dia inteiro do Google. Abra na sua Google Agenda para ver os detalhes."
        : "Evento particular da sua Google Agenda. Abra lá para ver os detalhes.",
    );
  };

  // Primeiro bloqueio que sobrepõe [start, start+dur) — base do aviso de conflito.
  const overlappingBlockFor = (startMs: number, durationMin: number, excludeId?: string) => {
    const endMs = startMs + durationMin * 60000;
    for (const b of timeBlocks ?? []) {
      if (excludeId && b.id === excludeId) continue;
      const bStart = parseISO(b.dateTime).getTime();
      const bEnd = bStart + b.durationMinutes * 60000;
      if (bStart < endMs && bEnd > startMs) return b;
    }
    return null;
  };

  const openNewBlockDialog = (start?: Date) => {
    setSelectedBlock(null);
    const base = start ?? (viewMode === "day" ? anchorDate : new Date());
    setBlockDate(format(base, "yyyy-MM-dd"));
    setBlockTime(start ? format(start, "HH:mm") : "");
    setBlockDuration(60);
    setBlockTitle("");
    setBlockDialogOpen(true);
  };

  const openEditBlockDialog = (block: TimeBlock) => {
    setSelectedBlock(block);
    const dt = parseISO(block.dateTime);
    setBlockDate(format(dt, "yyyy-MM-dd"));
    setBlockTime(format(dt, "HH:mm"));
    setBlockDuration(block.durationMinutes);
    // "Bloqueado" é o default — no campo, mostramos vazio (placeholder) p/ o
    // usuário perceber que é opcional.
    setBlockTitle(block.title === "Bloqueado" ? "" : block.title);
    setBlockDialogOpen(true);
  };

  const handleSubmitBlock = async () => {
    if (!blockDate || !blockTime) return;
    const dateTime = new Date(`${blockDate}T${blockTime}:00`).toISOString();
    const title = blockTitle.trim();
    try {
      if (selectedBlock) {
        await updateBlockMutation.mutateAsync({
          id: selectedBlock.id,
          dateTime,
          durationMinutes: blockDuration,
          title: title || "Bloqueado",
        });
      } else {
        await createBlockMutation.mutateAsync({
          dateTime,
          durationMinutes: blockDuration,
          ...(title ? { title } : {}),
        });
      }
      setBlockDialogOpen(false);
    } catch {
      // toast via mutação
    }
  };

  const handleDeleteBlock = async () => {
    if (blockDeleteTarget) {
      await deleteBlockMutation.mutateAsync(blockDeleteTarget);
      setBlockDeleteTarget(null);
      setBlockDialogOpen(false);
    }
  };

  // Reagenda um agendamento (arraste/resize na grade). Avisa se cair num bloqueio.
  //
  // ⚠️ Contrato com as grades (DayGrid/MonthView): a promise devolvida resolve SÓ
  // quando a tentativa terminou de verdade — mutação + refetch, ou desistência no
  // aviso de bloqueio. As grades usam isso para soltar o `pending` (anti-flicker).
  // Sem isso, no caminho "cancelou"/"erro" NADA muda no servidor e o React Query
  // devolve a MESMA referência de dados (structural sharing) → o efeito que
  // observa as props nunca dispara e o card fica preso na posição arrastada.
  const rescheduleAppointment = (id: string, newStart: Date, newDurationMinutes: number) => {
    // Arrastar para um horário JÁ PASSADO faz o servidor marcar o registro como
    // Retroativo (`isRetroactive` no PUT) — ele SAI do WhatsApp e do controle de
    // faltas. É um efeito grande para um gesto pequeno (ex.: clínica atrasada
    // arrasta o card das 14h para 14h30 às 15h), então avisamos na TRANSIÇÃO —
    // não em todo arraste de um card que já era retroativo. Mesma função pura
    // do servidor, para as duas pontas concordarem.
    const wasRetroactive = appointments?.find((a) => a.id === id)?.retroactive === true;
    const flipsToRetroactive = isRetroactive(newStart) && !wasRetroactive;
    const notifyIfFlipped = () => {
      if (!flipsToRetroactive) return;
      toast.info("Marcado como Retroativo", {
        description:
          "O horário já passou, então isto vira só registro: sem WhatsApp e fora do controle de faltas.",
      });
    };
    const doIt = () =>
      updateMutation
        .mutateAsync({ id, dateTime: newStart.toISOString(), durationMinutes: newDurationMinutes })
        .then(notifyIfFlipped) // só no sucesso; falha cai no catch abaixo
        .catch(() => {}) // erro já é toast na mutação; o refetch abaixo restaura a posição
        .then(() => queryClient.invalidateQueries({ queryKey: ["appointments"] }));
    const overlap = overlappingBlockFor(newStart.getTime(), newDurationMinutes);
    if (overlap) {
      return new Promise<void>((resolve) => {
        setBlockedConfirm({
          title: overlap.title,
          proceed: () => doIt().finally(resolve),
          // Cancelou → refetch p/ a grade devolver o card ao lugar original.
          onDismiss: () =>
            queryClient.invalidateQueries({ queryKey: ["appointments"] }).finally(resolve),
        });
      });
    }
    return doIt();
  };

  const rescheduleBlock = (id: string, newStart: Date, newDurationMinutes: number) =>
    updateBlockMutation
      .mutateAsync({ id, dateTime: newStart.toISOString(), durationMinutes: newDurationMinutes })
      .catch(() => {})
      .then(() => queryClient.invalidateQueries({ queryKey: ["time-blocks"] }));

  // Clique numa área livre da grade → novo agendamento já naquele horário.
  const handleCreateAt = (start: Date) => {
    setPromoteEvent(null);
    setNewPatientDefaults({});
    setSelectedAppointment(null);
    reset({
      patientId: "",
      date: format(start, "yyyy-MM-dd"),
      time: format(start, "HH:mm"),
      durationMinutes: 30,
      notes: "",
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: AppointmentForm) => {
    const dateTime = new Date(`${data.date}T${data.time}:00`).toISOString();

    // Promoção de evento do Google (Fase B) — fluxo próprio, sem aviso de bloqueio.
    if (promoteEvent) {
      try {
        await convertMutation.mutateAsync({
          googleEventId: promoteEvent.id,
          dateTime,
          durationMinutes: data.durationMinutes,
          notes: data.notes,
          patientId: data.patientId,
          snapshot: {
            title: promoteEvent.title,
            startsAt: new Date(promoteEvent.start).toISOString(),
            endsAt: new Date(promoteEvent.end).toISOString(),
            allDay: promoteEvent.allDay,
          },
        });
        setPromoteEvent(null);
        setNewPatientDefaults({});
        setDialogOpen(false);
        reset();
      } catch {
        // toast via mutação
      }
      return;
    }

    const persistAppointment = async () => {
      if (selectedAppointment) {
        // Só enviamos `status` quando o usuário DE FATO mexeu no seletor. Enviar
        // sempre o valor capturado ao abrir a janela sobrescreveria uma mudança
        // feita pelo servidor no meio-tempo (paciente confirma no WhatsApp / cron
        // de no-show), revertendo o status ao editar observações/horário.
        const statusChanged =
          data.status !== undefined && data.status !== selectedAppointment.status;
        await updateMutation.mutateAsync({
          id: selectedAppointment.id,
          patientId: data.patientId,
          dateTime,
          durationMinutes: data.durationMinutes,
          notes: data.notes,
          ...(statusChanged ? { status: data.status } : {}),
        });
      } else {
        await createMutation.mutateAsync({
          patientId: data.patientId,
          dateTime,
          durationMinutes: data.durationMinutes,
          notes: data.notes,
          // Só vai preenchido no retroativo (ver o efeito de `isPastSchedule`);
          // agendamento futuro segue nascendo PENDING pelo default do schema.
          ...(data.status ? { status: data.status } : {}),
        });
      }
      setDialogOpen(false);
      reset();
    };

    // Aviso de horário bloqueado: só quando o horário/duração é novo ou mudou
    // (editar só observações não deve reabrir o aviso). Bloqueio é SUAVE — apenas
    // confirma, não impede.
    const startMs = new Date(dateTime).getTime();
    const scheduleChanged = selectedAppointment
      ? startMs !== parseISO(selectedAppointment.dateTime).getTime() ||
        data.durationMinutes !== selectedAppointment.durationMinutes
      : true;
    const overlap = scheduleChanged
      ? overlappingBlockFor(startMs, data.durationMinutes)
      : null;
    if (overlap) {
      setBlockedConfirm({
        title: overlap.title,
        proceed: async () => {
          try {
            await persistAppointment();
          } catch {
            // toast via mutação
          }
        },
      });
      return;
    }

    try {
      await persistAppointment();
    } catch {
      // toast via mutação
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await deleteMutation.mutateAsync(deleteTarget);
      setDeleteTarget(null);
      setDialogOpen(false);
    }
  };

  // Opções do seletor de Status na janela de edição. Sempre inclui o status
  // atual do agendamento — mesmo fora da lista padrão de UI (ex.: NOT_CONFIRMED)
  // — para o "Atualizar" nunca trocar o status silenciosamente por um default.
  const dialogStatusOptions = useMemo(() => {
    const current = selectedAppointment?.status;
    if (current && !statusOptions.some((s) => s.value === current)) {
      return [{ value: current, label: getStatusLabel(current) }, ...statusOptions];
    }
    // Criando um registro cujo horário JÁ PASSOU: "Pendente" não é um estado
    // possível (o atendimento já aconteceu ou não) e é justamente o que a
    // automação nunca vai resolver num retroativo — deixá-lo disponível seria
    // convidar o usuário a inflar o denominador da taxa de faltas com registros
    // que nunca saem de Pendente. Só os desfechos reais.
    if (!selectedAppointment && isPastSchedule) {
      return statusOptions.filter((s) => s.value !== "PENDING");
    }
    return statusOptions;
  }, [selectedAppointment, isPastSchedule]);

  // Ao criar, quando o horário vira passado o status precisa nascer classificado
  // (default "Confirmado" = compareceu, o caso comum de backfill de histórico);
  // se voltar para o futuro, some do payload e o registro nasce PENDING normal.
  useEffect(() => {
    if (selectedAppointment) return;
    setValue("status", isPastSchedule ? "CONFIRMED" : undefined);
  }, [isPastSchedule, selectedAppointment, setValue]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Gerencie seus agendamentos"
        action={
          <div className="flex flex-wrap gap-2">
            <ExportCsvButton url="/api/appointments/export" />
            <Button variant="outline" onClick={() => openNewBlockDialog()}>
              <Lock className="mr-2 h-4 w-4" />
              Bloquear horário
            </Button>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Agendamento
            </Button>
          </div>
        }
      />

        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) {
              setPromoteEvent(null);
              setNewPatientDefaults({});
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {promoteEvent
                  ? "Promover evento a agendamento"
                  : selectedAppointment
                    ? "Editar Agendamento"
                    : "Novo Agendamento"}
              </DialogTitle>
              <DialogDescription>
                {promoteEvent
                  ? `Vincule "${promoteEvent.title}" a um ${patientWord} para gerenciar por aqui (confirmação por WhatsApp, faltas). O evento sai do overlay.`
                  : selectedAppointment
                    ? "Atualize as informações do agendamento"
                    : "Preencha os dados para criar um novo agendamento"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patientId">{term.patient.singular}</Label>
                <Controller
                  name="patientId"
                  control={control}
                  render={({ field }) => (
                    <PatientCombobox
                      patients={patients}
                      value={field.value}
                      onChange={field.onChange}
                      onCreateNew={() => setPatientDialogOpen(true)}
                      invalid={!!errors.patientId}
                    />
                  )}
                />
                {errors.patientId && (
                  <p className="text-sm text-destructive">
                    {errors.patientId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  {...register("date")}
                />
                {errors.date && (
                  <p className="text-sm text-destructive">
                    {errors.date.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="time">Horário</Label>
                  <Controller
                    name="time"
                    control={control}
                    render={({ field }) => (
                      <TimeSelect
                        id="time"
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.time}
                      />
                    )}
                  />
                  {errors.time && (
                    <p className="text-sm text-destructive">
                      {errors.time.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="durationMinutes">Duração</Label>
                  <select
                    id="durationMinutes"
                    {...register("durationMinutes", { valueAsNumber: true })}
                    className="h-10 w-full rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs transition-all duration-200 outline-none focus-visible:border-primary/50 focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-primary/20"
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d < 60 ? `${d} min` : d === 60 ? "1 hora" : `${d / 60} horas`}
                      </option>
                    ))}
                  </select>
                  {errors.durationMinutes && (
                    <p className="text-sm text-destructive">
                      {errors.durationMinutes.message}
                    </p>
                  )}
                </div>
              </div>
              {/* Agendar no passado é PERMITIDO (registro de organização) — o
                  aviso explica a consequência em vez de só alertar, porque é
                  aqui que o usuário descobre por que não sai WhatsApp. Vale
                  também ao EDITAR: mover para o passado tira da automação. */}
              {!errors.time && isPastSchedule && (
                <p className="text-xs text-amber-600 dark:text-amber-400 -mt-2">
                  Este horário já passou — vai entrar como{" "}
                  <strong>Retroativo</strong>: serve para organizar o histórico,
                  sem confirmação por WhatsApp nem falta automática.
                </p>
              )}

              {/* Status — ao EDITAR (substitui o antigo menu "⋮" por-visão) e
                  também ao CRIAR com horário passado, para o registro retroativo
                  nascer classificado em vez de virar um "Pendente" eterno que a
                  automação nunca resolve e que dilui a taxa de faltas. */}
              {(selectedAppointment || isPastSchedule) && (
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    {...register("status")}
                    className="h-10 w-full rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs transition-all duration-200 outline-none focus-visible:border-primary/50 focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-primary/20"
                  >
                    {dialogStatusOptions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notes">Observações</Label>
                  <span
                    className={`text-xs ${
                      (watchedNotes?.length ?? 0) >= NOTES_MAX_LENGTH
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {watchedNotes?.length ?? 0}/{NOTES_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="notes"
                  placeholder="Observações adicionais..."
                  maxLength={NOTES_MAX_LENGTH}
                  className="max-h-40 resize-none overflow-y-auto"
                  {...register("notes")}
                  aria-invalid={!!errors.notes}
                />
                {errors.notes && (
                  <p className="text-sm text-destructive">{errors.notes.message}</p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {selectedAppointment && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteTarget(selectedAppointment.id)}
                    disabled={isSubmitting}
                    className="sm:mr-auto"
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Salvando..."
                    : promoteEvent
                      ? "Promover"
                      : selectedAppointment
                        ? "Atualizar"
                        : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por status"
          className="h-9 rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          <option value="ALL">Todos os status</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={patientFilter}
          onChange={(e) => setPatientFilter(e.target.value)}
          aria-label={`Filtrar por ${patientWord}`}
          className="h-9 rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 max-w-[220px]"
        >
          <option value="ALL">Todos os {patientsWord}</option>
          {patients?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {hasActiveFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("ALL");
              setPatientFilter("ALL");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* View toggle (Dia/Semana/Mês) + navegação */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Alternador de visão — pique Google Agenda */}
        <div
          role="tablist"
          aria-label="Tipo de visualização da agenda"
          className="inline-flex items-center self-start rounded-lg border border-input/30 bg-input/5 p-0.5"
        >
          {([
            ["day", "Dia"],
            ["week", "Semana"],
            ["month", "Mês"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => changeViewMode(mode)}
              className={`h-8 rounded-md px-4 text-sm font-medium transition-colors cursor-pointer ${
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Navegação de período */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevious}>
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Escolher data no calendário"
                className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium first-letter:uppercase">
                  {viewMode === "week"
                    ? `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`
                    : viewMode === "month"
                      ? format(anchorDate, "MMMM 'de' yyyy", { locale: ptBR })
                      : format(anchorDate, DAY_HEADER_FORMAT, { locale: ptBR })}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <MonthCalendar
                selected={anchorDate}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                datesWithAppointments={daysWithAppointments}
                onSelect={handleSelectDate}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={handleToday}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={handleNext}>
            {viewMode === "week" ? "Próxima" : "Próximo"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Avisos do overlay Google — fora do grid para valerem também no
          empty state (agenda "vazia" com Google fora do ar é falsa segurança). */}
      {gcalEnabled && gcalData?.degraded && (
        <p className="text-xs text-muted-foreground">
          Google Calendar indisponível no momento — eventos do Google podem não
          aparecer.
        </p>
      )}
      {gcalNeedsReconsent && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          A conexão com o Google Agenda expirou —{" "}
          <Link href="/configuracoes" className="underline underline-offset-2">
            reconecte em Configurações
          </Link>{" "}
          para voltar a ver seus eventos.
        </p>
      )}
      {gcalEnabled && gcalData?.truncated && (
        <p className="text-xs text-muted-foreground">
          Sua agenda do Google tem muitos eventos neste período — alguns podem
          não aparecer.
        </p>
      )}

      {/* Mês (grade; arrasta chip entre DIAS, mantendo o horário) · Dia (grade de
          horas; arrasta/estende o HORÁRIO) · Semana (lista) */}
      {viewMode === "month" ? (
        <MonthView
          month={anchorDate}
          appointmentsByDay={appointmentsByDay}
          googleEventsByDay={googleEventsByDay}
          onSelectDay={handleDrillToDay}
          onSelectAppointment={(a) =>
            handleOpenDialog({
              id: a.id,
              dateTime: a.dateTime,
              durationMinutes: a.durationMinutes ?? 30,
              patientId: a.patientId,
              notes: a.notes,
              status: a.status,
            })
          }
          onCreateOnDay={handleCreateOnDay}
          onSelectGoogleEvent={handleGoogleEventClick}
          onReschedule={rescheduleAppointment}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          loading={isLoading}
        />
      ) : viewMode === "day" ? (
        isLoading ? (
          <Skeleton className="h-[600px] w-full rounded-lg" />
        ) : (
          <DayGrid
            day={anchorDate}
            appointments={dayGridAppointments}
            blocks={dayGridBlocks}
            googleEvents={dayGridGoogleEvents}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            onEditAppointment={(id) => {
              const a = (appointmentsByDay[dayStr] ?? []).find((x) => x.id === id);
              if (a)
                handleOpenDialog({
                  id: a.id,
                  dateTime: a.dateTime,
                  durationMinutes: a.durationMinutes ?? 30,
                  patientId: a.patientId,
                  notes: a.notes,
                  status: a.status,
                });
            }}
            onEditBlock={(id) => {
              const b = (blocksByDay[dayStr] ?? []).find((x) => x.id === id);
              if (b) openEditBlockDialog(b);
            }}
            onSelectGoogleEvent={handleGoogleEventClick}
            onCreateAt={handleCreateAt}
            onReschedule={rescheduleAppointment}
            onRescheduleBlock={rescheduleBlock}
          />
        )
      ) : isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, j) => (
                    <div key={j} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredAppointments.length === 0 &&
        googleEvents.length === 0 &&
        (timeBlocks?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <CalendarPlus className="h-16 w-16 text-muted-foreground/50" />
          <div className="text-center">
            <p className="font-medium text-lg">
              {hasActiveFilter
                ? "Nenhum agendamento corresponde aos filtros"
                : "Nenhum agendamento nesta semana"}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasActiveFilter
                ? "Ajuste os filtros ou limpe-os para ver todos."
                : "Agende sua primeira consulta para começar"}
            </p>
          </div>
          {!hasActiveFilter && (
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Agendamento
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {daysToRender.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const dayAppointments = appointmentsByDay[dayKey] || [];
            const dayGoogleEvents = googleEventsByDay[dayKey] || [];
            const dayBlocks = blocksByDay[dayKey] || [];
            // Intercala agendamentos, bloqueios e eventos do Google por horário;
            // blocos de dia inteiro do Google ficam pinados no topo do dia.
            const timedItems = [
              ...dayAppointments.map((appointment) => ({
                kind: "appointment" as const,
                time: parseISO(appointment.dateTime).getTime(),
                appointment,
              })),
              ...dayBlocks.map((block) => ({
                kind: "block" as const,
                time: parseISO(block.dateTime).getTime(),
                block,
              })),
              ...dayGoogleEvents
                .filter((e) => !e.allDay)
                .map((event) => ({
                  kind: "google" as const,
                  time: parseISO(event.start).getTime(),
                  event,
                })),
            ].sort((a, b) => a.time - b.time);
            const allDayGoogleEvents = dayGoogleEvents.filter((e) => e.allDay);
            const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

            return (
              <Card key={dayKey} className={`transition-shadow duration-200 hover:shadow-md ${isToday ? "border-primary" : ""}`}>
                <CardHeader className="px-4 pb-3 sm:px-6">
                  <CardTitle className="text-base flex items-center gap-2">
                    {format(day, DAY_HEADER_FORMAT, { locale: ptBR })}
                    {isToday && (
                      <Badge variant="secondary" className="ml-2">
                        Hoje
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 sm:px-6">
                  {dayAppointments.length === 0 &&
                  dayGoogleEvents.length === 0 &&
                  dayBlocks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum agendamento
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {allDayGoogleEvents.map((event) => (
                        <GoogleEventBlock key={`${event.id}-${dayKey}`} event={event} />
                      ))}
                      {timedItems.map((item) => {
                        if (item.kind === "google") {
                          return (
                            <GoogleEventBlock
                              key={`${item.event.id}-${dayKey}`}
                              event={item.event}
                              canPromote={canPromoteGoogleEvent(item.event)}
                              onPromote={() => handleOpenPromote(item.event)}
                            />
                          );
                        }
                        if (item.kind === "block") {
                          const block = item.block;
                          const start = parseISO(block.dateTime);
                          const end = new Date(start.getTime() + block.durationMinutes * 60000);
                          return (
                            <div
                              key={block.id}
                              onClick={() => openEditBlockDialog(block)}
                              className="flex items-center justify-between gap-2 p-3 rounded-lg border border-zinc-400/50 bg-[repeating-linear-gradient(45deg,rgba(113,113,122,0.12)_0px,rgba(113,113,122,0.12)_6px,transparent_6px,transparent_12px)] hover:bg-accent/40 transition-all duration-200 cursor-pointer"
                              title="Horário bloqueado — clique para editar"
                            >
                              <div className="flex min-w-0 items-center gap-4 flex-1">
                                <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                                  <Lock className="h-4 w-4" />
                                  <span className="font-medium">
                                    {format(start, "HH:mm")}–{format(end, "HH:mm")}
                                  </span>
                                </div>
                                <span className="min-w-0 break-words font-medium text-zinc-700 dark:text-zinc-200">
                                  {block.title}
                                </span>
                              </div>
                              <Badge variant="outline" className="shrink-0 border-zinc-400/50 text-zinc-600 dark:text-zinc-300">
                                Bloqueado
                              </Badge>
                            </div>
                          );
                        }
                        const appointment = item.appointment;
                        return (
                          <div
                            key={appointment.id}
                            onClick={() => handleOpenDialog(appointment)}
                            className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-all duration-200 hover:shadow-sm cursor-pointer"
                          >
                            <div className="flex min-w-0 items-center gap-4 flex-1">
                              <div className="flex shrink-0 items-center gap-2 text-sm">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {format(parseISO(appointment.dateTime), "HH:mm")}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({appointment.durationMinutes ?? 30} min)
                                </span>
                              </div>
                              <span className="min-w-0 break-words font-medium">
                                {appointment.patient?.name}
                              </span>
                            </div>
                            {appointment.retroactive && <RetroactiveBadge />}
                            <Badge className={`${getStatusColor(appointment.status)} shrink-0`}>
                              {getStatusLabel(appointment.status)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Inline Patient Creation */}
      <PatientFormDialog
        open={patientDialogOpen}
        onOpenChange={setPatientDialogOpen}
        defaultValues={newPatientDefaults}
        onSaved={(p) => {
          // Auto-select the newly created patient in the appointment form.
          reset((prev) => ({ ...prev, patientId: p.id }));
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bloquear horário (criar/editar) */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="sm:max-w-[460px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBlock ? "Editar horário bloqueado" : "Bloquear horário"}</DialogTitle>
            <DialogDescription>
              {selectedBlock
                ? "Atualize o período bloqueado."
                : "Reserve um período na agenda (almoço, reunião, folga). Nenhum paciente é agendado e nenhuma confirmação é enviada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blockTitle">Título (opcional)</Label>
              <Input
                id="blockTitle"
                value={blockTitle}
                maxLength={200}
                placeholder="Bloqueado"
                onChange={(e) => setBlockTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blockDate">Data</Label>
              <Input
                id="blockDate"
                type="date"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="blockTime">Horário</Label>
                <TimeSelect id="blockTime" value={blockTime} onChange={setBlockTime} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blockDuration">Duração</Label>
                <select
                  id="blockDuration"
                  value={blockDuration}
                  onChange={(e) => setBlockDuration(Number(e.target.value))}
                  className="h-10 w-full rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs transition-all duration-200 outline-none focus-visible:border-primary/50 focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-primary/20"
                >
                  {[15, 30, 45, 60, 90, 120, 180, 240, 480, 1440].map((d) => (
                    <option key={d} value={d}>
                      {d === 1440 ? "Dia inteiro" : d < 60 ? `${d} min` : d === 60 ? "1 hora" : `${d / 60} horas`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {selectedBlock && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setBlockDeleteTarget(selectedBlock.id)}
                className="sm:mr-auto"
              >
                Excluir
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmitBlock}
              disabled={
                !blockDate ||
                !blockTime ||
                createBlockMutation.isPending ||
                updateBlockMutation.isPending
              }
            >
              {selectedBlock ? "Salvar" : "Bloquear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir bloqueio */}
      <AlertDialog open={!!blockDeleteTarget} onOpenChange={(open) => !open && setBlockDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover bloqueio</AlertDialogTitle>
            <AlertDialogDescription>
              O horário volta a ficar livre. Se você usa a Google Agenda, o evento correspondente também é removido de lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBlock}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aviso: agendando em cima de um horário bloqueado (suave — só confirma) */}
      <AlertDialog
        open={!!blockedConfirm}
        onOpenChange={(open) => {
          // Fechou via ESC/backdrop → trata como "Voltar" (reverte se necessário).
          if (!open && blockedConfirm) {
            blockedConfirm.onDismiss?.();
            setBlockedConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horário bloqueado</AlertDialogTitle>
            <AlertDialogDescription>
              Este horário está reservado como{" "}
              <strong>{blockedConfirm?.title}</strong>. Quer agendar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const dismiss = blockedConfirm?.onDismiss;
                setBlockedConfirm(null);
                dismiss?.();
              }}
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => {
                const proceed = blockedConfirm?.proceed;
                setBlockedConfirm(null);
                proceed?.();
              }}
            >
              Agendar mesmo assim
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
