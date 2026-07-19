import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
} from "@/lib/auth-helpers";
import type { ApiResponse } from "@/lib/types/api";

/**
 * Conclui o onboarding: grava o RAMO do negócio (dirige a terminologia da UI)
 * e marca `onboardingCompletedAt`. Depois disso o wizard não aparece mais.
 * O client deve chamar `useSession().update()` para a sessão refletir na hora.
 */
const schema = z.object({
  businessType: z.enum(["HEALTH", "AESTHETICS", "BEAUTY", "FINANCE", "OTHER"]),
});

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return unauthorizedResponse();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequestResponse("Ramo inválido");

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      businessType: parsed.data.businessType,
      onboardingCompletedAt: new Date(),
    },
    select: { businessType: true, onboardingCompletedAt: true },
  });

  return NextResponse.json<ApiResponse<{ businessType: string | null; onboardingCompletedAt: Date | null }>>({
    data: user,
  });
}
