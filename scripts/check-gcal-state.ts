/**
 * Helper de dev (READ-ONLY): imprime o estado da conexão Google Calendar e do
 * plano do usuário-seed, para retomar a validação E2E sem adivinhar o estado.
 *
 * Uso: npx tsx scripts/check-gcal-state.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: "rhonner.matheus@gmail.com" },
    include: { subscription: true },
  });
  if (!u) throw new Error("seed user not found");

  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId: u.id },
  });

  console.log("=== Usuário-seed ===");
  console.log("email:", u.email);
  console.log("plano:", u.subscription?.plan, "/", u.subscription?.status);

  console.log("\n=== GoogleCalendarConnection ===");
  if (!conn) {
    console.log("(sem linha — desconectado)");
  } else {
    const hasRefresh = Boolean(conn.refreshTokenEnc);
    const accessExp = conn.accessTokenExpiresAt
      ? conn.accessTokenExpiresAt.toISOString()
      : "(nulo)";
    console.log("status:", conn.status);
    console.log("googleAccountEmail:", conn.googleAccountEmail);
    console.log("scopes:", conn.scopes);
    console.log("calendarId:", conn.calendarId);
    console.log("connectedAt:", conn.connectedAt?.toISOString());
    console.log("revokedAt:", conn.revokedAt?.toISOString() ?? "(nulo)");
    console.log("lastError:", conn.lastError ?? "(nulo)");
    console.log("refreshToken cifrado presente:", hasRefresh);
    console.log("accessToken expira em:", accessExp);
  }

  await prisma.$disconnect();
}
main();
