import type { BusinessType } from "@/generated/prisma/client";

/**
 * Terminologia da UI por RAMO do negócio (feature Onboarding). Ex.: saúde usa
 * "Paciente"; estética/financeiro/salão usam "Cliente". Fonte única — a UI lê
 * daqui (via `useTerminology`/`getTerminology`) em vez de hardcodar "Paciente".
 *
 * ⚠️ Só RÓTULOS de UI mudam. O modelo Prisma `Patient`, as rotas `/api/patients`
 * e a rota `/pacientes` continuam com o nome técnico — não renomear.
 */
export type Terminology = {
  /** Como chamar o cadastrado (Paciente/Cliente). */
  patient: { singular: string; plural: string };
};

const HEALTH: Terminology = {
  patient: { singular: "Paciente", plural: "Pacientes" },
};

const CLIENT: Terminology = {
  patient: { singular: "Cliente", plural: "Clientes" },
};

/**
 * Retorna a terminologia do ramo. HEALTH (ou ainda não escolhido / null) →
 * "Paciente"; qualquer outro ramo → "Cliente". Default conservador = "Paciente"
 * (preserva o comportamento de contas antigas sem `businessType`).
 */
export function getTerminology(businessType?: BusinessType | null): Terminology {
  return businessType && businessType !== "HEALTH" ? CLIENT : HEALTH;
}

/** Rótulos legíveis do ramo p/ o wizard/settings (pt-BR). */
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  HEALTH: "Saúde (clínica, psicólogo, dentista)",
  AESTHETICS: "Estética",
  BEAUTY: "Salão / Beleza",
  FINANCE: "Financeiro / Consultoria",
  OTHER: "Outro",
};
