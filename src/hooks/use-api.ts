"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { toast } from "sonner";

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
};

// Helper to unwrap ApiResponse
async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    // Stale session (e.g., user removed). Sign out and bounce to /login.
    await signOut({ callbackUrl: "/login", redirect: true });
    throw new Error("Sessão expirada");
  }
  const json = await res.json().catch(() => ({}));
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

  return useMutation({
    mutationFn: (patient: { name: string; phone: string; email?: string; notes?: string }) =>
      fetchApi<Patient>("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patient),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Paciente criado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; phone?: string; email?: string | null; notes?: string | null }) =>
      fetchApi<Patient>(`/api/patients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Paciente atualizado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi<void>(`/api/patients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Paciente excluído com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Appointments
export function useAppointments(params?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  patientId?: string;
}) {
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

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchApi<Settings>("/api/settings"),
  });
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
