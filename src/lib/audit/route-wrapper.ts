import type { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth-helpers";
import { runWithAuditContext, type AuditContext } from "./context";

/**
 * Extrai contexto de auditoria de uma NextRequest. Usa session do NextAuth
 * para popular `actorId`/`tenantUserId`. Sem session → ANONYMOUS.
 *
 * **Importante**: chame antes de qualquer interação com Prisma — o ALS
 * propaga via Promise chain.
 */
export async function buildAuditContextFromRequest(
  req: NextRequest,
): Promise<AuditContext> {
  const session = await getAuthSession();
  return {
    actorType: session?.user?.id ? "USER" : "ANONYMOUS",
    actorId: session?.user?.id ?? null,
    tenantUserId: session?.user?.id ?? null,
    ipAddress: extractIp(req),
    userAgent: req.headers.get("user-agent"),
  };
}

/**
 * HOF que envolve um route handler do Next.js (App Router) com contexto
 * de auditoria. Suporta a assinatura padrão `(req, ctx?) => Response`.
 *
 * Exemplo:
 *   export const POST = auditWrap(async (req) => { ... });
 *   export const PUT = auditWrap(async (req, { params }) => { ... });
 */
export function auditWrap<C, R>(
  handler: (req: NextRequest, ctx: C) => Promise<R>,
): (req: NextRequest, ctx: C) => Promise<R> {
  return async (req, ctx) => {
    const auditCtx = await buildAuditContextFromRequest(req);
    return runWithAuditContext(auditCtx, () => handler(req, ctx)) as Promise<R>;
  };
}

/**
 * Variante que força um actorType específico (útil para webhooks/cron).
 * Webhook não tem session, então o caller informa explicitamente.
 */
export function withFixedActor<C, R>(
  actor: Pick<AuditContext, "actorType" | "actorId">,
  handler: (req: NextRequest, ctx: C) => Promise<R>,
): (req: NextRequest, ctx: C) => Promise<R> {
  return async (req, ctx) => {
    const auditCtx: AuditContext = {
      ...actor,
      ipAddress: extractIp(req),
      userAgent: req.headers.get("user-agent"),
    };
    return runWithAuditContext(auditCtx, () => handler(req, ctx)) as Promise<R>;
  };
}

function extractIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}
