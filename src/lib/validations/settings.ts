import { z } from "zod"

export const updateSettingsSchema = z.object({
  clinicName: z.string().min(3, "Nome da clínica deve ter pelo menos 3 caracteres").max(200).optional(),
  confirmationHoursBefore: z.number().int().min(1).max(168).optional(),
  reminderHoursBefore: z.number().int().min(1).max(168).optional(),
  confirmationMessage: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres").max(1000, "Mensagem deve ter no máximo 1000 caracteres").optional(),
  reminderMessage: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres").max(1000, "Mensagem deve ter no máximo 1000 caracteres").optional(),
  avgAppointmentValue: z.number().min(0, "Valor não pode ser negativo").optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
