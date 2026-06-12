/**
 * Helper de dev: força o contador de mensagens do período corrente de um user.
 * Uso: npx tsx scripts/set-message-usage.ts <email> <messagesSent>
 * Ex.:  npx tsx scripts/set-message-usage.ts rhonner.matheus@gmail.com 600
 *
 * Sempre reverter pra 0 ao fim do teste manual (DoD regra 7).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getCurrentUsage } from "../src/lib/billing/usage";

async function main() {
  const [email, sentArg] = process.argv.slice(2);
  if (!email || sentArg === undefined) {
    console.error("Uso: npx tsx scripts/set-message-usage.ts <email> <messagesSent>");
    process.exit(1);
  }
  const messagesSent = Number(sentArg);
  if (!Number.isInteger(messagesSent) || messagesSent < 0) {
    console.error(`messagesSent inválido: ${sentArg}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User não encontrado: ${email}`);
    process.exit(1);
  }

  // Garante a linha do período corrente (lazy create) e então força o valor.
  const usage = await getCurrentUsage(user.id);
  await prisma.usageCounter.update({
    where: { userId_periodStart: { userId: user.id, periodStart: usage.periodStart } },
    data: { messagesSent },
  });
  console.log(
    `OK: ${email} → ${messagesSent}/${usage.messagesIncluded} mensagens no período ${usage.periodStart.toISOString()} – ${usage.periodEnd.toISOString()}`,
  );
  await prisma.$disconnect();
}

main();
