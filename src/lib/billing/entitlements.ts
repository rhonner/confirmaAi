import { prisma } from "@/lib/prisma";
import { PLANS } from "./plans";
import { allIdentifiers } from "./identifiers";
import type { PlanTier, Subscription } from "@/generated/prisma/client";
import type { PatientIdentifierInput } from "./quota";

/** Ações que podem ser gateadas pelo plano. */
export type Action =
  | "patient.create"
  | "patient.import"
  | "appointment.create"
  | "message.send"
  | "export.csv"
  | "report.advanced";

export type DenyReason =
  | "QUOTA_EXCEEDED"
  | "PLAN_REQUIRED"
  | "PAYMENT_PAST_DUE"
  | "SUSPENDED"
  | "CPF_REQUIRED"
  | "EMAIL_NOT_VERIFIED";

export type Allow = { allowed: true };
export type Deny = {
  allowed: false;
  reason: DenyReason;
  upgrade?: "PRO" | "PREMIUM";
  current?: number;
  limit?: number;
};
export type Decision = Allow | Deny;

/**
 * Verifica se uma ação é permitida para o user no estado atual de assinatura.
 *
 * **Não atomiza** com a operação subsequente (race possível). Para
 * `patient.create`, o gate definitivo está dentro de `reservePatientSlot`
 * (Serializable). Esta função serve para feedback rápido na UI e para
 * curto-circuitar antes do trabalho pesado.
 */
export async function check(
  userId: string,
  action: Action,
  ctx?: { identifier?: PatientIdentifierInput },
): Promise<Decision> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const planTier: PlanTier = sub?.plan ?? "FREE";
  const plan = PLANS[planTier];

  // Status overrides (independente da action).
  const statusGate = checkStatus(sub);
  if (statusGate) return statusGate;

  // Email não verificado bloqueia ações de criação (Sprint 4).
  if (action === "patient.create" || action === "patient.import" || action === "appointment.create") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (user && user.emailVerifiedAt === null) {
      return { allowed: false, reason: "EMAIL_NOT_VERIFIED" };
    }
  }

  switch (action) {
    case "patient.create":
    case "patient.import":
    case "appointment.create": {
      // Free obriga CPF.
      if (planTier === "FREE" && (!ctx?.identifier?.cpf || ctx.identifier.cpf.trim() === "")) {
        return { allowed: false, reason: "CPF_REQUIRED", upgrade: "PRO" };
      }

      if (plan.patientSlots === null) return { allowed: true };

      // Se identifier conhecido, slot existente reaproveita (não consome vaga) → permite.
      if (ctx?.identifier) {
        const candidates = allIdentifiers(ctx.identifier);
        if (candidates.length > 0) {
          const existing = await prisma.patientQuotaSlot.findFirst({
            where: { userId, identifierHash: { in: candidates.map((c) => c.hash) } },
          });
          if (existing) return { allowed: true };
        }
      }

      const current = await prisma.patientQuotaSlot.count({ where: { userId } });
      if (current >= plan.patientSlots) {
        return {
          allowed: false,
          reason: "QUOTA_EXCEEDED",
          upgrade: "PRO",
          current,
          limit: plan.patientSlots,
        };
      }
      return { allowed: true };
    }

    case "message.send": {
      const { getCurrentUsage } = await import("./usage");
      const usage = await getCurrentUsage(userId);
      if (usage.messagesSent >= usage.messagesIncluded) {
        return {
          allowed: false,
          reason: "QUOTA_EXCEEDED",
          upgrade: planTier === "FREE" ? "PRO" : "PREMIUM",
          current: usage.messagesSent,
          limit: usage.messagesIncluded,
        };
      }
      return { allowed: true };
    }

    case "export.csv":
      return plan.features.exportCsv
        ? { allowed: true }
        : { allowed: false, reason: "PLAN_REQUIRED", upgrade: "PRO" };

    case "report.advanced":
      return plan.features.advancedReports
        ? { allowed: true }
        : { allowed: false, reason: "PLAN_REQUIRED", upgrade: "PRO" };
  }
}

function checkStatus(sub: Subscription | null): Deny | null {
  if (!sub) return null; // sem subscription = trata como FREE/ACTIVE permissivo
  // Override admin (modo cortesia) bypass status.
  if (sub.adminOverrideUntil && sub.adminOverrideUntil > new Date()) return null;

  switch (sub.status) {
    case "SUSPENDED":
      return { allowed: false, reason: "SUSPENDED", upgrade: "PRO" };
    case "PAST_DUE":
      return { allowed: false, reason: "PAYMENT_PAST_DUE", upgrade: "PRO" };
    default:
      return null;
  }
}
