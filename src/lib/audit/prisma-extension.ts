import { Prisma } from "@/generated/prisma/client";
import { audit, shallowDiff } from "./log";

/**
 * Modelos cujas mutações são auditadas automaticamente. Não inclui:
 * - `AuditLog` (recursão).
 * - `MessageLog` (já é uma event-table de domínio; não precisa de diff).
 * - `BillingEvent` (idem).
 */
const AUDITED_MODELS = new Set<string>([
  "Patient",
  "Appointment",
  "Settings",
  "User",
  "Subscription",
]);

const ACTION_BY_OP: Record<string, string> = {
  create: "create",
  createMany: "create_many",
  update: "update",
  updateMany: "update_many",
  upsert: "upsert",
  delete: "delete",
  deleteMany: "delete_many",
};

/**
 * Resolve `tenantUserId` para um registro auditável. Se o modelo é `User`,
 * o próprio `id` é o tenant. Caso contrário, usa o campo `userId` se existir.
 */
function resolveTenantUserId(model: string, record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  if (model === "User" && typeof r.id === "string") return r.id;
  if (typeof r.userId === "string") return r.userId;
  return null;
}

/**
 * Remove campos sensíveis antes de gravar `before/after` em AuditLog.
 * Ex: nunca logar password hash.
 */
const REDACTED_FIELDS = new Set([
  "password",
  "lastQrcodeBase64",
  // Preemptivo: campos que entrarão no schema em sprints futuros (Sprint 2 — quota).
  "cpf",
  "cpfHash",
  "identifierHash",
  // Sexo e identidade de gênero (2026-07-24): sexo em contexto de clínica é dado
  // de SAÚDE e identidade de gênero é plausivelmente sensível (LGPD art. 5º, II);
  // o AuditLog é append-only por trigger — o valor gravado aqui é IRREVERSÍVEL. A trilha continua registrando QUE o campo mudou, sem guardar
  // o conteúdo. `birthDate` fica visível de propósito: não é categoria sensível
  // e é justamente o que se quer auditar numa edição acidental.
  "sex",
  "gender",
  "genderSelfDescribed",
]);

/**
 * Redige os valores sensíveis de um diff JÁ CALCULADO, preservando as CHAVES.
 * É o que mantém a informação útil ("o CPF mudou", "o gênero mudou") sem
 * imortalizar o valor num AuditLog append-only.
 */
function redactDiff<T extends Record<string, unknown>>(diff: {
  before: Partial<T>;
  after: Partial<T>;
}): { before: Partial<T>; after: Partial<T> } {
  return {
    before: (redact(diff.before as Record<string, unknown>) ?? {}) as Partial<T>,
    after: (redact(diff.after as Record<string, unknown>) ?? {}) as Partial<T>,
  };
}

function redact<T extends Record<string, unknown>>(obj: T | null | undefined): T | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

type ModelDelegate = {
  findUnique: (args: { where: unknown }) => Promise<unknown>;
  findFirst: (args: { where?: unknown }) => Promise<unknown>;
  findMany: (args: { where?: unknown }) => Promise<unknown[]>;
};

/**
 * Extension que intercepta create/update/delete/upsert em modelos auditáveis
 * e grava AuditLog com diff. Auditoria nunca lança — falhas são logadas no
 * console mas não interrompem o fluxo (ver `audit/log.ts`).
 */
export const auditExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: "audit",
    query: {
      $allModels: {
        async create({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const result = await query(args);
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            entityId: getId(result),
            tenantUserId: resolveTenantUserId(model, result),
            after: redact(result as Record<string, unknown>),
          });
          return result;
        },

        async update({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const before = await readOne(client as never, model, args.where);
          const result = await query(args);
          // DIFF-then-REDACT (corrigido em 2026-07-24). Redigir ANTES do diff
          // fazia `"[REDACTED]" === "[REDACTED]"` e o `shallowDiff` DESCARTAVA a
          // chave: a trilha de uma troca de CPF/gênero ficava vazia, em vez de
          // registrar QUE o campo mudou. Agora o diff enxerga os valores reais
          // (só em memória) e a redação acontece depois, sobre o resultado.
          const diff = redactDiff(
            shallowDiff(
              before as Record<string, unknown> | undefined,
              result as Record<string, unknown> | undefined,
            ),
          );
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            entityId: getId(result) ?? getId(before),
            tenantUserId:
              resolveTenantUserId(model, result) ?? resolveTenantUserId(model, before),
            before: diff.before,
            after: diff.after,
          });
          return result;
        },

        async upsert({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const before = await readOne(client as never, model, args.where);
          const result = await query(args);
          const diff = redactDiff(
            shallowDiff(
              before as Record<string, unknown> | undefined,
              result as Record<string, unknown> | undefined,
            ),
          );
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            entityId: getId(result),
            tenantUserId: resolveTenantUserId(model, result),
            before: before ? diff.before : undefined,
            after: result ? diff.after : undefined,
            metadata: { wasInsert: !before },
          });
          return result;
        },

        async delete({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const before = await readOne(client as never, model, args.where);
          const result = await query(args);
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            entityId: getId(before) ?? getId(result),
            tenantUserId: resolveTenantUserId(model, before),
            before: redact(before as Record<string, unknown>),
          });
          return result;
        },

        async createMany({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const result = await query(args);
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            metadata: {
              count: (result as { count?: number })?.count ?? null,
              args: redactArgs(args),
            },
          });
          return result;
        },

        async updateMany({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const result = await query(args);
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            metadata: {
              count: (result as { count?: number })?.count ?? null,
              args: redactArgs(args),
            },
          });
          return result;
        },

        async deleteMany({ model, operation, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const result = await query(args);
          await audit({
            action: `${camelize(model)}.${ACTION_BY_OP[operation]}`,
            entityType: model,
            metadata: {
              count: (result as { count?: number })?.count ?? null,
              args: redactArgs(args),
            },
          });
          return result;
        },
      },
    },
  });
});

function getId(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const id = (record as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function camelize(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function redactArgs(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  const a = args as Record<string, unknown>;
  const out: Record<string, unknown> = { ...a };
  if (out.data && typeof out.data === "object" && !Array.isArray(out.data)) {
    out.data = redact(out.data as Record<string, unknown>);
  }
  return out;
}

async function readOne(
  client: { [k: string]: ModelDelegate },
  model: string,
  where: unknown,
): Promise<unknown> {
  const delegateName = camelize(model);
  const delegate = client[delegateName];
  if (!delegate) return null;
  try {
    if (where && typeof where === "object" && "id" in (where as Record<string, unknown>)) {
      return await delegate.findUnique({ where });
    }
    return await delegate.findFirst({ where });
  } catch {
    return null;
  }
}
