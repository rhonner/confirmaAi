import { z } from "zod"
import { validateCpf } from "@/lib/anti-fraud/cpf-validator"
import { isValidIsoDate } from "@/lib/birthday"
import { GENDER_SELF_DESCRIBED_MAX } from "@/lib/gender"
import { Gender, Sex } from "@/generated/prisma/client"

const cpfSchema = z
  .string()
  .min(11, "CPF deve ter 11 dígitos")
  .max(14, "CPF inválido")
  .superRefine((value, ctx) => {
    const result = validateCpf(value)
    if (!result.valid) {
      const message =
        result.reason === "sequential"
          ? "CPF inválido (sequência repetida)"
          : result.reason === "checksum"
            ? "CPF inválido (dígito verificador)"
            : "CPF inválido"
      ctx.addIssue({ code: "custom", message })
    }
  })


/**
 * Data de nascimento: **data civil** "yyyy-MM-dd" (string de propósito — ver
 * comentário de `Patient.birthDate` no schema e src/lib/birthday.ts). Valida o
 * calendário de verdade (rejeita 30/02) e recusa data futura ou idade absurda:
 * digitar o ano errado é o erro de digitação mais comum aqui.
 */
const MAX_AGE_YEARS = 130
const birthDateSchema = z
  .string()
  .refine((v) => isValidIsoDate(v), "Data de nascimento inválida")
  .refine((v) => v <= new Date().toISOString().slice(0, 10), "Data de nascimento não pode ser no futuro")
  .refine(
    (v) => Number(v.slice(0, 4)) >= new Date().getUTCFullYear() - MAX_AGE_YEARS,
    "Confira o ano de nascimento",
  )

const sexSchema = z.enum(Sex)
const genderSchema = z.enum(Gender)
const genderSelfDescribedSchema = z
  .string()
  .max(GENDER_SELF_DESCRIBED_MAX, `Descrição deve ter no máximo ${GENDER_SELF_DESCRIBED_MAX} caracteres`)

// Campos novos (2026-07-24) — SEMPRE opcionais: nenhuma tela pode exigir
// nascimento ou identidade de gênero. O servidor normaliza o par
// (gender, genderSelfDescribed) com `normalizeGender`.
const optionalPatientProfile = {
  birthDate: birthDateSchema.optional().nullable(),
  sex: sexSchema.optional().nullable(),
  gender: genderSchema.optional().nullable(),
  genderSelfDescribed: genderSelfDescribedSchema.optional().nullable(),
}

export const createPatientSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(200, "Nome deve ter no máximo 200 caracteres"),
  phone: z.string().regex(/^\+55\d{10,11}$/, "Telefone inválido. Use formato +55XXXXXXXXXXX"),
  cpf: cpfSchema.optional().nullable(),
  email: z.string().email("Email inválido").max(320, "Email deve ter no máximo 320 caracteres").optional().nullable(),
  notes: z.string().max(2000, "Observações devem ter no máximo 2000 caracteres").optional().nullable(),
  ...optionalPatientProfile,
})

export const updatePatientSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(200, "Nome deve ter no máximo 200 caracteres").optional(),
  phone: z.string().regex(/^\+55\d{10,11}$/, "Telefone inválido. Use formato +55XXXXXXXXXXX").optional(),
  cpf: cpfSchema.optional().nullable(),
  email: z.string().email("Email inválido").max(320, "Email deve ter no máximo 320 caracteres").optional().nullable(),
  notes: z.string().max(2000, "Observações devem ter no máximo 2000 caracteres").optional().nullable(),
  ...optionalPatientProfile,
})

export type CreatePatientInput = z.infer<typeof createPatientSchema>
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>
