/**
 * Configuração dos planos. Fonte única de verdade para preço, limites e
 * features. Atualizar aqui ao mudar política de planos; backend usa via
 * `entitlements`, frontend via `useSubscription`.
 *
 * Preços em **centavos** (BRL). `patientSlots: null` = ilimitado.
 */

import type { PlanTier } from "@/generated/prisma/client";

export type PlanFeatures = {
  exportCsv: boolean;
  advancedReports: boolean;
  multiProfessional: boolean;
  googleCalendar: boolean;
  nfe: boolean;
  api: boolean;
};

export type PlanConfig = {
  tier: PlanTier;
  label: string;
  priceMonthly: number;
  /** Limite total/histórico de pacientes únicos. `null` = ilimitado. */
  patientSlots: number | null;
  /** Mensagens WhatsApp incluídas no ciclo mensal. */
  messagesIncluded: number;
  features: PlanFeatures;
  /** ID do plano no Asaas (Sprint 5). */
  asaasPlanId?: string;
  /**
   * Oculto da UI de venda (/precos, /billing, paywall). O tier continua
   * válido no backend (enum, assinaturas existentes, entitlements).
   * PREMIUM fica oculto até multi-profissional OU Google Calendar existirem
   * de verdade — vender feature inexistente é risco CDC + churn garantido.
   */
  hidden?: boolean;
};

export const PLANS = {
  FREE: {
    tier: "FREE",
    label: "Grátis",
    priceMonthly: 0,
    patientSlots: 5,
    messagesIncluded: 50,
    features: {
      exportCsv: false,
      advancedReports: false,
      multiProfessional: false,
      googleCalendar: false,
      nfe: false,
      api: false,
    },
  },
  PRO: {
    tier: "PRO",
    label: "Pro",
    priceMonthly: 6500,
    patientSlots: null,
    messagesIncluded: 1000,
    features: {
      exportCsv: true,
      advancedReports: true,
      multiProfessional: false,
      googleCalendar: false,
      nfe: false,
      api: false,
    },
    asaasPlanId: process.env.ASAAS_PRO_PLAN_ID,
  },
  PREMIUM: {
    tier: "PREMIUM",
    label: "Premium",
    priceMonthly: 11000,
    patientSlots: null,
    messagesIncluded: 5000,
    hidden: true,
    features: {
      exportCsv: true,
      advancedReports: true,
      multiProfessional: true,
      googleCalendar: true,
      nfe: true,
      api: true,
    },
    asaasPlanId: process.env.ASAAS_PREMIUM_PLAN_ID,
  },
} as const satisfies Record<PlanTier, PlanConfig>;

export function getPlanConfig(tier: PlanTier): PlanConfig {
  return PLANS[tier];
}

/** Tiers visíveis na UI de venda, em ordem de exibição. */
export const VISIBLE_PLAN_TIERS = (Object.keys(PLANS) as PlanTier[]).filter(
  (t) => !getPlanConfig(t).hidden,
);
