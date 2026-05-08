import { AsyncLocalStorage } from "node:async_hooks";
import type { ActorType } from "@/generated/prisma/client";

export type AuditContext = {
  actorType: ActorType;
  actorId?: string | null;
  tenantUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(
  ctx: AuditContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}

export function requireAuditContext(): AuditContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("audit: no context. wrap the call in runWithAuditContext()");
  }
  return ctx;
}

const SYSTEM_CONTEXT: AuditContext = { actorType: "SYSTEM" };

export function getOrSystemContext(): AuditContext {
  return storage.getStore() ?? SYSTEM_CONTEXT;
}
