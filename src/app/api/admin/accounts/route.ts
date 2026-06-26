import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";
import { hasAdminOverride } from "@/lib/billing";
import type { PlanTier, SubscriptionStatus } from "@/generated/prisma/client";

// Lista cross-tenant de empresas (contas) para o painel admin — alimenta o
// toggle de beta/cortesia. Gated por ADMIN_EMAILS (defense-in-depth com layout).
export const dynamic = "force-dynamic";

export type AdminAccount = {
  userId: string;
  clinicName: string;
  ownerName: string;
  email: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  adminOverride: boolean;
  createdAt: string;
};

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    if (!isAdminEmail(session.user.email)) return forbiddenResponse();

    const [users, subs] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true, clinicName: true, name: true, email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subscription.findMany({
        select: { userId: true, plan: true, status: true, adminOverrideUntil: true },
      }),
    ]);

    const subByUser = new Map(subs.map((s) => [s.userId, s]));

    const accounts: AdminAccount[] = users.map((u) => {
      const s = subByUser.get(u.id);
      return {
        userId: u.id,
        clinicName: u.clinicName,
        ownerName: u.name,
        email: u.email,
        plan: s?.plan ?? "FREE",
        status: s?.status ?? "ACTIVE",
        adminOverride: hasAdminOverride(s),
        createdAt: u.createdAt.toISOString(),
      };
    });

    return NextResponse.json<{ data: { accounts: AdminAccount[] } }>({ data: { accounts } });
  } catch (error) {
    console.error("admin/accounts error:", error);
    return serverErrorResponse();
  }
}
