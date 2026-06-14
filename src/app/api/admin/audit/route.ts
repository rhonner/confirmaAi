import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";
import { actionLabel } from "@/lib/audit/labels";

// Painel admin (Sprint 10). Gated por allowlist de email (ADMIN_EMAILS).
// Cross-tenant de propósito — só admins chegam aqui (gate no layout + aqui).
export const dynamic = "force-dynamic";

const AUDIT_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  actorType: true,
  tenantUserId: true,
  entityType: true,
} as const;

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    if (!isAdminEmail(session.user.email)) return forbiddenResponse();

    const [connected, withInstance, totalUsers, paidActive, fraudRows, recentRows] =
      await Promise.all([
        prisma.user.count({ where: { whatsappStatus: "CONNECTED" } }),
        prisma.user.count({ where: { evolutionInstanceName: { not: null } } }),
        prisma.user.count(),
        prisma.subscription.count({
          where: { plan: { in: ["PRO", "PREMIUM"] }, status: "ACTIVE" },
        }),
        prisma.auditLog.findMany({
          where: { action: { in: ["fraud.cpf_reused_owner", "signup.cpf_dedup_warning"] } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: AUDIT_SELECT,
        }),
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          select: AUDIT_SELECT,
        }),
      ]);

    const whatsappConnectedPct =
      withInstance > 0 ? Math.round((connected / withInstance) * 100) : 0;

    const mapRow = (r: (typeof recentRows)[number]) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      label: actionLabel(r.action),
      actorType: r.actorType,
      tenantUserId: r.tenantUserId,
      entityType: r.entityType,
    });

    return NextResponse.json({
      data: {
        metrics: {
          whatsappConnectedPct,
          whatsappConnected: connected,
          whatsappWithInstance: withInstance,
          totalUsers,
          paidActive,
        },
        fraudCases: fraudRows.map(mapRow),
        recent: recentRows.map(mapRow),
      },
    });
  } catch {
    return serverErrorResponse();
  }
}
