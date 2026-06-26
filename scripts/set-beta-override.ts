/**
 * Liga/desliga o override "beta tester / cortesia" (premium grátis) por e-mail.
 *
 * O override eleva o tenant a entitlements de PREMIUM SEM tocar em plan/status/
 * cobrança (ver `effectivePlanTier`). Desligar reverte na hora.
 *
 * Uso (passe o env explicitamente):
 *   Local:  npx tsx --env-file=.env          scripts/set-beta-override.ts on  a@x.com b@y.com
 *   Prod:   npx tsx --env-file=.env.prod.tmp scripts/set-beta-override.ts on  a@x.com
 *           (puxe o env de prod antes: `npx vercel env pull --environment=production .env.prod.tmp`,
 *            e APAGUE o arquivo depois — ele contém todos os segredos.)
 */
import { prisma } from "../src/lib/prisma";
import { audit } from "../src/lib/audit";
import { BETA_OVERRIDE_UNTIL } from "../src/lib/billing/plans";

async function main() {
  const [mode, ...rawEmails] = process.argv.slice(2);
  if ((mode !== "on" && mode !== "off") || rawEmails.length === 0) {
    console.error("Uso: tsx scripts/set-beta-override.ts on|off <email...>");
    process.exit(1);
  }
  const enable = mode === "on";
  const emails = rawEmails.map((e) => e.trim().toLowerCase());

  const users = await prisma.user.findMany({
    where: { email: { in: emails }, deletedAt: null },
    select: { id: true, email: true, clinicName: true },
  });
  const found = new Set(users.map((u) => u.email.toLowerCase()));
  for (const e of emails) if (!found.has(e)) console.warn(`⚠️  não encontrado (ignorado): ${e}`);

  let ok = 0;
  for (const u of users) {
    try {
      await prisma.subscription.update({
        where: { userId: u.id },
        data: enable
          ? { adminOverrideUntil: BETA_OVERRIDE_UNTIL, adminOverrideReason: "beta_tester" }
          : { adminOverrideUntil: null, adminOverrideReason: null },
      });
      await audit({
        action: enable ? "admin.override_set" : "admin.override_cleared",
        entityType: "Subscription",
        tenantUserId: u.id,
        metadata: { source: "cli", reason: enable ? "beta_tester" : null },
        contextOverride: { actorType: "ADMIN", actorId: "cli" },
      });
      ok++;
      console.log(`${enable ? "✅ beta ON " : "⛔ beta OFF"}  ${u.clinicName}  (${u.email})`);
    } catch (e) {
      console.error(`❌ falhou ${u.email}: ${(e as Error).message}`);
    }
  }
  console.log(`\n${ok}/${users.length} conta(s) atualizada(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
