import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { PLANS } from "@/lib/billing";
import type { ApiResponse } from "@/lib/types/api";

export type SubscriptionResponse = {
  plan: "FREE" | "PRO" | "PREMIUM";
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED";
  patientSlotCount: number;
  patientSlotLimit: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const [sub, user] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId: session.user.id } }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { patientSlotCount: true },
      }),
    ]);

    const plan = sub?.plan ?? "FREE";
    const planConfig = PLANS[plan];

    const data: SubscriptionResponse = {
      plan,
      status: sub?.status ?? "ACTIVE",
      patientSlotCount: user?.patientSlotCount ?? 0,
      patientSlotLimit: planConfig.patientSlots,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    };

    return NextResponse.json<ApiResponse<SubscriptionResponse>>({ data });
  } catch (error) {
    console.error("GET billing/subscription error:", error);
    return serverErrorResponse();
  }
}
