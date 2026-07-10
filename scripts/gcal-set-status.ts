/**
 * Helper de dev (TESTE): força o status da GoogleCalendarConnection do usuário-seed
 * para CONNECTED | NEEDS_RECONSENT | REVOKED, SEM tocar no token nem revogar no Google.
 *
 * Uso na validação da OAUTH-08 (troca de conta): setar NEEDS_RECONSENT mantendo o
 * refresh token vivo expõe o botão "Reconectar" e permite provar que reconectar com
 * OUTRA conta revoga de fato o grant antigo (branch email-changed do callback).
 *
 * Uso: npx tsx scripts/gcal-set-status.ts NEEDS_RECONSENT
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const target = process.argv[2] as "CONNECTED" | "NEEDS_RECONSENT" | "REVOKED";
  if (!["CONNECTED", "NEEDS_RECONSENT", "REVOKED"].includes(target)) {
    console.log("uso: tsx scripts/gcal-set-status.ts CONNECTED|NEEDS_RECONSENT|REVOKED");
    process.exit(1);
  }
  const u = await prisma.user.findUnique({ where: { email: "rhonner.matheus@gmail.com" } });
  if (!u) throw new Error("seed user not found");
  const updated = await prisma.googleCalendarConnection.update({
    where: { userId: u.id },
    data: { status: target },
  });
  console.log(`GoogleCalendarConnection → ${updated.status} (email=${updated.googleAccountEmail})`);
  await prisma.$disconnect();
}
main();
