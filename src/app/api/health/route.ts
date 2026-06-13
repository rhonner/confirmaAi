import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/services/health";

// Endpoint público de saúde (Sprint 9). Alvo de uptime monitor externo.
// 200 = saudável; 503 = algo degradou (cron morto, webhook de pagamento
// travado, Evolution down). Sem auth de propósito: o monitor precisa alcançar
// sem credencial. O corpo não expõe PII nem segredo — só sinais agregados.
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runHealthChecks();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
