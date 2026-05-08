import { prisma } from "@/lib/prisma";
import { getOrSystemContext, type AuditContext } from "./context";
import type { Prisma } from "@/generated/prisma/client";

export type AuditEventInput = {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  tenantUserId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | null;
  /** Override fields from AsyncLocalStorage (rarely needed). */
  contextOverride?: Partial<AuditContext>;
};

const MAX_JSON_BYTES = 32 * 1024;

function safeJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const serialized = JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      return v;
    });
    if (serialized === undefined) return undefined;
    if (serialized.length > MAX_JSON_BYTES) {
      return { _truncated: true, _preview: serialized.slice(0, 1024) } as Prisma.InputJsonValue;
    }
    return JSON.parse(serialized);
  } catch {
    return { _unserializable: true } as Prisma.InputJsonValue;
  }
}

/**
 * Persiste um evento na trilha de auditoria. Lê actorType/actorId/IP/UA do
 * AsyncLocalStorage. Falhas são suprimidas (auditoria não pode quebrar fluxo).
 */
export async function audit(event: AuditEventInput): Promise<void> {
  const ctx = { ...getOrSystemContext(), ...event.contextOverride };
  try {
    await prisma.auditLog.create({
      data: {
        actorType: ctx.actorType,
        actorId: ctx.actorId ?? null,
        tenantUserId: event.tenantUserId ?? ctx.tenantUserId ?? null,
        action: event.action,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        beforeJson: safeJson(event.before),
        afterJson: safeJson(event.after),
        metadata: safeJson(event.metadata),
      },
    });
  } catch (err) {
    console.error("[audit] failed to persist event", { action: event.action, err });
  }
}

/**
 * Calcula um diff raso de campos alterados entre dois objetos. Retorna pares
 * { before, after } com apenas as chaves cujos valores mudaram.
 */
export function shallowDiff<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  if (!before && after) {
    Object.assign(a, after);
    return { before: b, after: a };
  }
  if (before && !after) {
    Object.assign(b, before);
    return { before: b, after: a };
  }
  if (!before || !after) return { before: b, after: a };

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const bv = (before as Record<string, unknown>)[k];
    const av = (after as Record<string, unknown>)[k];
    if (!shallowEqual(bv, av)) {
      (b as Record<string, unknown>)[k] = bv;
      (a as Record<string, unknown>)[k] = av;
    }
  }
  return { before: b, after: a };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null || b == null) return false;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
