/**
 * Helper de dev (TESTE): apaga a linha GoogleCalendarConnection do usuário-seed,
 * levando o app ao estado DISCONNECTED (sem linha) — o mesmo efeito do botão
 * "Desconectar" após um revoke bem-sucedido, mas sem o confirm() nativo.
 *
 * Uso quando o grant já foi revogado no Google (externamente) e sobrou a linha
 * órfã no banco, para reencenar um "connect do zero".
 *
 * Uso: npx tsx scripts/gcal-delete-connection.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const u = await prisma.user.findUnique({ where: { email: "rhonner.matheus@gmail.com" } });
  if (!u) throw new Error("seed user not found");
  const res = await prisma.googleCalendarConnection.deleteMany({ where: { userId: u.id } });
  console.log(`Linhas apagadas: ${res.count} → agora DISCONNECTED (sem linha)`);
  await prisma.$disconnect();
}
main();
