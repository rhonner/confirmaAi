/**
 * Helper de dev (Sprint 8): alterna o estado de WhatsApp do seed user para
 * testar o fluxo de resiliência (banner, emails, sweep) sem Evolution real.
 *
 * Uso:
 *   npx tsx scripts/toggle-whatsapp-state.ts fake-connected
 *     → CONNECTED com instância fake. O próximo GET /api/whatsapp/status
 *       (abrir o dashboard) consulta a Evolution, recebe "unknown", faz o
 *       downgrade e dispara a cadeia: email imediato (logado em dev) +
 *       audit whatsapp.disconnected + banner vermelho.
 *
 *   npx tsx scripts/toggle-whatsapp-state.ts disconnected [horasAtras]
 *     → DISCONNECTED com whatsappDisconnectedAt/NotifiedAt N horas atrás
 *       (default 30) — estado pronto pra exercitar o sweep do cron
 *       (runWhatsappResilience renotifica se >24h + agendamento futuro).
 *
 *   npx tsx scripts/toggle-whatsapp-state.ts reset
 *     → zera tudo (estado padrão do seed user). SEMPRE rodar ao terminar.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const SEED_EMAIL = "rhonner.matheus@gmail.com";

async function main() {
  const mode = process.argv[2];
  const where = { email: SEED_EMAIL };

  if (mode === "fake-connected") {
    await prisma.user.update({
      where,
      data: {
        evolutionInstanceName: "clinic-test-banner-sprint8",
        whatsappStatus: "CONNECTED",
        whatsappConnectedAt: new Date(Date.now() - 7 * 24 * 3_600_000),
        whatsappDisconnectedAt: null,
        whatsappDisconnectNotifiedAt: null,
      },
    });
    console.log(`${SEED_EMAIL} → CONNECTED com instância fake (poll vai derrubar e alertar)`);
  } else if (mode === "disconnected") {
    const hours = Number(process.argv[3] ?? 30);
    const at = new Date(Date.now() - hours * 3_600_000);
    await prisma.user.update({
      where,
      data: {
        evolutionInstanceName: "clinic-test-banner-sprint8",
        whatsappStatus: "DISCONNECTED",
        whatsappConnectedAt: new Date(at.getTime() - 24 * 3_600_000),
        whatsappDisconnectedAt: at,
        whatsappDisconnectNotifiedAt: at,
      },
    });
    console.log(`${SEED_EMAIL} → DISCONNECTED há ${hours}h (sweep elegível se >24h)`);
  } else if (mode === "reset") {
    await prisma.user.update({
      where,
      data: {
        evolutionInstanceName: null,
        whatsappStatus: "DISCONNECTED",
        whatsappPhoneNumber: null,
        whatsappConnectedAt: null,
        whatsappDisconnectedAt: null,
        whatsappDisconnectNotifiedAt: null,
      },
    });
    console.log(`${SEED_EMAIL} → estado whatsapp zerado`);
  } else {
    console.log("uso: tsx scripts/toggle-whatsapp-state.ts fake-connected|disconnected [horasAtras]|reset");
    process.exit(1);
  }
  await prisma.$disconnect();
}
main();
