import type { User, Patient, Appointment, Settings, MessageLog, TimeBlock } from "@/generated/prisma/client"

export type ApiResponse<T = unknown> = {
  data?: T
  error?: string
  message?: string
}

export type PaginationMeta = {
  total: number
  page: number
  limit: number
  totalPages: number
}

export type PaginatedResponse<T> = {
  data: T[]
  meta: PaginationMeta
}

export type UserResponse = Omit<User, "password">

export type PatientResponse = Patient & {
  _count?: {
    appointments: number
  }
  noShowCount?: number
}

export type AppointmentResponse = Appointment & {
  patient: Pick<Patient, "id" | "name" | "phone">
  messageLogs?: MessageLog[]
}

// Horário bloqueado (sem paciente). Ver .context/features/time-blocks.md.
export type TimeBlockResponse = TimeBlock

export type DashboardStats = {
  totalAppointments: number
  confirmed: number
  notConfirmed: number
  noShow: number
  canceled: number
  confirmationRate: number
  noShowRate: number
  estimatedLoss: number
  weeklyData: Array<{
    week: string
    total: number
    noShow: number
    confirmed: number
  }>
  /**
   * Aniversariantes (2026-07-24). `birthDate` é DATA CIVIL "yyyy-MM-dd" — o
   * cliente NUNCA deve fazer `new Date(birthDate)` (deslizaria um dia em BRT).
   * `today` = quem faz hoje; `upcoming` = próximos 7 dias, com `inDays`.
   */
  birthdays: {
    today: Array<{ id: string; name: string; phone: string; birthDate: string; age: number | null }>
    upcoming: Array<{ id: string; name: string; phone: string; birthDate: string; inDays: number }>
  }
}

export type SettingsResponse = Settings & {
  avgAppointmentValue: number
  clinicName: string
  businessType: string | null
}
