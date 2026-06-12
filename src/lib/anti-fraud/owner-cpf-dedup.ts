import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/**
 * Detecção cross-tenant de reuso de CPF do dono da clínica.
 *
 * Trigger: depois de criar um `User` com `cpfHash`, conta quantos usuários
 * distintos compartilham esse hash.
 *
 * - count == 1 → ok (essa é a primeira conta com esse CPF).
 * - count > 1 → audit `fraud.cpf_reused_owner` (sinaliza pra revisão admin).
 * - count > 3 → suspende AUTOMATICAMENTE a conta MAIS NOVA (a recém-criada),
 *   audit `subscription.suspended` com reason `cpf_reused_owner_threshold`.
 *
 * Diferença vs detecção em paciente: aqui é fraude legítima (uma pessoa não
 * deveria ter N clínicas), não comportamento normal.
 */

const SUSPEND_THRESHOLD = 3;

export type OwnerCpfDedupResult = {
  count: number;
  flagged: boolean;
  suspended: boolean;
};

export async function detectOwnerCpfReuse(
  newUserId: string,
  cpfHash: string,
): Promise<OwnerCpfDedupResult> {
  const sameCpfUsers = await prisma.user.findMany({
    where: { cpfHash },
    select: { id: true, createdAt: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  const count = sameCpfUsers.length;
  if (count <= 1) return { count, flagged: false, suspended: false };

  // Flag pra admin
  await audit({
    action: "fraud.cpf_reused_owner",
    tenantUserId: newUserId,
    metadata: {
      count,
      accounts: sameCpfUsers.map((u) => ({
        id: u.id,
        createdAt: u.createdAt.toISOString(),
        email: maskEmail(u.email),
      })),
    },
  });

  // Auto-suspend acima do threshold
  if (count > SUSPEND_THRESHOLD) {
    const newest = sameCpfUsers[sameCpfUsers.length - 1];
    if (newest) {
      await prisma.subscription.update({
        where: { userId: newest.id },
        data: { status: "SUSPENDED" },
      });
      await audit({
        action: "subscription.suspended",
        entityType: "Subscription",
        tenantUserId: newest.id,
        metadata: {
          reason: "cpf_reused_owner_threshold",
          threshold: SUSPEND_THRESHOLD,
          count,
        },
      });
      return { count, flagged: true, suspended: true };
    }
  }

  return { count, flagged: true, suspended: false };
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}
