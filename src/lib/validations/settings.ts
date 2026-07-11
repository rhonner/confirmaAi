import { z } from "zod"
import { stripResponseInstruction } from "@/lib/services/message-template"

// O min(10) vale para o CORPO livre (sem a instrução de resposta, que é anexada
// pelo sistema no envio). Validar o texto já sem a instrução impede que uma
// mensagem só-instrução ("Responda 1 para CONFIRMAR ou 2 para CANCELAR.") passe
// no min do texto bruto e seja persistida vazia. Ver message-template.ts.
const messageBody = (label: string) =>
  z
    .string()
    .max(1000, "Mensagem deve ter no máximo 1000 caracteres")
    .refine((v) => stripResponseInstruction(v).length >= 10, label)

export const updateSettingsSchema = z
  .object({
    clinicName: z.string().min(3, "Nome da clínica deve ter pelo menos 3 caracteres").max(200).optional(),
    confirmationHoursBefore: z.number().int().min(1).max(168).optional(),
    reminderHoursBefore: z.number().int().min(1).max(168).optional(),
    confirmationMessage: messageBody("Mensagem deve ter pelo menos 10 caracteres").optional(),
    reminderMessage: messageBody("Mensagem deve ter pelo menos 10 caracteres").optional(),
    avgAppointmentValue: z
      .number()
      .min(0, "Valor não pode ser negativo")
      .max(99999.99, "Valor máximo é R$ 99.999,99")
      .optional(),
  })
  .refine(
    (d) =>
      d.reminderHoursBefore === undefined ||
      d.confirmationHoursBefore === undefined ||
      d.reminderHoursBefore < d.confirmationHoursBefore,
    {
      message: "Lembrete deve ser enviado depois da confirmação (menor antecedência)",
      path: ["reminderHoursBefore"],
    },
  )

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
