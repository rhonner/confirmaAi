import { NextRequest, NextResponse } from "next/server";
import { runSchedulerJobs } from "@/lib/services/scheduler";
import { audit, runWithAuditContext } from "@/lib/audit";
import { captureError } from "@/lib/observability";

// Trigger endpoint para o Vercel Cron Jobs.
// Vercel injeta `Authorization: Bearer <CRON_SECRET>` em todo cron call;
// rejeitamos qualquer chamada externa.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const stats = await runWithAuditContext(
      { actorType: "SYSTEM", actorId: "cron" },
      async () => {
        const s = await runSchedulerJobs();
        // Heartbeat + telemetria do run (Sprint 6): vira insumo do alerta de
        // "cron morto" e do tuning de time-budget (Sprint 9 — /api/health).
        await audit({ action: "cron.run", metadata: { ...s } });
        return s;
      },
    );
    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    // O cron é desatendido — se ele falha, ninguém vê a não ser pelo alerta.
    await captureError(error, { area: "cron", extra: { route: "/api/cron/run" } });
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
