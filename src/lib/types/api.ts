import type { User, Patient, Appointment, Settings, MessageLog } from "@/generated/prisma/client"

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
}

export type SettingsResponse = Settings & {
  avgAppointmentValue: number
  clinicName: string
}
