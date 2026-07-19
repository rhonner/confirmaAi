"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { useTerminology } from "@/hooks/use-terminology";

// Types matching the actual API responses

type Patient = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    appointments: number;
  };
  noShowCount?: number;
};

type Appointment = {
  id: string;
  dateTime: string;
  durationMinutes: number;
  status: string;
  patientId: string;
  userId: string;
  confirmationSentAt?: string | null;
  reminderSentAt?: string | null;
  confirmedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  patient: {
    id: string;
    name: string;
    phone: string;
  };
};

type DashboardStats = {
  totalAppointments: number;
  confirmed: number;
  notConfirmed: number;
  noShow: number;
  canceled: number;
  confirmationRate: number;
  noShowRate: number;
  estimatedLoss: number;
  weeklyData: Array<{
    week: string;
    total: number;
    noShow: number;
    confirmed: number;
  }>;
};

type Settings = {
  id: string;
  userId: string;
  confirmationHoursBefore: number;
  reminderHoursBefore: number;
  confirmationMessage: string;
  reminderMessage: string;
  avgAppointmentValue: number;
  clinicName: string;
  businessType: string | null;
};

/**
 * Erro de paywall (HTTP 402): plano atual não permite a ação. UI captura via
 * `if (err instanceof PaywallError)` e abre modal de upgrade (Sprint 3).
 */
export class PaywallError extends Error {
  constructor(
    public reason: "QUOTA_EXCEEDED" | "PLAN_REQUIRED" | "PAYMENT_PAST_DUE" | "SUSPENDED" | "CPF_REQUIRED" | "EMAIL_NOT_VERIFIED",
    public upgrade: "PRO" | "PREMIUM",
    public uiMessage: string,
    public current?: number,
    public limit?: number,
  ) {
    super(uiMessage);
    this.name = "PaywallError";
  }
}

// Helper to unwrap ApiResponse
async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    // Stale session (e.g., user removed). Sign out and bounce to /login.
    await signOut({ callbackUrl: "/login", redirect: true });
    throw new Error("Sessão expirada");
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 402) {
    const reason = json?.error as PaywallError["reason"];
    const upgrade = (json?.data?.upgrade ?? "PRO") as PaywallError["upgrade"];
    throw new PaywallError(
      reason,
      upgrade,
      json?.message ?? "Recurso bloqueado pelo plano",
      json?.data?.current,
      json?.data?.limit,
    );
  }
  if (!res.ok) {
    throw new Error(json?.error || json?.message || "Erro na requisição");
  }
  return json.data as T;
}

// Patients
export function usePatients(search?: string) {
  return useQuery({
    queryKey: ["patients", search],
    queryFn: () => {
      const url = search
        ? `/api/patients?search=${encodeURIComponent(search)}`
        : "/api/patients";
      return fetchApi<Patient[]>(url);
    },
  });
}

type PaginatedPatients = {
  data: Patient[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

async function fetchPaginated<T>(url: string): Promise<{
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}> {
  const res = await fetch(url);
  if (res.status === 401) {
    await signOut({ callbackUrl: "/login", redirect: true });
    throw new Error("Sessão expirada");
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || "Erro na requisição");
  }
  return { data: json.data, meta: json.meta };
}

export function usePatientsPaginated({
  search,
  page,
  limit = 20,
}: {
  search?: string;
  page: number;
  limit?: number;
}) {
  return useQuery<PaginatedPatients>({
    queryKey: ["patients", "paginated", { search, page, limit }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", String(limit));
      return fetchPaginated<Patient>(`/api/patients?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  const label = useTerminology().patient.singular;

  return useMutation({
    mutationFn: (patient: { name: string; phone: string; email?: string; notes?: string }) =>
      fetchApi<Patient>("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patient),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`${label} criado com sucesso`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  const label = useTerminology().patient.singular;

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; phone?: string; email?: string | null; notes?: string | null }) =>
      fetchApi<Patient>(`/api/patients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`${label} atualizado com sucesso`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();

  const label = useTerminology().patient.singular;

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi<void>(`/api/patients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`${label} excluído com sucesso`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Appointments
export function useAppointments(
  params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    patientId?: string;
  },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["appointments", params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params?.startDate) searchParams.set("startDate", params.startDate);
      if (params?.endDate) searchParams.set("endDate", params.endDate);
      if (params?.status) searchParams.set("status", params.status);
      if (params?.patientId) searchParams.set("patientId", params.patientId);

      const qs = searchParams.toString();
      const url = `/api/appointments${qs ? `?${qs}` : ""}`;
      return fetchApi<Appointment[]>(url);
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointment: {
      patientId: string;
      dateTime: string;
      durationMinutes?: number;
      notes?: string;
    }) =>
      fetchApi<Appointment>("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointment),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Agendamento criado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string;
      patientId?: string;
      dateTime?: string;
      durationMinutes?: number;
      status?: string;
      notes?: string | null;
    }) =>
      fetchApi<Appointment>(`/api/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Agendamento atualizado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi<void>(`/api/appointments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Agendamento excluído com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Dashboard
export function useDashboard(range: "7d" | "30d" | "month" = "month") {
  return useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => fetchApi<DashboardStats>(`/api/dashboard?range=${range}`),
  });
}

// WhatsApp connection (Evolution API)
type WhatsappStatusResponse = {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "FAILED";
  phoneNumber: string | null;
  connectedAt: string | null;
  qrcodeBase64: string | null;
};

type WhatsappConnectResponse = {
  instanceName: string;
  qrcodeBase64: string | null;
  status: "CONNECTING" | "CONNECTED";
};

export function useWhatsappStatus(refetchInterval: number | false = false) {
  return useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => fetchApi<WhatsappStatusResponse>("/api/whatsapp/status"),
    refetchInterval,
  });
}

export function useWhatsappConnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<WhatsappConnectResponse>("/api/whatsapp/connect", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useWhatsappDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<{ ok: true }>("/api/whatsapp/disconnect", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
      toast.success("WhatsApp desconectado");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Google Calendar (Fase A — overlay somente-leitura)
export type GcalStatus = {
  configured: boolean;
  allowed: boolean;
  status: "DISCONNECTED" | "CONNECTED" | "NEEDS_RECONSENT";
  googleAccountEmail: string | null;
  connectedAt: string | null;
  /** Fase C: espelhamento app→Google ativo. */
  mirrorActive: boolean;
  /** Fase C: conectado só-leitura (legado) → reconectar p/ ativar espelhamento. */
  needsWriteReconsent: boolean;
};

export type GcalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
};

type GcalEventsResponse = {
  connected: boolean;
  needsReconsent?: boolean;
  degraded?: boolean;
  truncated?: boolean;
  events: GcalEvent[];
};

export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => fetchApi<GcalStatus>("/api/integrations/google-calendar/status"),
    staleTime: 30_000,
  });
}

export function useGoogleCalendarConnect() {
  return useMutation({
    mutationFn: () =>
      fetchApi<{ authUrl: string }>("/api/integrations/google-calendar/connect", {
        method: "POST",
      }),
    onSuccess: (res) => {
      // Navegação real para o consent do Google (cookies de state/PKCE já
      // foram plantados pela resposta do connect).
      window.location.href = res.authUrl;
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useGoogleCalendarDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<{ disconnected: true; revoked: boolean }>(
        "/api/integrations/google-calendar/disconnect",
        { method: "POST" },
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
      queryClient.invalidateQueries({ queryKey: ["gcal-events"] });
      if (res.revoked) {
        toast.success("Google Agenda desconectada");
      } else {
        toast.warning(
          "Desconectado por aqui, mas não foi possível revogar o acesso no Google. Revise em myaccount.google.com/permissions.",
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useGoogleCalendarEvents(
  params: { startDate: string; endDate: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["gcal-events", params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("startDate", params.startDate);
      searchParams.set("endDate", params.endDate);
      return fetchApi<GcalEventsResponse>(
        `/api/integrations/google-calendar/events?${searchParams.toString()}`,
      );
    },
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: 1,
  });
}

// Google Calendar (Fase B — promoção evento → agendamento)
export type GcalPromoteSignals = {
  suggestedPhone?: string;
  suggestedName?: string;
  suggestedEmail?: string;
};

/** Sinais (nome/telefone/e-mail) de um evento para pré-preencher a promoção. */
export function useGoogleEventSignals() {
  return useMutation({
    mutationFn: (eventId: string) =>
      fetchApi<{ signals: GcalPromoteSignals; isPrivate: boolean }>(
        "/api/integrations/google-calendar/event-signals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        },
      ),
  });
}

export type GcalPromotePayload = {
  googleEventId: string;
  calendarId?: string;
  dateTime: string;
  durationMinutes?: number;
  notes?: string | null;
  patientId?: string;
  patient?: {
    name: string;
    phone: string;
    cpf?: string | null;
    email?: string | null;
    notes?: string | null;
  };
  snapshot: {
    title: string;
    startsAt: string;
    endsAt?: string | null;
    allDay?: boolean;
    googleStatus?: string | null;
  };
};

/** Promove um evento do Google a agendamento gerenciado (Fase B). */
export function useGoogleCalendarConvert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GcalPromotePayload) =>
      fetchApi<{
        appointment: Appointment;
        created?: boolean;
        reused?: boolean;
        alreadyPromoted?: boolean;
      }>("/api/integrations/google-calendar/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["gcal-events"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        res.alreadyPromoted ? "Evento já estava promovido" : "Evento promovido a agendamento",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchApi<Settings>("/api/settings"),
  });
}

// Billing / Subscription
export type Subscription = {
  plan: "FREE" | "PRO" | "PREMIUM";
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED";
  patientSlotCount: number;
  patientSlotLimit: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  messagesSent: number;
  messagesIncluded: number;
  canResetFreeAccount: boolean;
};

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: () => fetchApi<Subscription>("/api/billing/subscription"),
    staleTime: 60_000,
  });
}

/** Exclusão de conta (LGPD, soft delete): anonimiza + desloga. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => fetchApi<{ deleted: true }>("/api/account", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Conta excluída.");
      signOut({ callbackUrl: "/login" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Reset de conta Free (1× vitalício): apaga pacientes + zera a quota. */
export function useResetAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<{ patientsDeleted: number; slotsDeleted: number }>("/api/account/reset", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Conta resetada. Suas vagas de paciente foram liberadas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Visão focada em uso, derivada de useSubscription. Mantém uma única chamada
 * de rede mas expõe campos prontos para UI (cor, %, isUnlimited).
 */
export type UsageInfo = {
  plan: Subscription["plan"];
  status: Subscription["status"];
  count: number;
  limit: number | null;
  isUnlimited: boolean;
  percentage: number; // 0–100. Em ilimitado, sempre 0.
  level: "ok" | "warning" | "alert" | "blocked";
  /** Uso de mensagens WhatsApp no período corrente (Sprint 6). */
  messagesSent: number;
  messagesIncluded: number;
  messagesPercentage: number; // 0–100
  messagesLevel: "ok" | "warning" | "alert" | "blocked";
  isLoading: boolean;
};

export function useUsage(): UsageInfo {
  const q = useSubscription();
  const data = q.data;
  const count = data?.patientSlotCount ?? 0;
  const limit = data?.patientSlotLimit ?? null;
  const isUnlimited = limit === null;
  const percentage = isUnlimited
    ? 0
    : Math.min(100, Math.round((count / Math.max(1, limit)) * 100));
  const level: UsageInfo["level"] = isUnlimited
    ? "ok"
    : percentage >= 100
      ? "blocked"
      : percentage >= 80
        ? "alert"
        : percentage >= 60
          ? "warning"
          : "ok";
  const messagesSent = data?.messagesSent ?? 0;
  const messagesIncluded = data?.messagesIncluded ?? 0;
  const messagesPercentage =
    messagesIncluded > 0
      ? Math.min(100, Math.round((messagesSent / messagesIncluded) * 100))
      : 0;
  const messagesLevel: UsageInfo["messagesLevel"] =
    messagesPercentage >= 100
      ? "blocked"
      : messagesPercentage >= 80
        ? "alert"
        : messagesPercentage >= 60
          ? "warning"
          : "ok";
  return {
    plan: data?.plan ?? "FREE",
    status: data?.status ?? "ACTIVE",
    count,
    limit,
    isUnlimited,
    percentage,
    level,
    messagesSent,
    messagesIncluded,
    messagesPercentage,
    messagesLevel,
    isLoading: q.isLoading,
  };
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<Omit<Settings, "id" | "userId">>) =>
      fetchApi<Settings>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Configurações salvas com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ===== Auditoria (Sprint 10) =====

export type ActivityItem = {
  id: string;
  createdAt: string;
  action: string;
  label: string;
  actorType: string;
  entityType: string | null;
};

export function useAccountActivity(page: number) {
  return useQuery({
    queryKey: ["account-activity", page],
    queryFn: () => fetchPaginated<ActivityItem>(`/api/account/activity?page=${page}`),
    placeholderData: (prev) => prev,
  });
}

export type AdminAuditRow = ActivityItem & { tenantUserId: string | null };

export type AdminAuditData = {
  metrics: {
    whatsappConnectedPct: number;
    whatsappConnected: number;
    whatsappWithInstance: number;
    totalUsers: number;
    paidActive: number;
  };
  fraudCases: AdminAuditRow[];
  recent: AdminAuditRow[];
};

export function useAdminAudit() {
  return useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => fetchApi<AdminAuditData>("/api/admin/audit"),
  });
}

export type AdminAccount = {
  userId: string;
  clinicName: string;
  ownerName: string;
  email: string;
  plan: "FREE" | "PRO" | "PREMIUM";
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED";
  adminOverride: boolean;
  createdAt: string;
};

export function useAdminAccounts() {
  return useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => fetchApi<{ accounts: AdminAccount[] }>("/api/admin/accounts"),
  });
}

/** Liga/desliga o override beta (premium cortesia) de uma conta. */
export function useSetBetaOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; enable: boolean }) =>
      fetchApi<{ userId: string; adminOverride: boolean }>("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      toast.success(res.adminOverride ? "Beta ativado (premium cortesia)" : "Beta desativado");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
