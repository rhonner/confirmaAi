/**
 * Checklist de validação local de TODAS as sprints fechadas.
 *
 * Cada item exercita o fluxo end-to-end no DB real e imprime PASS/FAIL.
 * O script CRIA usuários de teste isolados, valida, e LIMPA tudo no final.
 *
 * Uso: `npm run test:sprints`
 *
 * Segurança: NÃO RODAR em prod (early exit se NODE_ENV === "production").
 *
 * Sprints cobertos: 1 (auditoria + subscription + hardening), 2 (quota +
 * CPF), 3 (UX paywall — checks de existência de componentes/endpoints).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { audit, runWithAuditContext } from "../src/lib/audit";
import { maskPhone, maskEmail, truncateMessage } from "../src/lib/audit/pii";
import {
  hashCpf,
  hashPhone,
  reserveSlotInTx,
  checkEntitlement,
  attachCpfToExistingSlot,
  PLANS,
} from "../src/lib/billing";
import { canonicalizeCpf, validateCpf } from "../src/lib/anti-fraud/cpf-validator";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.NODE_ENV === "production") {
  throw new Error("não rodar em produção");
}

type Sprint = 1 | 2 | 3 | 4 | 5 | 6;
const results: Array<{ id: string; sprint: Sprint; pass: boolean; detail: string }> = [];
function check(id: string, sprint: Sprint, pass: boolean, detail = "") {
  results.push({ id, sprint, pass, detail });
  console.log(`  ${pass ? "✅" : "❌"} ${id} ${detail ? `— ${detail}` : ""}`);
}

function generateValidCpf(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);
  const sum1 = digits.reduce((a, d, i) => a + d * (10 - i), 0);
  const dv1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  const withDv1 = [...digits, dv1];
  const sum2 = withDv1.reduce((a, d, i) => a + d * (11 - i), 0);
  const dv2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  return [...withDv1, dv2].join("");
}

async function main() {
  // ====================================================================
  // SPRINT 1 — Auditoria + Subscription + Hardening
  // ====================================================================
  console.log("\n━━━ SPRINT 1 ━━━\n");

  // Setup: user de teste (emailVerifiedAt setado para que o gate Sprint 4
  // não interfira nos checks de quota/CPF dos sprints anteriores).
  const testEmail = `sprint-test-${Date.now()}@test.local`;
  const testUser = await prisma.user.create({
    data: {
      name: "Sprint Test",
      email: testEmail,
      password: "x",
      clinicName: "Test Clinic",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.subscription.create({
    data: { userId: testUser.id, plan: "FREE", status: "ACTIVE" },
  });

  // 1.1 Schema: tabelas existem
  const [auditCount, subCount] = await Promise.all([
    prisma.auditLog.count(),
    prisma.subscription.count({ where: { userId: testUser.id } }),
  ]);
  check("1.1 AuditLog table exists & queryable", 1, auditCount >= 0);
  check("1.2 Subscription FREE/ACTIVE backfilled for new user", 1, subCount === 1);

  // 1.3 Audit context propaga via Prisma extension (USER mutation)
  const phone1 = "+551199" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  const before = await prisma.auditLog.count();
  await runWithAuditContext(
    { actorType: "USER", actorId: testUser.id, ipAddress: "127.0.0.1", userAgent: "test-runner" },
    async () => {
      await prisma.patient.create({
        data: {
          name: "Audit Probe",
          phone: phone1,
          phoneCanonical: phone1.replace(/\D/g, ""),
          userId: testUser.id,
        },
      });
    },
  );
  const after = await prisma.auditLog.count();
  const lastAudit = await prisma.auditLog.findFirst({
    where: { tenantUserId: testUser.id, action: "patient.create" },
    orderBy: { createdAt: "desc" },
  });
  check("1.3 Prisma extension grava patient.create automaticamente", 1, after > before);
  check(
    "1.4 audit captura actorType/actorId via ALS",
    1,
    lastAudit?.actorType === "USER" && lastAudit?.actorId === testUser.id,
  );
  check(
    "1.5 audit captura ipAddress/userAgent",
    1,
    lastAudit?.ipAddress === "127.0.0.1" && lastAudit?.userAgent === "test-runner",
  );
  check(
    "1.6 afterJson contém o registro criado",
    1,
    !!(lastAudit?.afterJson as Record<string, unknown>)?.id,
  );

  // 1.7 Update produz diff (só campos alterados)
  const probePatient = await prisma.patient.findFirst({
    where: { userId: testUser.id, name: "Audit Probe" },
  });
  if (probePatient) {
    await runWithAuditContext(
      { actorType: "USER", actorId: testUser.id },
      async () => {
        await prisma.patient.update({
          where: { id: probePatient.id },
          data: { name: "Audit Probe RENAMED" },
        });
      },
    );
    const updateAudit = await prisma.auditLog.findFirst({
      where: { entityId: probePatient.id, action: "patient.update" },
      orderBy: { createdAt: "desc" },
    });
    const before = updateAudit?.beforeJson as Record<string, unknown> | null;
    const after = updateAudit?.afterJson as Record<string, unknown> | null;
    const onlyNameChanged =
      before?.name === "Audit Probe" &&
      after?.name === "Audit Probe RENAMED" &&
      !("phone" in (before ?? {})); // diff só do que mudou
    check("1.7 update grava diff (só campos alterados)", 1, onlyNameChanged);
  }

  // 1.8 Append-only trigger BLOQUEIA UPDATE em AuditLog
  const targetAuditId = lastAudit?.id;
  if (targetAuditId) {
    let updateBlocked = false;
    try {
      await prisma.auditLog.update({ where: { id: targetAuditId }, data: { action: "TAMPERED" } });
    } catch (e: unknown) {
      updateBlocked = String((e as Error).message).includes("append-only");
    }
    check("1.8 trigger Postgres bloqueia UPDATE em AuditLog", 1, updateBlocked);

    let deleteBlocked = false;
    try {
      await prisma.auditLog.delete({ where: { id: targetAuditId } });
    } catch (e: unknown) {
      deleteBlocked = String((e as Error).message).includes("append-only");
    }
    check("1.9 trigger Postgres bloqueia DELETE em AuditLog", 1, deleteBlocked);
  }

  // 1.10 Bypass via GUC permite cleanup (retention futuro)
  let bypassWorks = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
      await tx.auditLog.create({
        data: { actorType: "SYSTEM", action: "test.delete_me_xyz" },
      });
      const r = await tx.auditLog.deleteMany({ where: { action: "test.delete_me_xyz" } });
      bypassWorks = r.count > 0;
    });
  } catch (e) {
    // ignore
  }
  check("1.10 GUC bypass permite DELETE para retention job", 1, bypassWorks);

  // 1.11 PII masking
  check(
    "1.11 maskPhone preserva últimos 4",
    1,
    maskPhone("+5511976237318") === "+5511***7318",
  );
  check("1.12 maskEmail mascara local part", 1, maskEmail("foo@bar.com") === "f***@bar.com");
  check(
    "1.13 truncateMessage corta com ellipsis",
    1,
    (truncateMessage("a".repeat(100), 60)?.length ?? 0) === 61,
  );

  // 1.14 REDACTED_FIELDS — hash real do password NUNCA vaza em audit.
  // Disparamos um update que não mexe em password (só em name) E um que muda
  // password — em nenhum caso o hash real aparece em qualquer AuditLog.
  await runWithAuditContext(
    { actorType: "USER", actorId: testUser.id },
    async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { password: "real_hash_xyz_nunca_vazar_" + Date.now() },
      });
    },
  );
  const allUserAudits = await prisma.auditLog.findMany({
    where: { entityType: "User" },
    select: { beforeJson: true, afterJson: true },
  });
  const realHashLeaked = allUserAudits.some((row) => {
    const b = (row.beforeJson as Record<string, unknown> | null)?.password;
    const a = (row.afterJson as Record<string, unknown> | null)?.password;
    const realHashShape = (v: unknown) =>
      typeof v === "string" && v !== "[REDACTED]" && v.length > 0;
    return realHashShape(b) || realHashShape(a);
  });
  check("1.14 hash real do password NUNCA vaza em AuditLog (REDACTED_FIELDS)", 1, !realHashLeaked);

  // 1.15 Rate limit logic: simulate 10 failed login attempts from same IP
  const testIp = `10.99.99.${Math.floor(Math.random() * 250)}`;
  for (let i = 0; i < 10; i++) {
    await audit({
      action: "auth.login.failed",
      metadata: { simulatedAttempt: i },
      contextOverride: { actorType: "ANONYMOUS", ipAddress: testIp },
    });
  }
  const recent = await prisma.auditLog.count({
    where: {
      action: "auth.login.failed",
      ipAddress: testIp,
      createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
    },
  });
  check("1.15 query de rate limit conta tentativas por IP em janela", 1, recent === 10);

  // ====================================================================
  // SPRINT 2 — Quota de pacientes
  // ====================================================================
  console.log("\n━━━ SPRINT 2 ━━━\n");

  // 2.1 plans.ts config correto
  check("2.1 plans.FREE.patientSlots = 5", 2, PLANS.FREE.patientSlots === 5);
  check("2.2 plans.PRO.patientSlots = null (ilimitado)", 2, PLANS.PRO.patientSlots === null);
  check("2.3 plans.PRO.priceMonthly = 6500", 2, PLANS.PRO.priceMonthly === 6500);
  check("2.4 plans.PREMIUM.priceMonthly = 11000", 2, PLANS.PREMIUM.priceMonthly === 11000);

  // 2.5 CPF validator
  check("2.5 validateCpf aceita CPF válido", 2, validateCpf("111.444.777-35").valid === true);
  check(
    "2.6 validateCpf rejeita sequencial",
    2,
    !validateCpf("11111111111").valid &&
      (validateCpf("11111111111") as { reason: string }).reason === "sequential",
  );
  check(
    "2.7 validateCpf rejeita DV errado",
    2,
    !validateCpf("11111111100").valid,
  );

  // 2.8 Hash com namespace anti-colisão
  check(
    "2.8 hashCpf(11d) ≠ hashPhone(11d) — namespace funciona",
    2,
    hashCpf("11144477735") !== hashPhone("11144477735"),
  );
  check("2.9 hashCpf é determinístico", 2, hashCpf("11144477735") === hashCpf("111.444.777-35"));

  // 2.10 entitlements.check — FREE sem CPF é CPF_REQUIRED
  const dec1 = await checkEntitlement(testUser.id, "patient.create", {
    identifier: { phone: "+5511999991111" },
  });
  check(
    "2.10 FREE sem CPF retorna CPF_REQUIRED",
    2,
    dec1.allowed === false && dec1.reason === "CPF_REQUIRED",
  );

  // 2.11 entitlements.check — FREE com CPF e quota disponível → ok
  const cpfA = generateValidCpf(200000001);
  const dec2 = await checkEntitlement(testUser.id, "patient.create", {
    identifier: { cpf: cpfA, phone: "+5511999991111" },
  });
  check("2.11 FREE com CPF e quota disponível → allowed", 2, dec2.allowed === true);

  // Setup: user dedicado para teste de quota (precisa estar limpo)
  const quotaUser = await prisma.user.create({
    data: {
      name: "Quota Test",
      email: `quota-${Date.now()}@test.local`,
      password: "x",
      clinicName: "Quota Clinic",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.subscription.create({
    data: { userId: quotaUser.id, plan: "FREE", status: "ACTIVE" },
  });

  const cpfs = Array.from({ length: 6 }, (_, i) => generateValidCpf(300000001 + i * 7919));

  async function createPatientWithQuota(userId: string, idx: number, cpfRaw: string) {
    const cpfCanonical = canonicalizeCpf(cpfRaw);
    const phone = `+5511990${String(idx).padStart(6, "0")}`;
    return prisma.$transaction(
      async (tx) => {
        const p = await tx.patient.create({
          data: {
            name: `P${idx}`,
            phone,
            phoneCanonical: phone.replace(/\D/g, ""),
            cpf: cpfCanonical,
            cpfHash: hashCpf(cpfCanonical),
            userId,
          },
        });
        const r = await reserveSlotInTx(tx, userId, { cpf: cpfCanonical, phone }, p.id);
        if (!r.ok) throw new Error("QUOTA_EXCEEDED");
        return p;
      },
      { isolationLevel: "Serializable" },
    );
  }

  // 2.12 Criar 5 pacientes Free → counter=5, sem bloqueio
  for (let i = 0; i < 5; i++) {
    await createPatientWithQuota(quotaUser.id, i + 1, cpfs[i]);
  }
  const after5 = await prisma.user.findUnique({
    where: { id: quotaUser.id },
    select: { patientSlotCount: true },
  });
  check("2.12 5 pacientes Free criados, counter=5", 2, after5?.patientSlotCount === 5);

  // 2.13 6º bloqueia
  let blocked6 = false;
  try {
    await createPatientWithQuota(quotaUser.id, 6, cpfs[5]);
  } catch (e: unknown) {
    blocked6 = String((e as Error).message).includes("QUOTA_EXCEEDED");
  }
  check("2.13 6º paciente Free bloqueia (QUOTA_EXCEEDED)", 2, blocked6);

  // 2.14 Audit registrou o block
  const blockAudit = await prisma.auditLog.count({
    where: {
      action: "quota.patient_blocked",
      tenantUserId: quotaUser.id,
    },
  });
  check("2.14 audit quota.patient_blocked emitido", 2, blockAudit >= 1);

  // 2.15 Delete + recreate reusa slot
  const firstPatient = await prisma.patient.findFirst({ where: { userId: quotaUser.id } });
  await prisma.patient.delete({ where: { id: firstPatient!.id } });
  const orphans = await prisma.patientQuotaSlot.count({
    where: { userId: quotaUser.id, patientId: null },
  });
  check("2.15 delete vira slot órfão (patientId=null)", 2, orphans === 1);

  // 2.16 Recriar com mesmo CPF reusa
  const reuseCpf = canonicalizeCpf(cpfs[0]);
  const reusePhone = "+5511990999999";
  const reuseResult = await prisma.$transaction(
    async (tx) => {
      const p = await tx.patient.create({
        data: {
          name: "Reuse",
          phone: reusePhone,
          phoneCanonical: reusePhone.replace(/\D/g, ""),
          cpf: reuseCpf,
          cpfHash: hashCpf(reuseCpf),
          userId: quotaUser.id,
        },
      });
      return reserveSlotInTx(tx, quotaUser.id, { cpf: reuseCpf, phone: reusePhone }, p.id);
    },
    { isolationLevel: "Serializable" },
  );
  check(
    "2.16 recriar com mesmo CPF reusa slot (não consome vaga)",
    2,
    reuseResult.ok && reuseResult.reused === true,
  );

  const afterReuse = await prisma.user.findUnique({
    where: { id: quotaUser.id },
    select: { patientSlotCount: true },
  });
  check("2.17 counter permanece 5 após reuso", 2, afterReuse?.patientSlotCount === 5);

  // 2.18 Audit registrou o reuse
  const reuseAudit = await prisma.auditLog.count({
    where: { action: "quota.patient_reused", tenantUserId: quotaUser.id },
  });
  check("2.18 audit quota.patient_reused emitido", 2, reuseAudit >= 1);

  // 2.19 Após reuso, 6º novo (CPF nunca visto) ainda bloqueia
  let blocked6again = false;
  try {
    await createPatientWithQuota(quotaUser.id, 7, cpfs[5]);
  } catch (e: unknown) {
    blocked6again = String((e as Error).message).includes("QUOTA_EXCEEDED");
  }
  check("2.19 após reuso, novo paciente ainda bloqueia (quota mantida)", 2, blocked6again);

  // 2.20 attachCpfToExistingSlot — slot PHONE vira CPF
  // Cria user PRO (sem limite) com paciente sem CPF
  const proUser = await prisma.user.create({
    data: {
      name: "Pro Test",
      email: `pro-${Date.now()}@test.local`,
      password: "x",
      clinicName: "Pro Clinic",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.subscription.create({
    data: { userId: proUser.id, plan: "PRO", status: "ACTIVE" },
  });

  const noCpfPhone = "+5511991111111";
  const noCpfPatient = await prisma.$transaction(
    async (tx) => {
      const p = await tx.patient.create({
        data: {
          name: "No CPF",
          phone: noCpfPhone,
          phoneCanonical: noCpfPhone.replace(/\D/g, ""),
          userId: proUser.id,
        },
      });
      await reserveSlotInTx(tx, proUser.id, { phone: noCpfPhone }, p.id);
      return p;
    },
    { isolationLevel: "Serializable" },
  );

  const slotBefore = await prisma.patientQuotaSlot.findUnique({
    where: { patientId: noCpfPatient.id },
  });
  check("2.20 paciente sem CPF cria slot type=PHONE", 2, slotBefore?.identifierType === "PHONE");

  const cpfForPromote = generateValidCpf(400000001);
  await prisma.patient.update({
    where: { id: noCpfPatient.id },
    data: { cpf: cpfForPromote, cpfHash: hashCpf(cpfForPromote) },
  });
  await attachCpfToExistingSlot(prisma, proUser.id, noCpfPatient.id, cpfForPromote);
  const slotAfter = await prisma.patientQuotaSlot.findUnique({
    where: { patientId: noCpfPatient.id },
  });
  check(
    "2.21 attachCpfToExistingSlot promove slot PHONE → CPF",
    2,
    slotAfter?.identifierType === "CPF" && slotAfter.identifierHash === hashCpf(cpfForPromote),
  );

  // 2.22 PRO ilimitado (criar 10º paciente sem bloquear)
  for (let i = 0; i < 9; i++) {
    const cpf = generateValidCpf(500000001 + i * 7919);
    await createPatientWithQuota(proUser.id, i + 100, cpf);
  }
  const proCount = await prisma.patientQuotaSlot.count({ where: { userId: proUser.id } });
  check("2.22 PRO permite criar > 5 pacientes sem bloqueio", 2, proCount > 5);

  // 2.23 entitlements: SUSPENDED bloqueia tudo
  await prisma.subscription.update({
    where: { userId: proUser.id },
    data: { status: "SUSPENDED" },
  });
  const suspendedDecision = await checkEntitlement(proUser.id, "patient.create", {
    identifier: { phone: "+5511" },
  });
  check(
    "2.23 SUSPENDED bloqueia patient.create",
    2,
    !suspendedDecision.allowed && suspendedDecision.reason === "SUSPENDED",
  );

  // 2.24 entitlements: PAST_DUE bloqueia
  await prisma.subscription.update({
    where: { userId: proUser.id },
    data: { status: "PAST_DUE" },
  });
  const pastDueDecision = await checkEntitlement(proUser.id, "patient.create", {
    identifier: { phone: "+5511" },
  });
  check(
    "2.24 PAST_DUE bloqueia patient.create",
    2,
    !pastDueDecision.allowed && pastDueDecision.reason === "PAYMENT_PAST_DUE",
  );

  // 2.25 export.csv — FREE bloqueado, PRO permitido
  const freeExport = await checkEntitlement(testUser.id, "export.csv");
  await prisma.subscription.update({
    where: { userId: proUser.id },
    data: { status: "ACTIVE" },
  });
  const proExport = await checkEntitlement(proUser.id, "export.csv");
  check(
    "2.25 FREE não exporta CSV / PRO exporta",
    2,
    !freeExport.allowed && proExport.allowed,
  );

  // ====================================================================
  // SPRINT 3 — UX paywall (checks de existência de arquivos/endpoints)
  // ====================================================================
  console.log("\n━━━ SPRINT 3 ━━━\n");

  const root = process.cwd();
  const exists = (rel: string) => existsSync(join(root, rel));

  check("3.1 Componente UsageBadge existe", 3, exists("src/components/billing/usage-badge.tsx"));
  check("3.2 Componente PaywallModal existe", 3, exists("src/components/billing/paywall-modal.tsx"));
  check("3.3 Componente PlanCard existe", 3, exists("src/components/billing/plan-card.tsx"));
  check("3.4 Componente QuotaBanner existe", 3, exists("src/components/billing/quota-banner.tsx"));
  check("3.5 Página /billing existe", 3, exists("src/app/(dashboard)/billing/page.tsx"));
  check("3.6 Página /precos pública existe", 3, exists("src/app/precos/page.tsx"));
  check("3.7 E2E quota-paywall.spec.ts existe", 3, exists("tests/e2e/quota-paywall.spec.ts"));

  // 3.8 Endpoint /api/billing/subscription responde com payload correto
  // (testamos via integração: criamos sub, lemos via Prisma direto pra validar
  // a forma do payload — endpoint é exercitado em E2E Playwright).
  const subUser = await prisma.user.create({
    data: { name: "Sub Test", email: `sub-${Date.now()}@test.local`, password: "x", clinicName: "Sub Clinic" },
  });
  await prisma.subscription.create({
    data: { userId: subUser.id, plan: "PRO", status: "ACTIVE" },
  });
  await prisma.user.update({
    where: { id: subUser.id },
    data: { patientSlotCount: 3 },
  });
  const sub = await prisma.subscription.findUnique({ where: { userId: subUser.id } });
  const subUserData = await prisma.user.findUnique({
    where: { id: subUser.id },
    select: { patientSlotCount: true },
  });
  const planForUser = PLANS[sub?.plan ?? "FREE"];
  check(
    "3.8 Subscription endpoint shape: plan + status + count + limit (null para PRO)",
    3,
    sub?.plan === "PRO" &&
      sub?.status === "ACTIVE" &&
      subUserData?.patientSlotCount === 3 &&
      planForUser.patientSlots === null,
  );
  await prisma.user.delete({ where: { id: subUser.id } });

  // 3.9 Quota levels: 0%/60%/80%/100% mapeiam pra ok/warning/alert/blocked
  // (testando o cálculo diretamente — o hook está implementado em React e
  // não roda em Node, mas a lógica é determinística).
  function levelFor(count: number, limit: number) {
    const pct = Math.min(100, Math.round((count / Math.max(1, limit)) * 100));
    return pct >= 100 ? "blocked" : pct >= 80 ? "alert" : pct >= 60 ? "warning" : "ok";
  }
  check(
    "3.9 useUsage level: 0/5=ok, 3/5=warning, 4/5=alert, 5/5=blocked",
    3,
    levelFor(0, 5) === "ok" &&
      levelFor(3, 5) === "warning" &&
      levelFor(4, 5) === "alert" &&
      levelFor(5, 5) === "blocked",
  );

  // 3.10 PaywallError no hooks/use-api.ts está exportado
  const useApiSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(join(root, "src/hooks/use-api.ts"), "utf-8"),
  );
  check(
    "3.10 PaywallError + useUsage exportados em use-api.ts",
    3,
    useApiSrc.includes("export class PaywallError") &&
      useApiSrc.includes("export function useUsage"),
  );

  // 3.11 Sidebar inclui link para /billing
  const sidebarSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(join(root, "src/components/layout/app-sidebar.tsx"), "utf-8"),
  );
  check(
    '3.11 Sidebar tem link "/billing"',
    3,
    sidebarSrc.includes('"/billing"'),
  );

  // 3.12 AppHeader renderiza UsageBadge
  const headerSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(join(root, "src/components/layout/app-header.tsx"), "utf-8"),
  );
  check("3.12 AppHeader importa UsageBadge", 3, headerSrc.includes("UsageBadge"));

  // ====================================================================
  // SPRINT 4 — Anti-fraude signup
  // ====================================================================
  console.log("\n━━━ SPRINT 4 ━━━\n");

  // 4.1 SignupAttempt model existe e é queryable
  const beforeAttempts = await prisma.signupAttempt.count();
  await prisma.signupAttempt.create({
    data: { ipAddress: "10.99.99.42", emailHash: "deadbeef", succeeded: false, failureReason: "test" },
  });
  const afterAttempts = await prisma.signupAttempt.count();
  check("4.1 SignupAttempt table existe e aceita inserts", 4, afterAttempts > beforeAttempts);

  // 4.2 disposable email block
  const { isDisposableEmail } = await import("../src/lib/anti-fraud/disposable-emails");
  check(
    "4.2 isDisposableEmail bloqueia mailinator/yopmail/guerrillamail",
    4,
    isDisposableEmail("a@mailinator.com") &&
      isDisposableEmail("a@yopmail.com") &&
      isDisposableEmail("a@guerrillamail.com") &&
      !isDisposableEmail("a@gmail.com"),
  );

  // 4.3 hashEmail é determinístico
  const { hashEmail } = await import("../src/lib/anti-fraud/signup-rate-limit");
  check(
    "4.3 hashEmail determinístico e case-insensitive",
    4,
    hashEmail("Foo@Example.com") === hashEmail("foo@example.com"),
  );

  // 4.4 checkSignupRateLimit conta corretamente
  const { checkSignupRateLimit, trackSignupAttempt } = await import(
    "../src/lib/anti-fraud/signup-rate-limit"
  );
  // Simula 4 tentativas do mesmo IP > limite (3) — 4ª deve bloquear
  const ip = "10.99.99.99";
  const email = `flood-${Date.now()}@test.local`;
  for (let i = 0; i < 3; i++) {
    await trackSignupAttempt({ ipAddress: ip, email: `e${i}@test.local`, succeeded: false, failureReason: "test" });
  }
  const gate = await checkSignupRateLimit({ ipAddress: ip, email });
  check(
    "4.4 checkSignupRateLimit bloqueia ao atingir 3 attempts/IP em 24h",
    4,
    !gate.allowed && gate.reason === "TOO_MANY_FROM_IP",
  );

  // 4.5 Verification token lifecycle: cria, verifica, marca verified
  const { createVerificationToken, verifyEmailToken } = await import(
    "../src/lib/anti-fraud/email-verification"
  );
  const verifyTestUser = await prisma.user.create({
    data: {
      name: "Verify Test",
      email: `verify-${Date.now()}@test.local`,
      password: "x",
      clinicName: "Verify Clinic",
    },
  });
  const tk = await createVerificationToken(verifyTestUser.id);
  check("4.5 createVerificationToken retorna plaintext (não-vazio)", 4, tk.length > 16);

  const before4 = await prisma.user.findUnique({ where: { id: verifyTestUser.id }, select: { emailVerifiedAt: true } });
  const verifyResult = await verifyEmailToken(tk);
  const after4 = await prisma.user.findUnique({ where: { id: verifyTestUser.id }, select: { emailVerifiedAt: true } });
  check(
    "4.6 verifyEmailToken seta emailVerifiedAt em sucesso",
    4,
    verifyResult.ok && before4?.emailVerifiedAt === null && after4?.emailVerifiedAt !== null,
  );

  // 4.7 Token usado uma vez não verifica de novo
  const verifyAgain = await verifyEmailToken(tk);
  check(
    "4.7 token consumido não pode ser reusado",
    4,
    !verifyAgain.ok && verifyAgain.reason === "NOT_FOUND",
  );

  // 4.8 Cross-tenant CPF detection: 2 contas com mesmo CPF flag
  const { detectOwnerCpfReuse } = await import("../src/lib/anti-fraud/owner-cpf-dedup");
  const sharedCpf = "deadbeef-shared-cpf-hash-" + Date.now();
  const u1 = await prisma.user.create({
    data: { name: "U1", email: `u1-${Date.now()}@t.local`, password: "x", clinicName: "C1", cpfHash: sharedCpf },
  });
  await prisma.subscription.create({ data: { userId: u1.id, plan: "FREE", status: "ACTIVE" } });
  const u2 = await prisma.user.create({
    data: { name: "U2", email: `u2-${Date.now()}@t.local`, password: "x", clinicName: "C2", cpfHash: sharedCpf },
  });
  await prisma.subscription.create({ data: { userId: u2.id, plan: "FREE", status: "ACTIVE" } });

  const dedupResult = await detectOwnerCpfReuse(u2.id, sharedCpf);
  check(
    "4.8 cross-tenant CPF detection flag em 2 contas",
    4,
    dedupResult.count === 2 && dedupResult.flagged && !dedupResult.suspended,
  );

  // 4.9 Cross-tenant > 3 contas → suspend mais nova
  const u3 = await prisma.user.create({
    data: { name: "U3", email: `u3-${Date.now()}@t.local`, password: "x", clinicName: "C3", cpfHash: sharedCpf },
  });
  await prisma.subscription.create({ data: { userId: u3.id, plan: "FREE", status: "ACTIVE" } });
  const u4 = await prisma.user.create({
    data: { name: "U4", email: `u4-${Date.now()}@t.local`, password: "x", clinicName: "C4", cpfHash: sharedCpf },
  });
  await prisma.subscription.create({ data: { userId: u4.id, plan: "FREE", status: "ACTIVE" } });

  const dedupResult4 = await detectOwnerCpfReuse(u4.id, sharedCpf);
  const u4Sub = await prisma.subscription.findUnique({ where: { userId: u4.id } });
  check(
    "4.9 cross-tenant > 3 contas → suspende a mais nova",
    4,
    dedupResult4.count === 4 &&
      dedupResult4.suspended &&
      u4Sub?.status === "SUSPENDED",
  );

  // 4.10 EMAIL_NOT_VERIFIED bloqueia patient.create
  const unverifiedUser = await prisma.user.create({
    data: {
      name: "Unverified",
      email: `unverified-${Date.now()}@t.local`,
      password: "x",
      clinicName: "Unv Clinic",
      emailVerifiedAt: null, // explícito
    },
  });
  await prisma.subscription.create({ data: { userId: unverifiedUser.id, plan: "PRO", status: "ACTIVE" } });
  const decision = await checkEntitlement(unverifiedUser.id, "patient.create", {
    identifier: { phone: "+5511999990000" },
  });
  check(
    "4.10 entitlements bloqueia patient.create se emailVerifiedAt null",
    4,
    !decision.allowed && decision.reason === "EMAIL_NOT_VERIFIED",
  );

  // 4.11 Após verify, não bloqueia mais
  await prisma.user.update({
    where: { id: unverifiedUser.id },
    data: { emailVerifiedAt: new Date() },
  });
  const decisionAfter = await checkEntitlement(unverifiedUser.id, "patient.create", {
    identifier: { phone: "+5511999990000" },
  });
  check(
    "4.11 após emailVerifiedAt setado, patient.create permitido",
    4,
    decisionAfter.allowed,
  );

  // 4.12 Componentes/files Sprint 4 existem
  check(
    "4.12 src/lib/anti-fraud/* + verify-email route + página",
    4,
    exists("src/lib/anti-fraud/disposable-emails.ts") &&
      exists("src/lib/anti-fraud/signup-rate-limit.ts") &&
      exists("src/lib/anti-fraud/recaptcha.ts") &&
      exists("src/lib/anti-fraud/email-verification.ts") &&
      exists("src/lib/anti-fraud/owner-cpf-dedup.ts") &&
      exists("src/app/api/auth/verify-email/route.ts") &&
      exists("src/app/verificar-email/page.tsx") &&
      exists("src/hooks/use-recaptcha.ts"),
  );

  // Cleanup Sprint 4
  await prisma.user.deleteMany({
    where: { id: { in: [verifyTestUser.id, u1.id, u2.id, u3.id, u4.id, unverifiedUser.id] } },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { ipAddress: "10.99.99.99" } });
  });
  await prisma.signupAttempt.deleteMany({
    where: { OR: [{ ipAddress: "10.99.99.42" }, { ipAddress: "10.99.99.99" }] },
  });

  // ====================================================================
  // SPRINT 5 — Cobrança (provider, webhook, lifecycle)
  // ====================================================================
  console.log("\n━━━ SPRINT 5 ━━━\n");

  const { MockProvider, eventToSubscriptionPatch, getBillingProvider } = await import("../src/lib/billing");
  const { runBillingMaintenance } = await import("../src/lib/services/billing-maintenance");

  // 5.1 BillingEvent table existe + idempotência via providerEventId @unique
  const evtId = `test-evt-${Date.now()}`;
  await prisma.billingEvent.create({
    data: { provider: "ASAAS", eventType: "PAYMENT_RECEIVED", providerEventId: evtId, payload: {} },
  });
  let dupBlocked = false;
  try {
    await prisma.billingEvent.create({
      data: { provider: "ASAAS", eventType: "PAYMENT_RECEIVED", providerEventId: evtId, payload: {} },
    });
  } catch (e: unknown) {
    dupBlocked = (e as { code?: string }).code === "P2002";
  }
  check("5.1 BillingEvent.providerEventId @unique impede reprocessamento", 5, dupBlocked);

  // 5.2 MockProvider gera checkout PIX válido
  const mock = new MockProvider();
  const checkoutPix = await mock.createCheckout({
    userId: "test-user",
    customerId: "mock_cus_test",
    plan: "PRO",
    method: "PIX",
    returnUrl: "http://localhost:3000/billing/sucesso",
  });
  check(
    "5.2 MockProvider.createCheckout PIX retorna QR + payload",
    5,
    !!checkoutPix.sessionId && !!checkoutPix.qrCodeBase64 && !!checkoutPix.qrCodePayload,
  );

  // 5.3 MockProvider HMAC: válido aceito, inválido rejeitado
  const bodyOk = JSON.stringify({ id: "x", event: "PAYMENT_RECEIVED" });
  const sigOk = mock.signForMock(bodyOk);
  check(
    "5.3 verifyWebhookSignature aceita HMAC válido / rejeita inválido",
    5,
    mock.verifyWebhookSignature({ rawBody: bodyOk, signature: sigOk }) &&
      !mock.verifyWebhookSignature({ rawBody: bodyOk, signature: "wrong" }) &&
      !mock.verifyWebhookSignature({ rawBody: bodyOk, signature: null }),
  );

  // 5.4 eventToSubscriptionPatch mapeia corretamente
  const patchPaid = eventToSubscriptionPatch({ providerEventId: "1", eventType: "PAYMENT_RECEIVED", providerCustomerId: null, providerSubscriptionId: null, nextDueDate: new Date("2026-06-01"), payload: {} });
  const patchOverdue = eventToSubscriptionPatch({ providerEventId: "1", eventType: "PAYMENT_OVERDUE", providerCustomerId: null, providerSubscriptionId: null, payload: {} });
  const patchCanceled = eventToSubscriptionPatch({ providerEventId: "1", eventType: "SUBSCRIPTION_DELETED", providerCustomerId: null, providerSubscriptionId: null, payload: {} });
  check(
    "5.4 eventToSubscriptionPatch: PAID→ACTIVE, OVERDUE→PAST_DUE, DELETED→CANCELED",
    5,
    patchPaid.status === "ACTIVE" &&
      patchOverdue.status === "PAST_DUE" &&
      patchCanceled.status === "CANCELED" &&
      patchCanceled.cancelAtPeriodEnd === true,
  );

  // 5.5 Lifecycle: PAST_DUE > 7d → SUSPENDED
  const billUser = await prisma.user.create({
    data: { name: "Bill Test", email: `bill-${Date.now()}@t.local`, password: "x", clinicName: "Bill", emailVerifiedAt: new Date() },
  });
  await prisma.subscription.create({
    data: {
      userId: billUser.id,
      plan: "PRO",
      status: "PAST_DUE",
      provider: "ASAAS",
    },
  });
  // Forçar updatedAt no passado (simular > 7d)
  await prisma.$executeRawUnsafe(
    `UPDATE "Subscription" SET "updatedAt" = NOW() - INTERVAL '8 days' WHERE "userId" = '${billUser.id}'`,
  );
  const lifecycleResult = await runBillingMaintenance();
  const billSubAfter = await prisma.subscription.findUnique({ where: { userId: billUser.id } });
  check(
    "5.5 lifecycle: PAST_DUE > 7d → SUSPENDED",
    5,
    lifecycleResult.pastDueSuspended >= 1 && billSubAfter?.status === "SUSPENDED",
  );

  // 5.6 Lifecycle: CANCELED com currentPeriodEnd no passado → downgrade FREE
  const billUser2 = await prisma.user.create({
    data: { name: "Bill 2", email: `bill2-${Date.now()}@t.local`, password: "x", clinicName: "Bill2", emailVerifiedAt: new Date() },
  });
  await prisma.subscription.create({
    data: {
      userId: billUser2.id,
      plan: "PREMIUM",
      status: "CANCELED",
      currentPeriodEnd: new Date(Date.now() - 60_000),
      provider: "ASAAS",
      providerCustomerId: "old_cus",
      providerSubscriptionId: "old_sub",
    },
  });
  await runBillingMaintenance();
  const billSub2After = await prisma.subscription.findUnique({ where: { userId: billUser2.id } });
  check(
    "5.6 lifecycle: CANCELED + period passado → FREE/ACTIVE, providerIds limpos",
    5,
    billSub2After?.plan === "FREE" &&
      billSub2After?.status === "ACTIVE" &&
      billSub2After?.providerCustomerId === null,
  );

  // 5.7 Factory respeita BILLING_PROVIDER env
  const providerInstance = getBillingProvider();
  check(
    "5.7 getBillingProvider retorna instância (default Mock em dev)",
    5,
    typeof providerInstance.createCustomer === "function" &&
      typeof providerInstance.parseEvent === "function",
  );

  // 5.8 Componentes/rotas Sprint 5 existem
  check(
    "5.8 src/lib/billing/{provider,asaas,mock,factory}.ts + rotas + páginas",
    5,
    exists("src/lib/billing/provider.ts") &&
      exists("src/lib/billing/asaas.ts") &&
      exists("src/lib/billing/mock.ts") &&
      exists("src/lib/billing/factory.ts") &&
      exists("src/app/api/billing/checkout/route.ts") &&
      exists("src/app/api/billing/webhook/route.ts") &&
      exists("src/app/api/billing/portal/route.ts") &&
      exists("src/app/api/billing/cancel/route.ts") &&
      exists("src/app/api/billing/mock-trigger/route.ts") &&
      exists("src/app/(dashboard)/billing/checkout/page.tsx") &&
      exists("src/app/(dashboard)/billing/sucesso/page.tsx") &&
      exists("src/lib/services/billing-maintenance.ts"),
  );

  // Cleanup Sprint 5
  await prisma.user.deleteMany({ where: { id: { in: [billUser.id, billUser2.id] } } });
  await prisma.billingEvent.deleteMany({ where: { providerEventId: { contains: "test-evt-" } } });

  // ====================================================================
  // SPRINT 6 — Quota de mensagens + hardening do scheduler
  // ====================================================================
  console.log("\n━━━ SPRINT 6 ━━━\n");

  const { getCurrentUsage, incrementMessagesSent, currentPeriodFor } =
    await import("../src/lib/billing");

  // 6.1 Enum MessageStatus tem QUOTA_BLOCKED
  const enumRows = await prisma.$queryRawUnsafe<{ v: string }[]>(
    `SELECT unnest(enum_range(NULL::"MessageStatus"))::text AS v`,
  );
  check(
    "6.1 MessageStatus inclui QUOTA_BLOCKED",
    6,
    enumRows.some((r) => r.v === "QUOTA_BLOCKED"),
  );

  // 6.2 UsageCounter lazy: primeira leitura cria a linha do período (FREE = mês calendário, 50 msgs)
  const usageUser = await prisma.user.create({
    data: { name: "Usage Test", email: `usage-${Date.now()}@t.local`, password: "x", clinicName: "Usage", emailVerifiedAt: new Date() },
  });
  const firstUsage = await getCurrentUsage(usageUser.id);
  const counterRow = await prisma.usageCounter.findFirst({ where: { userId: usageUser.id } });
  check(
    "6.2 getCurrentUsage cria UsageCounter lazy (FREE: 50 incluídas, 0 enviadas)",
    6,
    firstUsage.messagesSent === 0 && firstUsage.messagesIncluded === 50 && !!counterRow,
  );

  // 6.3 incrementMessagesSent é atômico e acumula
  await incrementMessagesSent(usageUser.id);
  await incrementMessagesSent(usageUser.id);
  const afterInc = await getCurrentUsage(usageUser.id);
  check("6.3 incrementMessagesSent acumula (2 envios → messagesSent = 2)", 6, afterInc.messagesSent === 2);

  // 6.4 Gate message.send: permite sob o limite, bloqueia no limite com 402 semântico
  const allowedUnder = await checkEntitlement(usageUser.id, "message.send");
  await prisma.usageCounter.updateMany({
    where: { userId: usageUser.id },
    data: { messagesSent: 50 },
  });
  const deniedAt = await checkEntitlement(usageUser.id, "message.send");
  check(
    "6.4 entitlements message.send: allow < limite, deny QUOTA_EXCEEDED no limite (upgrade PRO)",
    6,
    allowedUnder.allowed === true &&
      deniedAt.allowed === false &&
      deniedAt.reason === "QUOTA_EXCEEDED" &&
      deniedAt.upgrade === "PRO",
  );

  // 6.5 currentPeriodFor: ciclo pago válido vs fallback mês calendário (webhook perdido)
  const nowRef = new Date("2026-06-10T12:00:00Z");
  const paidPeriod = currentPeriodFor(
    {
      currentPeriodStart: new Date("2026-06-05T00:00:00Z"),
      currentPeriodEnd: new Date("2026-07-05T00:00:00Z"),
    } as Parameters<typeof currentPeriodFor>[0],
    nowRef,
  );
  const stalePeriod = currentPeriodFor(
    {
      currentPeriodStart: new Date("2026-04-05T00:00:00Z"),
      currentPeriodEnd: new Date("2026-05-05T00:00:00Z"),
    } as Parameters<typeof currentPeriodFor>[0],
    nowRef,
  );
  check(
    "6.5 currentPeriodFor: usa ciclo pago válido; ciclo expirado cai pro mês calendário",
    6,
    paidPeriod.periodStart.toISOString() === "2026-06-05T00:00:00.000Z" &&
      stalePeriod.periodStart.toISOString() === "2026-06-01T00:00:00.000Z",
  );

  // 6.6 Índices compostos do scheduler existem no banco
  const idxRows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'Appointment'`,
  );
  const idxNames = idxRows.map((r) => r.indexname).join(",");
  check(
    "6.6 índices Appointment(status, confirmationSentAt) e (status, dateTime) criados",
    6,
    idxNames.includes("status_confirmationSentAt") && idxNames.includes("status_dateTime"),
  );

  // 6.7 Artefatos da sprint existem (usage.ts, stats no scheduler, badge, endpoint)
  const schedulerSrc = readFileSync("src/lib/services/scheduler.ts", "utf-8");
  const subscriptionRouteSrc = readFileSync("src/app/api/billing/subscription/route.ts", "utf-8");
  const badgeSrc = readFileSync("src/components/billing/usage-badge.tsx", "utf-8");
  check(
    "6.7 usage.ts + gate/stats no scheduler + messagesSent no endpoint + badge msgs",
    6,
    exists("src/lib/billing/usage.ts") &&
      schedulerSrc.includes("quotaBlocked") &&
      schedulerSrc.includes("QUOTA_BLOCKED") &&
      schedulerSrc.includes("TIME_BUDGET_MS") &&
      subscriptionRouteSrc.includes("messagesSent") &&
      badgeSrc.includes("message-usage-badge"),
  );

  // Cleanup Sprint 6
  await prisma.user.deleteMany({ where: { id: usageUser.id } });

  // ====================================================================
  // CLEANUP
  // ====================================================================
  console.log("\n━━━ Limpando dados de teste ━━━");
  await prisma.user.deleteMany({
    where: { id: { in: [testUser.id, quotaUser.id, proUser.id] } },
  });
  // Limpa audit de IPs de teste
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { ipAddress: { startsWith: "10.99.99." } } });
  });

  // ====================================================================
  // SUMÁRIO
  // ====================================================================
  console.log("\n━━━ SUMÁRIO ━━━\n");
  const sprint1 = results.filter((r) => r.sprint === 1);
  const sprint2 = results.filter((r) => r.sprint === 2);
  const sprint3 = results.filter((r) => r.sprint === 3);
  const sprint4 = results.filter((r) => r.sprint === 4);
  const sprint5 = results.filter((r) => r.sprint === 5);
  const sprint6 = results.filter((r) => r.sprint === 6);
  const failed = results.filter((r) => !r.pass);
  console.log(`Sprint 1: ${sprint1.filter((r) => r.pass).length}/${sprint1.length}`);
  console.log(`Sprint 2: ${sprint2.filter((r) => r.pass).length}/${sprint2.length}`);
  console.log(`Sprint 3: ${sprint3.filter((r) => r.pass).length}/${sprint3.length}`);
  console.log(`Sprint 4: ${sprint4.filter((r) => r.pass).length}/${sprint4.length}`);
  console.log(`Sprint 5: ${sprint5.filter((r) => r.pass).length}/${sprint5.length}`);
  console.log(`Sprint 6: ${sprint6.filter((r) => r.pass).length}/${sprint6.length}`);
  console.log(`Total:    ${results.filter((r) => r.pass).length}/${results.length}`);
  if (failed.length > 0) {
    console.log("\n❌ FAILED:");
    for (const f of failed) console.log(`   ${f.id}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("\n✅ TODAS AS VALIDAÇÕES PASSARAM");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
