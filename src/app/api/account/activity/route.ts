import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession, unauthorizedResponse, serverErrorResponse } from "@/lib/auth-helpers";
import { actionLabel } from "@/lib/audit/labels";

// Trilha de auditoria do PRÓPRIO usuário (Sprint 10). Tenant-scoped por
// `tenantUserId` — nunca vaza atividade de outro tenant.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const skip = (page - 1) * PAGE_SIZE;

    const where = { tenantUserId: session.user.id };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip,
        select: {
          id: true,
          createdAt: true,
          action: true,
          actorType: true,
          entityType: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      label: actionLabel(r.action),
      actorType: r.actorType,
      entityType: r.entityType,
    }));

    return NextResponse.json({
      data: items,
      meta: {
        total,
        page,
        limit: PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    });
  } catch {
    return serverErrorResponse();
  }
}
