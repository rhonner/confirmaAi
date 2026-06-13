import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";

/**
 * ⚠️ TEMPORÁRIO — probe de validação do Sentry em produção (Sprint 9).
 * REMOVER após confirmar a captura fim-a-fim. Gated por token de header pra
 * não ser acionável por bots/scanners durante sua breve vida.
 *
 * Valida o que o smoke test local NÃO cobre: que o bundle serverless da Vercel
 * realmente inclui o @sentry/nextjs (tracing do nft) e que o captureError
 * encaminha no runtime de produção. `flushed: true` = Sentry alcançado.
 *
 * Obs: NÃO usar pasta com prefixo "_" — no App Router vira private folder
 * (fora do roteamento). Por isso o path é /api/debug-sentry.
 */
export const dynamic = "force-dynamic";

const PROBE_TOKEN = "s9-sentry-probe-7Kq2mXr";

export async function GET(request: NextRequest) {
  if (request.headers.get("x-debug-token") !== PROBE_TOKEN) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const sentryConfigured = !!process.env.SENTRY_DSN;
  await captureError(
    new Error("[prod-probe] Sprint 9 Sentry verification — safe to ignore"),
    { area: "app", extra: { probe: true } },
  );

  let flushed = false;
  try {
    const Sentry = await import("@sentry/nextjs");
    flushed = await Sentry.flush(5000);
  } catch {
    // sem o pacote no bundle, cai aqui — flushed permanece false
  }

  return NextResponse.json({ sentryConfigured, flushed });
}
