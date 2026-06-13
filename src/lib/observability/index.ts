/**
 * Captura de erros centralizada (Sprint 9 — observabilidade).
 *
 * Segue o padrão `dev-fallback-without-secrets` do projeto: sem segredo
 * configurado, o sistema funciona em modo degradado em vez de quebrar.
 *
 * - SEM `SENTRY_DSN`  → `console.error` estruturado (capturado pelos logs da
 *   Vercel/VPS). É o estado padrão; nenhuma dependência externa exigida.
 * - COM `SENTRY_DSN`  → encaminha para o Sentry, ADICIONALMENTE ao console.
 *
 * Ligar o Sentry de verdade (opt-in, 1 passo): `npm i @sentry/nextjs` e setar
 * `SENTRY_DSN`. O import é dinâmico e tolerante: se a env estiver setada mas o
 * pacote não instalado, cai no console sem derrubar nada. Mantém o build verde
 * sem arrastar a dependência até o dia em que ela for ligada.
 */

export type CaptureArea = "request" | "cron" | "webhook" | "scheduler" | "app";

export type CaptureContext = {
  area?: CaptureArea;
  /** Dono do recurso afetado — vira `user.id` no Sentry para agrupar por tenant. */
  tenantUserId?: string | null;
  extra?: Record<string, unknown>;
};

function sentryEnabled(): boolean {
  return !!process.env.SENTRY_DSN;
}

// `any` proposital: o pacote pode não estar instalado (opt-in). Specifier em
// variável tipada `string` evita que o TS resolva o módulo em build-time.
let sentry: any;
let initStarted = false;

/** Inicializa o Sentry uma única vez, se habilitado. No-op sem DSN. */
export async function initObservability(): Promise<void> {
  if (initStarted || !sentryEnabled()) return;
  initStarted = true;
  try {
    const spec: string = "@sentry/nextjs";
    const mod = await import(/* webpackIgnore: true */ spec);
    mod.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Só erros — sem APM/tracing (free tier, ruído mínimo).
      tracesSampleRate: 0,
    });
    sentry = mod;
  } catch (err) {
    console.error(
      "[observability] SENTRY_DSN setado mas @sentry/nextjs indisponível; usando console.",
      err,
    );
  }
}

/**
 * Reporta um erro. Sempre loga no stdout; encaminha ao Sentry se habilitado.
 * Nunca lança — observabilidade não pode quebrar o fluxo que a chamou.
 */
export async function captureError(error: unknown, context: CaptureContext = {}): Promise<void> {
  const tag = context.tenantUserId ? ` tenant=${context.tenantUserId}` : "";
  console.error(`[${context.area ?? "app"}]${tag}`, error, context.extra ?? "");

  if (!sentryEnabled()) return;
  try {
    if (!sentry) await initObservability();
    sentry?.captureException(error, {
      tags: { area: context.area ?? "app" },
      user: context.tenantUserId ? { id: context.tenantUserId } : undefined,
      extra: context.extra,
    });
  } catch {
    // engole: o console.error acima já registrou o erro original.
  }
}
