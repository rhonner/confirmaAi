import { z } from "zod"

const appointmentStatusValues = ["PENDING", "CONFIRMED", "NOT_CONFIRMED", "CANCELED", "NO_SHOW"] as const

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Paciente é obrigatório"),
  dateTime: z.string().datetime("Data/hora inválida"),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  notes: z.string().max(2000, "Observações devem ter no máximo 2000 caracteres").optional().nullable(),
})

export const updateAppointmentSchema = z.object({
  patientId: z.string().min(1, "Paciente é obrigatório").optional(),
  dateTime: z.string().datetime("Data/hora inválida").optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  status: z.enum(appointmentStatusValues).optional(),
  notes: z.string().max(2000, "Observações devem ter no máximo 2000 caracteres").optional().nullable(),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>
