import { z } from "zod"
import { validateCpf } from "@/lib/anti-fraud/cpf-validator"

// E-mail é normalizado (trim + lowercase) em TODA superfície de auth para evitar
// contas duplicadas (User@x.com ≠ user@x.com no índice @unique case-sensitive do
// Postgres) e logins que "não acham" a conta por diferença de caixa. Migration
// `normalize_emails_lowercase` alinha os dados já existentes.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
})

export const registerSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(200, "Nome deve ter no máximo 200 caracteres"),
  email: z.string().trim().toLowerCase().email("Email inválido").max(320, "Email deve ter no máximo 320 caracteres"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").max(128, "Senha deve ter no máximo 128 caracteres"),
  clinicName: z.string().min(3, "Nome da clínica deve ter pelo menos 3 caracteres").max(200, "Nome da clínica deve ter no máximo 200 caracteres"),
  avgAppointmentValue: z.number().min(0, "Valor não pode ser negativo").optional().default(0),
  cpf: z
    .string()
    .min(11, "CPF deve ter 11 dígitos")
    .max(14, "CPF inválido")
    .superRefine((value, ctx) => {
      const r = validateCpf(value)
      if (!r.valid) {
        const message =
          r.reason === "sequential"
            ? "CPF inválido (sequência repetida)"
            : r.reason === "checksum"
              ? "CPF inválido (dígito verificador)"
              : "CPF inválido"
        ctx.addIssue({ code: "custom", message })
      }
    }),
  /** Honeypot — DEVE estar vazio. Se preenchido, é bot. */
  website: z.string().optional().nullable(),
  /** Token reCAPTCHA v3 do front (se configurado). `null` em dev sem chave. */
  recaptchaToken: z.string().optional().nullable(),
  /** Aceite dos Termos — checkbox no front. Backend é tolerante (frontend valida). */
  acceptedTerms: z.unknown().optional(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Token inválido"),
  password: z
    .string()
    .min(6, "Senha deve ter pelo menos 6 caracteres")
    .max(128, "Senha deve ter no máximo 128 caracteres"),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
