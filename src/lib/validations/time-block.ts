import { z } from "zod"

// Horário bloqueado (sem paciente). Duração até 24h (1440 min) para permitir um
// bloqueio de dia inteiro (ex.: férias, feriado). `title` opcional — o schema
// Prisma aplica o default "Bloqueado" quando omitido.
export const createTimeBlockSchema = z.object({
  dateTime: z.string().datetime("Data/hora inválida"),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  title: z.string().trim().min(1).max(200).optional(),
})

export const updateTimeBlockSchema = z.object({
  dateTime: z.string().datetime("Data/hora inválida").optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  title: z.string().trim().min(1).max(200).optional(),
})

export type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>
export type UpdateTimeBlockInput = z.infer<typeof updateTimeBlockSchema>
