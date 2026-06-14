/**
 * Diagnóstico de login (read-only). Roda contra o banco apontado por
 * DATABASE_URL — use com o env de produção quando quiser investigar prod.
 *
 * Uso (no SEU terminal, com acesso legítimo ao prod):
 *   vercel env pull .env.prod --environment=production
 *   DATABASE_URL="$(grep -o 'postgres[^"]*' .env.prod | head -1)" \
 *     npx tsx scripts/diagnose-login.ts 'rhonner.matheus+testepagto2@gmail.com' 'TesteClinica2026!'
 *   rm .env.prod   # limpa os segredos depois
 *
 * Não muta nada. Só lê o usuário, confere a senha candidata via bcrypt e
 * lista os motivos das últimas falhas de login (gravados pelo authorize()).
 */
import "dotenv/config";
import * as bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const [email, candidate] = process.argv.slice(2);
  if (!email) {
    console.error("uso: tsx scripts/diagnose-login.ts <email> [senha-candidata]");
    process.exit(2);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, emailVerifiedAt: true, createdAt: true },
  });

  console.log("\n=== CONTA ===");
  if (!user) {
    console.log(`❌ Nenhum usuário com email exatamente "${email}".`);
    // Procura parecidos (case / +alias) pra detectar divergência de cadastro.
    const like = await prisma.user.findMany({
      where: { email: { contains: email.split("@")[0].replace(/\+.*/, ""), mode: "insensitive" } },
      select: { email: true },
      take: 10,
    });
    console.log("Emails parecidos no banco:", like.map((u) => u.email));
  } else {
    console.log(`✅ Existe. id=${user.id}`);
    console.log(`   emailVerifiedAt: ${user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : "NULL (não verificado)"}`);
    console.log(`   criado: ${user.createdAt.toISOString()}`);
    console.log(`   hash de senha presente: ${user.password ? "sim" : "NÃO"}`);
    if (candidate && user.password) {
      const ok = await bcrypt.compare(candidate, user.password);
      console.log(`   senha candidata confere? ${ok ? "✅ SIM" : "❌ NÃO (senha está diferente da anotada)"}`);
    }
  }

  console.log("\n=== ÚLTIMAS FALHAS DE LOGIN (deste email) ===");
  const fails = await prisma.auditLog.findMany({
    where: { action: { in: ["auth.login.failed", "auth.login.rate_limited"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { createdAt: true, action: true, metadata: true },
  });
  const mine = fails.filter((f) => {
    const m = f.metadata as { email?: string } | null;
    return m?.email === email;
  });
  if (mine.length === 0) {
    console.log("Nenhuma falha registrada com esse email (confira se está digitando o email certo).");
  } else {
    for (const f of mine.slice(0, 10)) {
      const m = f.metadata as { reason?: string } | null;
      console.log(`  ${f.createdAt.toISOString()}  ${f.action}  reason=${m?.reason ?? "-"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
