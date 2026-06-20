import type { PlanTier } from "@/generated/prisma/client";

/**
 * Regra do reset de conta Free (1× vitalício).
 *
 * Caso de uso: clínica que cadastrou pacientes só pra testar e travou na quota
 * vitalícia do Free. O reset apaga Patient + PatientQuotaSlot (zera a vaga
 * vitalícia) — por isso é gateado com força:
 *
 * 1. **Só no FREE** — plano pago não tem limite de pacientes pra resetar.
 * 2. **Zero agendamentos** (QUALQUER status) — sinal de não-uso real; qualquer
 *    agendamento já criado (mesmo PENDING/cancelado) bloqueia.
 * 3. **1× vitalício** — dedup via contagem de `AuditLog` (action `account.reset`),
 *    sem coluna nova (mesmo padrão audit-based do resto do projeto).
 *
 * Pura de propósito (sem I/O) — a rota faz as contagens e passa os números aqui;
 * o mesmo helper alimenta o `canResetFreeAccount` exposto na subscription.
 */
export type ResetEligibilityReason = "PLAN_NOT_FREE" | "HAS_APPOINTMENTS" | "ALREADY_RESET";

export type ResetEligibility =
  | { allowed: true }
  | { allowed: false; reason: ResetEligibilityReason };

export function resetEligibility(input: {
  plan: PlanTier;
  appointmentCount: number;
  priorResetCount: number;
}): ResetEligibility {
  if (input.plan !== "FREE") return { allowed: false, reason: "PLAN_NOT_FREE" };
  if (input.appointmentCount > 0) return { allowed: false, reason: "HAS_APPOINTMENTS" };
  if (input.priorResetCount > 0) return { allowed: false, reason: "ALREADY_RESET" };
  return { allowed: true };
}

/** Mensagem PT-BR para cada motivo de bloqueio. */
export function resetBlockMessage(reason: ResetEligibilityReason): string {
  switch (reason) {
    case "PLAN_NOT_FREE":
      return "O reset de conta está disponível apenas no plano Free.";
    case "HAS_APPOINTMENTS":
      return "Não é possível resetar: sua conta já tem agendamentos. O reset é só para contas sem uso real.";
    case "ALREADY_RESET":
      return "Você já utilizou seu reset gratuito de conta (disponível uma única vez).";
  }
}
