import { NextRequest, NextResponse } from "next/server";
import { runSchedulerJobs } from "@/lib/services/scheduler";

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
    await runSchedulerJobs();
    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] runSchedulerJobs failed:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
