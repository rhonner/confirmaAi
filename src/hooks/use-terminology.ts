"use client";

import { useSession } from "next-auth/react";
import { getTerminology, type Terminology } from "@/lib/terminology";
import type { BusinessType } from "@/generated/prisma/client";

/**
 * Terminologia da UI para o ramo do usuário logado (feature Onboarding).
 * Lê `businessType` da sessão (semeado no JWT — ver auth.ts). Atualiza junto com
 * a sessão: após o usuário escolher/mudar o ramo, chame `useSession().update()`.
 *
 * Uso: `const t = useTerminology(); ... {t.patient.plural}` no lugar de "Pacientes".
 */
export function useTerminology(): Terminology {
  const { data: session } = useSession();
  const businessType = (session?.user?.businessType ?? null) as BusinessType | null;
  return getTerminology(businessType);
}
