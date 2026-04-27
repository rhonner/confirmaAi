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
import { useCreatePatient, useUpdatePatient } from "@/hooks/use-api"

const patientSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  phone: z.string().regex(PHONE_REGEX, "Informe um celular válido com DDD"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
})

type PatientForm = z.infer<typeof patientSchema>

export type ExistingPatient = {
  id: string
  name: string
  phone: string
  email?: string | null
  notes?: string | null
}

type PatientFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient?: ExistingPatient | null
  onSaved?: (patient: { id: string; name: string; phone: string }) => void
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  onSaved,
}: PatientFormDialogProps) {
  const createMutation = useCreatePatient()
  const updateMutation = useUpdatePatient()

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: { name: "", phone: "", email: "", notes: "" },
  })

  React.useEffect(() => {
    if (open) {
      reset({
        name: patient?.name ?? "",
        phone: patient?.phone ?? "",
        email: patient?.email ?? "",
        notes: patient?.notes ?? "",
      })
    }
  }, [open, patient, reset])

  const onSubmit = async (data: PatientForm) => {
    try {
      const cleaned = {
        ...data,
        email: data.email || undefined,
        notes: data.notes || undefined,
      }
      const saved = patient
        ? await updateMutation.mutateAsync({ ...cleaned, id: patient.id })
        : await createMutation.mutateAsync(cleaned)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (/telefone/i.test(message)) {
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
          <DialogTitle>{patient ? "Editar" : "Novo"} Paciente</DialogTitle>
          <DialogDescription>
            {patient
              ? "Atualize as informações do paciente"
              : "Preencha os dados para cadastrar um novo paciente"}
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

          <div className="space-y-2">
            <Label htmlFor="patient-notes">Observações (opcional)</Label>
            <Textarea
              id="patient-notes"
              placeholder="Informações adicionais sobre o paciente..."
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
    </Dialog>
  )
}
