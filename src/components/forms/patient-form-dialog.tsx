"use client"

import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PhoneInput } from "@/components/ui/phone-input"
import { PHONE_REGEX } from "@/lib/phone"
import { useCreatePatient, useUpdatePatient, useSubscription, PaywallError } from "@/hooks/use-api"
import { useTerminology } from "@/hooks/use-terminology"
import { validateCpf, formatCpf, canonicalizeCpf } from "@/lib/anti-fraud/cpf-validator"
import { ageOn, brToIso, isoToBr, maskBrDate } from "@/lib/birthday"
import { todayIsoInAppTz } from "@/lib/timezone"
import {
  GENDER_OPTIONS,
  GENDER_LABELS,
  GENDER_SELF_DESCRIBED_MAX,
  SEX_OPTIONS,
  SEX_LABELS,
} from "@/lib/gender"
import { PaywallModal, type PaywallReason } from "@/components/billing/paywall-modal"

const cpfFormSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine(
    (value) => {
      if (!value) return true
      return validateCpf(value).valid
    },
    { message: "CPF inválido" },
  )

const patientSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  phone: z.string().regex(PHONE_REGEX, "Informe um celular válido com DDD"),
  cpf: cpfFormSchema,
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  // Guarda o texto MASCARADO "dd/mm/aaaa" (mesma estratégia do CPF formatado
  // neste form). A conversão para a data civil ISO acontece no submit, via
  // `brToIso`. Picker nativo foi descartado: o dono já o rejeitou no horário
  // (ver src/components/forms/time-select.tsx) e para nascimento é pior ainda —
  // ninguém quer navegar um calendário 40 anos para trás.
  birthDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || brToIso(v) !== "", { message: "Data de nascimento inválida" })
    .refine((v) => !v || brToIso(v) <= todayIsoInAppTz(), {
      message: "Data de nascimento não pode ser no futuro",
    }),
  sex: z.string().optional(),
  gender: z.string().optional(),
  genderSelfDescribed: z.string().max(GENDER_SELF_DESCRIBED_MAX).optional(),
  notes: z.string().optional(),
})

type PatientForm = z.infer<typeof patientSchema>

export type ExistingPatient = {
  id: string
  name: string
  phone: string
  cpf?: string | null
  email?: string | null
  birthDate?: string | null
  sex?: string | null
  gender?: string | null
  genderSelfDescribed?: string | null
  notes?: string | null
}

type PatientFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient?: ExistingPatient | null
  /** Pré-preenche o form de CRIAÇÃO (ignorado ao editar um `patient`). Usado
   *  pela promoção do Google Calendar para sugerir nome/telefone do evento. */
  defaultValues?: { name?: string; phone?: string; cpf?: string; email?: string }
  onSaved?: (patient: { id: string; name: string; phone: string }) => void
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  defaultValues,
  onSaved,
}: PatientFormDialogProps) {
  const createMutation = useCreatePatient()
  const updateMutation = useUpdatePatient()
  const subscriptionQuery = useSubscription()
  const isFreeplan = subscriptionQuery.data?.plan === "FREE"
  const term = useTerminology()
  const patientLabel = term.patient.singular // "Paciente" | "Cliente"
  const patientLower = patientLabel.toLowerCase()
  const [paywall, setPaywall] = React.useState<{
    open: boolean
    reason: PaywallReason
    current?: number
    limit?: number
    upgrade: "PRO" | "PREMIUM"
  }>({ open: false, reason: "QUOTA_EXCEEDED", upgrade: "PRO" })

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: "",
      phone: "",
      cpf: "",
      email: "",
      birthDate: "",
      sex: "",
      gender: "",
      genderSelfDescribed: "",
      notes: "",
    },
  })

  // Só a opção "Prefiro me autodescrever" revela o campo de texto livre.
  const watchGender = watch("gender")

  // Lê os defaults via ref: o reset roda só na ABERTURA (deps sem defaultValues).
  // Senão, o enriquecimento assíncrono dos sinais do evento (promoção) criaria
  // um novo objeto e re-resetaria o form aberto, apagando o que o usuário digitou.
  const defaultValuesRef = React.useRef(defaultValues)
  defaultValuesRef.current = defaultValues
  React.useEffect(() => {
    if (open) {
      // Editando: usa os dados do paciente. Criando: usa os defaults sugeridos
      // (ex.: promoção do Google Calendar) ou vazio.
      const dv = defaultValuesRef.current
      reset({
        name: patient?.name ?? dv?.name ?? "",
        phone: patient?.phone ?? dv?.phone ?? "",
        cpf: patient?.cpf ? formatCpf(canonicalizeCpf(patient.cpf)) : dv?.cpf ?? "",
        email: patient?.email ?? dv?.email ?? "",
        birthDate: isoToBr(patient?.birthDate),
        sex: patient?.sex ?? "",
        gender: patient?.gender ?? "",
        genderSelfDescribed: patient?.genderSelfDescribed ?? "",
        notes: patient?.notes ?? "",
      })
    }
  }, [open, patient, reset])

  const onSubmit = async (data: PatientForm) => {
    // CPF é obrigatório no Free para criar (não para editar — grandfathering).
    if (!patient && isFreeplan && !data.cpf) {
      setError("cpf", { type: "server", message: "CPF é obrigatório no plano Free" })
      return
    }

    try {
      const cleaned = {
        ...data,
        cpf: data.cpf ? canonicalizeCpf(data.cpf) : undefined,
        email: data.email || undefined,
        notes: data.notes || undefined,
        // `null` explícito (não `undefined`): limpar um campo tem de chegar ao
        // servidor. `undefined` sai no JSON.stringify e o update ignoraria.
        birthDate: data.birthDate ? brToIso(data.birthDate) : null,
        sex: data.sex || null,
        gender: data.gender || null,
        // Autodescrição só existe acompanhada da opção; o servidor normaliza de
        // novo (defesa em profundidade — ver normalizeGender).
        genderSelfDescribed:
          data.gender === "SELF_DESCRIBED" ? data.genderSelfDescribed || null : null,
      }
      const saved = patient
        ? await updateMutation.mutateAsync({ ...cleaned, id: patient.id })
        : await createMutation.mutateAsync(cleaned)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      if (error instanceof PaywallError) {
        setPaywall({
          open: true,
          reason: error.reason,
          current: error.current,
          limit: error.limit,
          upgrade: error.upgrade,
        })
        return
      }
      const message = error instanceof Error ? error.message : ""
      if (/CPF/i.test(message)) {
        setError("cpf", { type: "server", message })
      } else if (/telefone/i.test(message)) {
        setError("phone", { type: "server", message })
      } else if (/email/i.test(message)) {
        setError("email", { type: "server", message })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{patient ? "Editar" : "Novo"} {patientLabel}</DialogTitle>
          <DialogDescription>
            {patient
              ? `Atualize as informações do ${patientLower}`
              : `Preencha os dados para cadastrar um novo ${patientLower}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patient-name">Nome</Label>
            <Input
              id="patient-name"
              autoComplete="name"
              placeholder="João Silva"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-phone">Telefone (WhatsApp)</Label>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInput
                  id="patient-phone"
                  placeholder="(11) 99999-9999"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.phone}
                />
              )}
            />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Será usado para enviar a confirmação automática.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-cpf">
              CPF{isFreeplan ? "" : " (opcional)"}
            </Label>
            <Controller
              name="cpf"
              control={control}
              render={({ field }) => (
                <Input
                  id="patient-cpf"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const digits = canonicalizeCpf(e.target.value).slice(0, 11)
                    field.onChange(digits.length === 11 ? formatCpf(digits) : digits)
                  }}
                  aria-invalid={!!errors.cpf}
                  disabled={!!patient?.cpf}
                />
              )}
            />
            {errors.cpf ? (
              <p className="text-sm text-destructive">{errors.cpf.message}</p>
            ) : isFreeplan && !patient ? (
              <p className="text-xs text-muted-foreground">
                Obrigatório no plano Free.
              </p>
            ) : patient?.cpf ? (
              <p className="text-xs text-muted-foreground">
                CPF não pode ser alterado após cadastrado. Para corrigir, exclua e recadastre.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-email">Email (opcional)</Label>
            <Input
              id="patient-email"
              type="email"
              autoComplete="email"
              placeholder="paciente@email.com"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Nascimento + sexo + identidade de gênero — TODOS opcionais.
              Nenhum é exigido em nenhum plano; a idade é só um espelho da data
              (ajuda a pegar ano digitado errado). Data civil: o valor do
              <input type="date"> já é "yyyy-MM-dd" e NUNCA vira new Date(). */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="patient-birthdate">Data de nascimento (opcional)</Label>
              <Controller
                name="birthDate"
                control={control}
                render={({ field }) => {
                  const iso = brToIso(field.value ?? "")
                  const age = iso ? ageOn(iso) : null
                  return (
                    <>
                      <Input
                        id="patient-birthdate"
                        inputMode="numeric"
                        placeholder="dd/mm/aaaa"
                        maxLength={10}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(maskBrDate(e.target.value))}
                        aria-invalid={!!errors.birthDate}
                      />
                      {errors.birthDate ? (
                        <p className="text-sm text-destructive">{errors.birthDate.message}</p>
                      ) : age !== null ? (
                        <p className="text-xs text-muted-foreground">{age} anos</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Usada no card de aniversariantes do dia.
                        </p>
                      )}
                    </>
                  )
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-sex">Sexo (opcional)</Label>
              <select
                id="patient-sex"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("sex")}
              >
                <option value="">Não informado</option>
                {SEX_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {SEX_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-gender">Identidade de gênero (opcional)</Label>
            <select
              id="patient-gender"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("gender")}
            >
              <option value="">Não informado</option>
              {GENDER_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {GENDER_LABELS[value]}
                </option>
              ))}
            </select>
            {watchGender === "SELF_DESCRIBED" && (
              <Input
                id="patient-gender-self"
                placeholder="Como você se identifica?"
                maxLength={GENDER_SELF_DESCRIBED_MAX}
                aria-label="Descreva sua identidade de gênero"
                {...register("genderSelfDescribed")}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-notes">Observações (opcional)</Label>
            <Textarea
              id="patient-notes"
              placeholder={`Informações adicionais sobre o ${patientLower}...`}
              rows={3}
              {...register("notes")}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : patient ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <PaywallModal
        open={paywall.open}
        onOpenChange={(open) => setPaywall((p) => ({ ...p, open }))}
        reason={paywall.reason}
        current={paywall.current}
        limit={paywall.limit}
        upgrade={paywall.upgrade}
        variant="hard"
      />
    </Dialog>
  )
}
