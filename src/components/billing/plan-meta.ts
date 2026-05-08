import type { PlanTier } from "@/generated/prisma/client";

export const PLAN_LABELS: Record<PlanTier, string> = {
  FREE: "Grátis",
  PRO: "Pro",
  PREMIUM: "Premium",
};

export const PLAN_TAGLINES: Record<PlanTier, string> = {
  FREE: "5 pacientes vitalícios. Sem cartão.",
  PRO: "Pacientes ilimitados, 1.000 mensagens/mês, export CSV.",
  PREMIUM: "Tudo do Pro + multi-profissional, NF-e, integração Google Calendar.",
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
