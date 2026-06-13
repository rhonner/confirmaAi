export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Inicializa observabilidade (Sentry se SENTRY_DSN; senão no-op) antes de
    // qualquer outra coisa, pra capturar erros já no boot do scheduler.
    const { initObservability } = await import("./src/lib/observability");
    await initObservability();

    const { startScheduler } = await import("./src/lib/services/scheduler-init");
    startScheduler();
  }
}

// Hook oficial do Next.js 16: captura TODO erro de request no servidor
// (rotas API, RSC, route handlers) num único ponto, com contexto da rota.
// Erros com contexto de tenant ainda são reportados explicitamente nos
// handlers (ex: webhook de billing) via captureError.
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string },
) {
  const { captureError } = await import("./src/lib/observability");
  await captureError(err, {
    area: "request",
    extra: {
      path: request?.path,
      method: request?.method,
      routerKind: context?.routerKind,
      routePath: context?.routePath,
      routeType: context?.routeType,
    },
  });
}
