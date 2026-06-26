import { NextResponse } from "next/server";

// Liveness probe — corte de custo do Neon (compute scale-to-zero).
//
// Prova que a função serverless / o app RESPONDE, SEM tocar no banco. O uptime
// monitor de ALTA frequência (UptimeRobot, a cada 5 min) deve apontar pra CÁ:
// como não há nenhuma query, o ping não reseta o timer de inatividade do Neon,
// então o compute consegue suspender (scale-to-zero) entre as execuções do cron.
//
// Contraste com `GET /api/health` (readiness PROFUNDA): aquele coleta DB + cron +
// billing + Evolution e DEVE ficar num monitor de BAIXA frequência (>= 30 min),
// senão as queries de coleta mantêm o Neon acordado 24/7 e queimam CU-hours.
//
// IMPORTANTE: este handler não pode importar `prisma`/`runHealthChecks` nem nada
// que abra conexão com o Postgres — é justamente o ponto. (Validado no test:sprints 9.7.)
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { status: "ok", check: "live" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
