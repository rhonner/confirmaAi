/**
 * Helper de dev: troca o plano de rhonner.matheus@gmail.com para FREE/PRO/PREMIUM.
 * Útil para testar manualmente o fluxo de quota no browser sem precisar
 * criar um novo user de teste.
 *
 * Uso:
 *   npx tsx scripts/toggle-admin-plan.ts FREE
 *   npx tsx scripts/toggle-admin-plan.ts PRO
 *   npx tsx scripts/toggle-admin-plan.ts PREMIUM
 *
 * Após mudar, recarregar a página no browser para o useSubscription pegar
 * o novo estado (TanStack Query staleTime = 60s).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const target = process.argv[2] as "FREE" | "PRO" | "PREMIUM";
  if (!["FREE", "PRO", "PREMIUM"].includes(target)) {
    console.log("uso: tsx scripts/toggle-admin-plan.ts FREE|PRO|PREMIUM");
    process.exit(1);
  }
  const u = await prisma.user.findUnique({ where: { email: "rhonner.matheus@gmail.com" } });
  if (!u) throw new Error("admin not found");
  await prisma.subscription.update({
    where: { userId: u.id },
    data: { plan: target, status: "ACTIVE" },
  });
  console.log(`rhonner.matheus@gmail.com → ${target}/ACTIVE`);
  await prisma.$disconnect();
}
main();
