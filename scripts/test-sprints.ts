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
  resolveCheckoutCpf,
  MockProvider,
  PLANS,
} from "../src/lib/billing";
import { canonicalizeCpf, validateCpf } from "../src/lib/anti-fraud/cpf-validator";
import { resetEligibility } from "../src/lib/account/reset-eligibility";
import { dunningStageDue, usageThresholdDue } from "../src/lib/services/billing-notifications";
import { computePixExpiresAt, PIX_QR_TTL_SECONDS } from "../src/lib/billing/pix-ttl";
import { isPatientPurgeDue, runAccountPurge } from "../src/lib/account/account-purge";
import { findPendingAppointmentForResponse } from "../src/lib/services/webhook-confirmation";
import {
  formatMessage,
  RESPONSE_INSTRUCTION,
  stripResponseInstruction,
  withResponseInstruction,
} from "../src/lib/services/message-template";
import { CONFIRM_CODE, CANCEL_CODE, parseResponse } from "../src/lib/services/webhook-parser";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

if (process.env.NODE_ENV === "production") {
  throw new Error("não rodar em produção");
}

type Sprint = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10;
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
  // SPRINT 8 — Resiliência WhatsApp (anti-churn silencioso)
  // ====================================================================
  console.log("\n━━━ SPRINT 8 ━━━\n");

  const { shouldRenotifyDisconnected, runWhatsappResilience } = await import(
    "../src/lib/services/whatsapp-alerts"
  );

  // 8.1 Schema: campos de tracking de desconexão no User
  const wppCols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name IN ('whatsappDisconnectedAt', 'whatsappDisconnectNotifiedAt')`,
  );
  check("8.1 User tem whatsappDisconnectedAt + whatsappDisconnectNotifiedAt", 8, wppCols.length === 2);

  // 8.2-8.4 Regra de renotificação (pura)
  const now8 = new Date();
  const hoursAgo = (h: number) => new Date(now8.getTime() - h * 3_600_000);
  check(
    "8.2 Dedup 24h: notificado há 23h não renotifica (mesmo com pending)",
    8,
    shouldRenotifyDisconnected({
      disconnectedAt: hoursAgo(30),
      notifiedAt: hoursAgo(23),
      hasFutureAppointments: true,
      now: now8,
    }) === false,
  );
  check(
    "8.3 Com agendamentos futuros renotifica diariamente",
    8,
    shouldRenotifyDisconnected({
      disconnectedAt: hoursAgo(240),
      notifiedAt: hoursAgo(25),
      hasFutureAppointments: true,
      now: now8,
    }) === true,
  );
  check(
    "8.4 Sem pending: reforço só na janela 24-48h (72h → silêncio)",
    8,
    shouldRenotifyDisconnected({
      disconnectedAt: hoursAgo(25),
      notifiedAt: hoursAgo(25),
      hasFutureAppointments: false,
      now: now8,
    }) === true &&
      shouldRenotifyDisconnected({
        disconnectedAt: hoursAgo(72),
        notifiedAt: hoursAgo(30),
        hasFutureAppointments: false,
        now: now8,
      }) === false,
  );

  // 8.5 Sweep funcional: desconectado há 30h com agendamento futuro →
  // renotifica (email DEV_LOGGED em dev), atualiza notifiedAt e audita
  // whatsapp.disconnected_with_pending.
  const wppUser = await prisma.user.create({
    data: {
      name: "Wpp Disc Test",
      email: `wpp-disc-${Date.now()}@t.local`,
      password: "x",
      clinicName: "Wpp Disc",
      emailVerifiedAt: new Date(),
      evolutionInstanceName: `clinic-wpp-disc-${Date.now()}`,
      whatsappStatus: "DISCONNECTED",
      whatsappDisconnectedAt: hoursAgo(30),
      whatsappDisconnectNotifiedAt: hoursAgo(30),
    },
  });
  const wppPatient = await prisma.patient.create({
    data: {
      name: "Paciente Wpp",
      phone: "+5541999000111",
      phoneCanonical: "5541999000111",
      userId: wppUser.id,
    },
  });
  await prisma.appointment.create({
    data: {
      userId: wppUser.id,
      patientId: wppPatient.id,
      dateTime: new Date(now8.getTime() + 24 * 3_600_000),
      status: "PENDING",
    },
  });
  const pendingAuditBefore = await prisma.auditLog.count({
    where: { tenantUserId: wppUser.id, action: "whatsapp.disconnected_with_pending" },
  });
  const wppStats = await runWhatsappResilience();
  const wppUserAfter = await prisma.user.findUnique({
    where: { id: wppUser.id },
    select: { whatsappDisconnectNotifiedAt: true },
  });
  const pendingAuditAfter = await prisma.auditLog.count({
    where: { tenantUserId: wppUser.id, action: "whatsapp.disconnected_with_pending" },
  });
  check(
    "8.5 Sweep renotifica desconectado com pending + audit disconnected_with_pending",
    8,
    wppStats.whatsappRenotified >= 1 &&
      wppStats.whatsappDisconnectedWithPending >= 1 &&
      pendingAuditAfter > pendingAuditBefore &&
      !!wppUserAfter?.whatsappDisconnectNotifiedAt &&
      wppUserAfter.whatsappDisconnectNotifiedAt.getTime() > hoursAgo(1).getTime(),
    `renotified=${wppStats.whatsappRenotified} pending=${wppStats.whatsappDisconnectedWithPending}`,
  );

  // 8.6 Métrica de % conectados calculada (com instância existente no DB)
  check(
    "8.6 Métrica whatsappConnectedPct calculada",
    8,
    typeof wppStats.whatsappConnectedPct === "number" &&
      wppStats.whatsappConnectedPct >= 0 &&
      wppStats.whatsappConnectedPct <= 100,
    `pct=${wppStats.whatsappConnectedPct} health=${wppStats.evolutionHealth}`,
  );

  // 8.7 Detecção wired: webhook (close → markWhatsappDisconnected) + status
  // poll (downgrade) + reconexão limpa tracking + disconnect intencional limpa.
  const evoWebhookSrc = readFileSync(
    join(root, "src/app/api/webhook/evolution/[instance]/route.ts"),
    "utf8",
  );
  const statusRouteSrc = readFileSync(join(root, "src/app/api/whatsapp/status/route.ts"), "utf8");
  const disconnectRouteSrc = readFileSync(
    join(root, "src/app/api/whatsapp/disconnect/route.ts"),
    "utf8",
  );
  check(
    "8.7 Detecção de transição wired (webhook + poll + clears)",
    8,
    evoWebhookSrc.includes("markWhatsappDisconnected") &&
      evoWebhookSrc.includes("whatsappReconnectedPatch") &&
      statusRouteSrc.includes("markWhatsappDisconnected") &&
      disconnectRouteSrc.includes("whatsappDisconnectedAt: null"),
  );

  // 8.8 Banner no layout + email lib + scheduler integrado
  const layoutSrc = readFileSync(join(root, "src/app/(dashboard)/layout.tsx"), "utf8");
  const schedulerSrc8 = readFileSync(join(root, "src/lib/services/scheduler.ts"), "utf8");
  check(
    "8.8 Banner montado no layout + email.ts + sweep no scheduler",
    8,
    exists("src/components/whatsapp/whatsapp-disconnected-banner.tsx") &&
      layoutSrc.includes("WhatsappDisconnectedBanner") &&
      exists("src/lib/email.ts") &&
      schedulerSrc8.includes("runWhatsappResilience"),
  );

  // Cleanup Sprint 8
  await prisma.user.deleteMany({ where: { id: wppUser.id } });

  // ====================================================================
  // SPRINT 9 — Observabilidade (/api/health + captura de erros)
  // ====================================================================
  console.log("\n━━━ SPRINT 9 ━━━\n");

  const { evaluateHealth, CRON_STALE_MINUTES, BILLING_STUCK_MINUTES } = await import(
    "../src/lib/services/health"
  );

  const now9 = new Date();
  const minsAgo9 = (m: number) => new Date(now9.getTime() - m * 60_000);
  const okInputs = {
    now: now9,
    databaseOk: true,
    lastCronRunAt: minsAgo9(10),
    stuckBillingEvents: 0,
    evolutionHealth: "OK" as const,
  };

  // 9.1 Laudo saudável → status ok
  check(
    "9.1 evaluateHealth: tudo verde → status ok",
    9,
    evaluateHealth(okInputs).status === "ok",
  );

  // 9.2 Cron parado além do limite → degraded
  check(
    "9.2 cron parado > limite → degraded (cron.ok false)",
    9,
    (() => {
      const r = evaluateHealth({ ...okInputs, lastCronRunAt: minsAgo9(CRON_STALE_MINUTES + 5) });
      return r.status === "degraded" && r.checks.cron.ok === false;
    })(),
    `threshold=${CRON_STALE_MINUTES}min`,
  );

  // 9.3 BillingEvent travado → degraded
  check(
    "9.3 BillingEvent não-processado → billing degradado",
    9,
    (() => {
      const r = evaluateHealth({ ...okInputs, stuckBillingEvents: 1 });
      return r.status === "degraded" && r.checks.billing.ok === false;
    })(),
    `threshold=${BILLING_STUCK_MINUTES}min`,
  );

  // 9.4 Evolution: DOWN derruba, NOT_CONFIGURED não
  check(
    "9.4 Evolution DOWN → degraded; NOT_CONFIGURED → ok",
    9,
    evaluateHealth({ ...okInputs, evolutionHealth: "DOWN" }).status === "degraded" &&
      evaluateHealth({ ...okInputs, evolutionHealth: "NOT_CONFIGURED" }).status === "ok",
  );

  // 9.5 Queries reais que alimentam o laudo são válidas contra o schema:
  // semeia um audit cron.run agora e confirma que a coleta o enxerga recente.
  await runWithAuditContext({ actorType: "SYSTEM", actorId: "cron" }, async () => {
    await audit({ action: "cron.run", metadata: { fromTest: true } });
  });
  const lastCron9 = await prisma.auditLog.findFirst({
    where: { action: "cron.run" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const stuckBilling9 = await prisma.billingEvent.count({
    where: {
      processedAt: null,
      createdAt: { lt: new Date(now9.getTime() - BILLING_STUCK_MINUTES * 60_000) },
    },
  });
  const liveReport = evaluateHealth({
    now: now9,
    databaseOk: true,
    lastCronRunAt: lastCron9?.createdAt ?? null,
    stuckBillingEvents: stuckBilling9,
    evolutionHealth: "NOT_CONFIGURED",
  });
  check(
    "9.5 coleta real (auditLog cron.run + billingEvent.count) → cron.ok com run recém-semeado",
    9,
    !!lastCron9 && liveReport.checks.cron.ok === true,
    `lastRunMinutesAgo=${liveReport.checks.cron.lastRunMinutesAgo} stuckBilling=${stuckBilling9}`,
  );

  // 9.6 Endpoint + seam de observabilidade montados e fiados
  const healthRouteSrc = readFileSync(join(root, "src/app/api/health/route.ts"), "utf8");
  const instrumentationSrc = readFileSync(join(root, "instrumentation.ts"), "utf8");
  const cronRouteSrc = readFileSync(join(root, "src/app/api/cron/run/route.ts"), "utf8");
  const billingWebhookSrc = readFileSync(
    join(root, "src/app/api/billing/webhook/route.ts"),
    "utf8",
  );
  check(
    "9.6 /api/health (200/503) + observability + onRequestError + captureError fiados",
    9,
    exists("src/app/api/health/route.ts") &&
      healthRouteSrc.includes("runHealthChecks") &&
      healthRouteSrc.includes("503") &&
      exists("src/lib/observability/index.ts") &&
      instrumentationSrc.includes("onRequestError") &&
      instrumentationSrc.includes("initObservability") &&
      cronRouteSrc.includes("captureError") &&
      billingWebhookSrc.includes("captureError"),
  );

  // 9.7 Liveness probe SEM DB (corte de custo Neon: o ping de 5 min do uptime
  // monitor não pode acordar o compute). O handler só importa NextResponse —
  // nada de prisma / runHealthChecks / agregador de health (senão tocaria o banco).
  const liveRouteSrc = exists("src/app/api/health/live/route.ts")
    ? readFileSync(join(root, "src/app/api/health/live/route.ts"), "utf8")
    : "";
  const liveImports = liveRouteSrc
    .split("\n")
    .filter((l) => /^\s*import\b/.test(l))
    .join("\n");
  check(
    "9.7 /api/health/live: liveness 200 SEM tocar no banco (Neon scale-to-zero)",
    9,
    exists("src/app/api/health/live/route.ts") &&
      /check:\s*"live"/.test(liveRouteSrc) &&
      !liveRouteSrc.includes("runHealthChecks(") &&
      !/prisma/i.test(liveImports) &&
      !/services\/health/i.test(liveImports),
  );

  // ====================================================================
  // SPRINT 10 — Receita passiva: atividade do usuário + painel admin
  // ====================================================================
  console.log("\n━━━ SPRINT 10 ━━━\n");

  const { isAdminEmail, getAdminEmails } = await import("../src/lib/admin");

  // 10.1 Allowlist de admin (pura)
  const prevAdmin = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = " Boss@Clinica.com , dev@x.com ";
  const adminOk =
    isAdminEmail("boss@clinica.com") === true &&
    isAdminEmail("BOSS@CLINICA.COM") === true &&
    isAdminEmail("intruso@x.com") === false &&
    isAdminEmail(null) === false &&
    getAdminEmails().length === 2;
  process.env.ADMIN_EMAILS = prevAdmin;
  check("10.1 isAdminEmail: allowlist case-insensitive + nega fora da lista", 10, adminOk);

  // 10.2 Atividade tenant-scoped: cada user só vê a própria trilha
  const mark10 = "sprint10.activity_probe";
  await prisma.auditLog.createMany({
    data: [
      { actorType: "USER", actorId: testUser.id, tenantUserId: testUser.id, action: mark10, ipAddress: "10.99.99.55" },
      { actorType: "USER", actorId: proUser.id, tenantUserId: proUser.id, action: mark10, ipAddress: "10.99.99.55" },
    ],
  });
  const mineActivity = await prisma.auditLog.findMany({
    where: { tenantUserId: testUser.id, action: mark10 },
    select: { tenantUserId: true },
  });
  check(
    "10.2 Atividade tenant-scoped (query por tenantUserId não vaza outro tenant)",
    10,
    mineActivity.length === 1 && mineActivity.every((r) => r.tenantUserId === testUser.id),
  );

  // 10.3 Métrica whatsappConnectedPct (fórmula do painel admin)
  const pctOf = (connected: number, withInstance: number) =>
    withInstance > 0 ? Math.round((connected / withInstance) * 100) : 0;
  const adminRouteSrc = readFileSync(join(root, "src/app/api/admin/audit/route.ts"), "utf8");
  const adminLayoutSrc = readFileSync(join(root, "src/app/admin/layout.tsx"), "utf8");
  check(
    "10.3 Painel admin: gate isAdminEmail + 403 + métrica whatsappConnectedPct",
    10,
    pctOf(3, 4) === 75 &&
      pctOf(0, 0) === 0 &&
      adminRouteSrc.includes("isAdminEmail") &&
      adminRouteSrc.includes("forbiddenResponse") &&
      adminRouteSrc.includes("whatsappConnectedPct") &&
      adminLayoutSrc.includes("isAdminEmail") &&
      adminLayoutSrc.includes("redirect"),
  );

  // 10.4 Arquivos + wiring
  const configSrc10 = readFileSync(join(root, "src/app/(dashboard)/configuracoes/page.tsx"), "utf8");
  check(
    "10.4 Páginas/rotas de auditoria existem + configuracoes linka atividade",
    10,
    exists("src/app/api/account/activity/route.ts") &&
      exists("src/app/api/admin/audit/route.ts") &&
      exists("src/app/(dashboard)/configuracoes/atividade/page.tsx") &&
      exists("src/app/admin/layout.tsx") &&
      exists("src/app/admin/audit/page.tsx") &&
      configSrc10.includes("/configuracoes/atividade"),
  );

  // 10.5 Reset de senha: token DB-backed valida e é single-use (integração)
  const { makeResetToken, verifyResetToken } = await import(
    "../src/lib/anti-fraud/password-reset"
  );
  const pwUser = await prisma.user.create({
    data: {
      name: "Reset Test",
      email: `reset-${Date.now()}@t.local`,
      password: await import("bcryptjs").then((b) => b.hash("senha-antiga", 10)),
      clinicName: "Reset Clinic",
      emailVerifiedAt: new Date(),
    },
  });
  const freshUser = await prisma.user.findUnique({
    where: { id: pwUser.id },
    select: { password: true },
  });
  const resetToken = makeResetToken(pwUser.id, freshUser!.password);
  const verifyOk = await verifyResetToken(resetToken);
  // troca a senha (simula o reset) → token deve ficar inválido (single-use)
  await prisma.user.update({
    where: { id: pwUser.id },
    data: { password: await import("bcryptjs").then((b) => b.hash("senha-nova", 10)) },
  });
  const verifyAfter = await verifyResetToken(resetToken);
  check(
    "10.5 Reset token DB valida e é single-use (inválido após trocar a senha)",
    10,
    verifyOk.ok === true &&
      verifyOk.ok && verifyOk.userId === pwUser.id &&
      verifyAfter.ok === false,
    `before=${verifyOk.ok} after=${verifyAfter.ok}`,
  );
  await prisma.user.deleteMany({ where: { id: pwUser.id } });

  // 10.6 Fluxo de reset montado (forgot não é mais stub + rota + página)
  const forgotSrc = readFileSync(join(root, "src/app/api/auth/forgot-password/route.ts"), "utf8");
  check(
    "10.6 forgot-password envia email (não-stub) + reset-password + /redefinir-senha + email layout",
    10,
    forgotSrc.includes("sendPasswordResetEmail") &&
      !forgotSrc.includes("email delivery not configured") &&
      exists("src/app/api/auth/reset-password/route.ts") &&
      exists("src/app/(auth)/redefinir-senha/page.tsx") &&
      exists("src/lib/emails/layout.ts"),
  );

  // 10.7 Emails transacionais (fatia 2.2): builders + senders fiados nos gatilhos
  const { buildWelcomeEmail, buildPaymentConfirmedEmail, buildSubscriptionCanceledEmail } =
    await import("../src/lib/emails/transactional");
  const welcomeHtml = buildWelcomeEmail({ name: "Teste 10.7" }).html;
  const payHtml = buildPaymentConfirmedEmail({ name: "x", planLabel: "Pro", periodEndLabel: "14/07/2026" }).html;
  const cancelHtml = buildSubscriptionCanceledEmail({ name: "x", accessUntilLabel: "05/08/2026" }).html;
  const verifySrc = readFileSync(join(root, "src/app/api/auth/verify-email/route.ts"), "utf8");
  const cancelSrc = readFileSync(join(root, "src/app/api/billing/cancel/route.ts"), "utf8");
  const webhookSrc10 = readFileSync(join(root, "src/app/api/billing/webhook/route.ts"), "utf8");
  check(
    "10.7 Transacionais: builders ok + boas-vindas/cancelamento/pagamento fiados",
    10,
    welcomeHtml.includes("Teste 10.7") &&
      payHtml.includes("Pro") && payHtml.includes("14/07/2026") &&
      cancelHtml.includes("05/08/2026") &&
      verifySrc.includes("sendWelcomeEmail") &&
      cancelSrc.includes("sendSubscriptionCanceledEmail") &&
      webhookSrc10.includes("sendPaymentConfirmedEmail"),
  );

  // 10.8 Checkout com CPF null (grandfathered): pede CPF, valida, persiste e sincroniza customer
  const cpf108Valid = generateValidCpf(778899);
  const cpfNullReq = resolveCheckoutCpf({ userCpf: null });
  const cpfProvided = resolveCheckoutCpf({ userCpf: null, providedCpf: cpf108Valid });
  const cpfInvalid = resolveCheckoutCpf({ userCpf: null, providedCpf: "111.111.111-11" });
  const cpfExisting = resolveCheckoutCpf({ userCpf: cpf108Valid, providedCpf: generateValidCpf(112233) });
  const mockHasUpdate = typeof new MockProvider().updateCustomer === "function";
  const checkoutSrc10 = readFileSync(join(root, "src/app/api/billing/checkout/route.ts"), "utf8");
  const checkoutPageSrc10 = readFileSync(
    join(root, "src/app/(dashboard)/billing/checkout/page.tsx"),
    "utf8",
  );
  check(
    "10.8 Checkout CPF-null: required → persist no CPF válido → invalid + provider.updateCustomer + UI CPF_REQUIRED",
    10,
    cpfNullReq.status === "required" &&
      cpfProvided.status === "ok" &&
      (cpfProvided.status === "ok" && cpfProvided.persist === true) &&
      cpfInvalid.status === "invalid" &&
      (cpfExisting.status === "ok" && cpfExisting.persist === false) &&
      mockHasUpdate &&
      checkoutSrc10.includes("CPF_REQUIRED") &&
      checkoutSrc10.includes("resolveCheckoutCpf") &&
      checkoutSrc10.includes("updateCustomer") &&
      checkoutPageSrc10.includes("CPF_REQUIRED"),
  );

  // 10.9 Checkout CPF-set aplica os mesmos controles anti-fraude do register
  // (hard-block + detectOwnerCpfReuse) e sincroniza o customer de forma idempotente
  check(
    "10.9 Checkout grava cpfHash com anti-fraude: detectOwnerCpfReuse + hard-block CPF_LIMIT + updateCustomer no else",
    10,
    checkoutSrc10.includes("detectOwnerCpfReuse") &&
      checkoutSrc10.includes("CPF_LIMIT") &&
      checkoutSrc10.includes("updateCustomer") &&
      // updateCustomer não pode mais ser one-shot (gated em persist): se travar,
      // o customer órfão nunca recupera o CPF e a assinatura fica presa no 400.
      !checkoutSrc10.includes("else if (cpfResult.persist)") &&
      readFileSync(join(root, "src/lib/audit/labels.ts"), "utf8").includes("billing.checkout.cpf_added"),
  );

  // 10.10 Anti-duplicação de assinatura: checkout cancela a pendente antes de criar;
  // cancel cancela no provider; primitiva existe no provider + mock
  const cancelSrc10 = readFileSync(join(root, "src/app/api/billing/cancel/route.ts"), "utf8");
  const labelsSrc10 = readFileSync(join(root, "src/lib/audit/labels.ts"), "utf8");
  const mockHasCancel = typeof new MockProvider().cancelSubscription === "function";
  check(
    "10.10 cancelSubscription: checkout cancela órfã antes de criar + cancel para cobrança no provider + mock no-op",
    10,
    mockHasCancel &&
      checkoutSrc10.includes("cancelSubscription") &&
      checkoutSrc10.includes("billing.subscription.replaced") &&
      cancelSrc10.includes("cancelSubscription") &&
      !cancelSrc10.includes("TBD em Sprint 5"),
  );

  // 10.11 Hardening da review: guard de webhook stale (não cancela a NEW pelo echo
  // de DELETE da OLD) + audit reconciliável em falha de cancel + labels PT-BR
  check(
    "10.11 Hardening: webhook ignora evento stale + checkout audita órfã não-cancelada + labels dos 3 actions novos",
    10,
    webhookSrc10.includes("staleEvent") &&
      webhookSrc10.includes("billing.webhook.stale_ignored") &&
      checkoutSrc10.includes("billing.subscription.orphan_cancel_failed") &&
      labelsSrc10.includes("billing.subscription.replaced") &&
      labelsSrc10.includes("billing.subscription.orphan_cancel_failed") &&
      labelsSrc10.includes("billing.webhook.stale_ignored"),
  );

  // ====================================================================
  // SPRINT 10 — fatia 2.4: Reset de conta Free (F3)
  // ====================================================================

  // 10.12 Regra de elegibilidade (pura) + wiring da rota + labels
  const resetRouteSrc = readFileSync(join(root, "src/app/api/account/reset/route.ts"), "utf8");
  const labelsSrcReset = readFileSync(join(root, "src/lib/audit/labels.ts"), "utf8");
  check(
    "10.12 resetEligibility: FREE/0/0 permite; pago, com agendamento e 2º reset bloqueiam + rota/labels",
    10,
    resetEligibility({ plan: "FREE", appointmentCount: 0, priorResetCount: 0 }).allowed === true &&
      resetEligibility({ plan: "PRO", appointmentCount: 0, priorResetCount: 0 }).allowed === false &&
      resetEligibility({ plan: "FREE", appointmentCount: 1, priorResetCount: 0 }).allowed === false &&
      resetEligibility({ plan: "FREE", appointmentCount: 0, priorResetCount: 1 }).allowed === false &&
      resetRouteSrc.includes("resetEligibility") &&
      resetRouteSrc.includes('action: "account.reset"') &&
      resetRouteSrc.includes("Serializable") &&
      resetRouteSrc.includes("patientSlotCount: 0") &&
      labelsSrcReset.includes("account.reset") &&
      labelsSrcReset.includes("account.reset_blocked"),
  );

  // 10.13 Limpeza real no DB: apaga Patient + slots + cascade de Appointment + zera counter
  const resetUser = await prisma.user.create({
    data: { name: "Reset Test", email: `reset-${Date.now()}@test.local`, password: "x", clinicName: "Reset Clinic", emailVerifiedAt: new Date(), patientSlotCount: 1 },
  });
  await prisma.subscription.create({ data: { userId: resetUser.id, plan: "FREE", status: "ACTIVE" } });
  const resetPhone = "+5511" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const resetPatient = await prisma.patient.create({
    data: { name: "Reset Patient", phone: resetPhone, phoneCanonical: resetPhone.replace(/\D/g, ""), userId: resetUser.id },
  });
  await prisma.patientQuotaSlot.create({
    data: { userId: resetUser.id, identifierType: "PHONE", identifierHash: hashPhone(resetPhone), patientId: resetPatient.id },
  });
  await prisma.appointment.create({
    data: { userId: resetUser.id, patientId: resetPatient.id, dateTime: new Date(Date.now() + 86_400_000) },
  });
  // Replica a transação de limpeza da rota (a rota em si exige sessão HTTP).
  await prisma.$transaction(async (tx) => {
    await tx.patientQuotaSlot.deleteMany({ where: { userId: resetUser.id } });
    await tx.patient.deleteMany({ where: { userId: resetUser.id } });
    await tx.user.update({ where: { id: resetUser.id }, data: { patientSlotCount: 0 } });
  }, { isolationLevel: "Serializable" });
  const [rPatients, rSlots, rAppts, rUserAfter] = await Promise.all([
    prisma.patient.count({ where: { userId: resetUser.id } }),
    prisma.patientQuotaSlot.count({ where: { userId: resetUser.id } }),
    prisma.appointment.count({ where: { userId: resetUser.id } }),
    prisma.user.findUnique({ where: { id: resetUser.id }, select: { patientSlotCount: true } }),
  ]);
  check(
    "10.13 Reset limpa Patient + slots + cascade Appointment + zera patientSlotCount",
    10,
    rPatients === 0 && rSlots === 0 && rAppts === 0 && rUserAfter?.patientSlotCount === 0,
  );
  await prisma.user.delete({ where: { id: resetUser.id } });

  // 10.14 canResetFreeAccount exposto na subscription + card de UI fiado
  const subRouteSrc = readFileSync(join(root, "src/app/api/billing/subscription/route.ts"), "utf8");
  const configSrcReset = readFileSync(join(root, "src/app/(dashboard)/configuracoes/page.tsx"), "utf8");
  const resetCardSrc = readFileSync(join(root, "src/components/settings/reset-account-card.tsx"), "utf8");
  check(
    "10.14 subscription expõe canResetFreeAccount + configuracoes renderiza ResetAccountCard + usa useResetAccount",
    10,
    subRouteSrc.includes("canResetFreeAccount") &&
      subRouteSrc.includes("resetEligibility") &&
      configSrcReset.includes("ResetAccountCard") &&
      resetCardSrc.includes("useResetAccount") &&
      resetCardSrc.includes("canResetFreeAccount"),
  );

  // ====================================================================
  // SPRINT 10 — fatia 2.3: Dunning + perto-do-limite (F2)
  // ====================================================================
  const DAY = 24 * 60 * 60 * 1000;
  const baseDue = new Date(Date.now() - 10 * DAY);
  const { buildDunningEmail, buildUsageLimitEmail } = await import("../src/lib/emails/transactional");
  const schedulerSrcF2 = readFileSync(join(root, "src/lib/services/scheduler.ts"), "utf8");
  const labelsSrcF2 = readFileSync(join(root, "src/lib/audit/labels.ts"), "utf8");
  const transactionalSrcF2 = readFileSync(join(root, "src/lib/emails/transactional.ts"), "utf8");

  // 10.15 Dunning: função pura (limiares 1/3/7, maior vencido, não-reenvio) +
  // wiring no cron ANTES do billing-maintenance + email DAY_7 com aviso + label
  const day7 = buildDunningEmail({ name: "x", planLabel: "Pro", stage: "DAY_7", suspendsInDays: 0 });
  check(
    "10.15 Dunning: dunningStageDue limiares + ordem cron (notifications antes de maintenance) + email DAY_7 + label",
    10,
    dunningStageDue({ pastDueSince: new Date(), now: new Date(), alreadySentStages: [] }) === null &&
      dunningStageDue({ pastDueSince: baseDue, now: new Date(baseDue.getTime() + 1 * DAY), alreadySentStages: [] })?.stage === "DAY_1" &&
      dunningStageDue({ pastDueSince: baseDue, now: new Date(baseDue.getTime() + 9 * DAY), alreadySentStages: [] })?.stage === "DAY_7" &&
      dunningStageDue({ pastDueSince: baseDue, now: new Date(baseDue.getTime() + 7 * DAY), alreadySentStages: ["DAY_7"] }) === null &&
      schedulerSrcF2.includes("runBillingNotifications") &&
      schedulerSrcF2.indexOf("runBillingNotifications") < schedulerSrcF2.indexOf("runBillingMaintenance") &&
      transactionalSrcF2.includes("sendDunningEmail") &&
      day7.subject.length > 0 && day7.html.includes("suspensa") &&
      labelsSrcF2.includes("billing.dunning.sent"),
  );

  // 10.16 Near-limit: função pura (80/100 + precedência + dedup) + email + label
  const usage100 = buildUsageLimitEmail({ name: "x", threshold: 100, messagesSent: 1000, messagesIncluded: 1000 });
  check(
    "10.16 Near-limit: usageThresholdDue 80/100 + precedência + dedup + email + label",
    10,
    usageThresholdDue({ messagesSent: 790, messagesIncluded: 1000, alreadyNotified: [] }) === null &&
      usageThresholdDue({ messagesSent: 800, messagesIncluded: 1000, alreadyNotified: [] }) === 80 &&
      usageThresholdDue({ messagesSent: 1000, messagesIncluded: 1000, alreadyNotified: [80] }) === 100 &&
      usageThresholdDue({ messagesSent: 1000, messagesIncluded: 1000, alreadyNotified: [80, 100] }) === null &&
      usageThresholdDue({ messagesSent: 5, messagesIncluded: 0, alreadyNotified: [] }) === null &&
      transactionalSrcF2.includes("sendUsageLimitEmail") &&
      usage100.html.includes("1000 de 1000") &&
      labelsSrcF2.includes("billing.usage.threshold_notified"),
  );

  // ====================================================================
  // SPRINT 10 — fatia 2.5: QR Pix com TTL curto + regenerar (F1, Opção A)
  // ====================================================================
  const refreshRouteSrc = readFileSync(join(root, "src/app/api/billing/checkout/refresh/route.ts"), "utf8");
  const providerSrcF1 = readFileSync(join(root, "src/lib/billing/provider.ts"), "utf8");
  const checkoutPageSrcF1 = readFileSync(join(root, "src/app/(dashboard)/billing/checkout/page.tsx"), "utf8");
  const labelsSrcF1 = readFileSync(join(root, "src/lib/audit/labels.ts"), "utf8");
  const mockHasRefresh = typeof new MockProvider().refreshPixCharge === "function";
  const mockRefresh = await new MockProvider().refreshPixCharge({
    providerSubscriptionId: "mock_sub_1", customerId: "mock_cus_1", plan: "PRO", userId: "u1",
  });

  // 10.17 Refresh REUSA a assinatura (não cria nova) — interface + mock + rota
  check(
    "10.17 refreshPixCharge reusa providerSubscriptionId (sem createCheckout/POST subscriptions) + provider/mock",
    10,
    mockHasRefresh &&
      mockRefresh.sessionId === "mock_sub_1" &&
      providerSrcF1.includes("refreshPixCharge") &&
      refreshRouteSrc.includes("refreshPixCharge") &&
      !refreshRouteSrc.includes("createCheckout") &&
      !refreshRouteSrc.includes('"/subscriptions"'),
  );

  // 10.18 TTL curto calibrável + expiresAt do mock dentro da janela + label
  check(
    "10.18 computePixExpiresAt(now,ttl) curto + PIX_QR_TTL_SECONDS finito + label qr_refreshed",
    10,
    computePixExpiresAt(new Date(0), 5).getTime() === 5000 &&
      Number.isFinite(PIX_QR_TTL_SECONDS) && PIX_QR_TTL_SECONDS > 0 && PIX_QR_TTL_SECONDS <= 600 &&
      mockRefresh.expiresAt instanceof Date &&
      labelsSrcF1.includes("billing.checkout.qr_refreshed"),
  );

  // 10.19 Countdown + "Gerar novo QR" no checkout
  check(
    "10.19 checkout/page tem countdown (setInterval + expired) + botão Gerar novo QR + refresh",
    10,
    checkoutPageSrcF1.includes("checkout-refresh-qr") &&
      checkoutPageSrcF1.includes("setInterval") &&
      checkoutPageSrcF1.includes("expired") &&
      checkoutPageSrcF1.includes("/api/billing/checkout/refresh") &&
      checkoutPageSrcF1.includes("checkout-qr-countdown"),
  );

  // ====================================================================
  // SPRINT 11 — LGPD (consent, legal pages, export, soft-delete + purga)
  // ====================================================================
  const DAY11 = 24 * 60 * 60 * 1000;
  const registerSrc11 = readFileSync(join(root, "src/app/api/auth/register/route.ts"), "utf8");
  const registroPageSrc11 = readFileSync(join(root, "src/app/(auth)/registro/page.tsx"), "utf8");
  const authSrc11 = readFileSync(join(root, "src/lib/auth.ts"), "utf8");
  const authHelpersSrc11 = readFileSync(join(root, "src/lib/auth-helpers.ts"), "utf8");
  const rootPageSrc11 = readFileSync(join(root, "src/app/page.tsx"), "utf8");
  const deleteRouteSrc11 = readFileSync(join(root, "src/app/api/account/route.ts"), "utf8");
  const exportSrc11 = readFileSync(join(root, "src/lib/account/export.ts"), "utf8");
  const labelsSrc11 = readFileSync(join(root, "src/lib/audit/labels.ts"), "utf8");
  const schedulerSrc11 = readFileSync(join(root, "src/lib/services/scheduler.ts"), "utf8");

  // 10.20 Consentimento no signup + páginas legais públicas + links
  // (Bug fix 2026-06-24: os links no /registro viraram MODAL via LegalDialog —
  // não navegam mais para outra aba. As páginas públicas seguem existindo.)
  check(
    "10.20 Consent: register grava termsAcceptedAt+LEGAL_VERSION; /termos+/privacidade existem; registro abre modal",
    10,
    registerSrc11.includes("termsAcceptedAt") &&
      registerSrc11.includes("LEGAL_VERSION") &&
      exists("src/app/termos/page.tsx") &&
      exists("src/app/privacidade/page.tsx") &&
      exists("src/lib/legal/content.ts") &&
      registroPageSrc11.includes("LegalDialog") &&
      registroPageSrc11.includes('doc="terms"') &&
      registroPageSrc11.includes('doc="privacy"'),
  );

  // 10.21 Soft-delete: 3 chokepoints de login rejeitam deletedAt + rota anonimiza
  check(
    "10.21 Soft-delete: authorize+getAuthSession+page rejeitam deletedAt; DELETE /api/account anonimiza",
    10,
    authSrc11.includes("account_deleted") &&
      authHelpersSrc11.includes("deletedAt") &&
      rootPageSrc11.includes("getAuthSession") &&
      deleteRouteSrc11.includes("deletedAt: new Date()") &&
      deleteRouteSrc11.includes("deleted-") &&
      labelsSrc11.includes("account.deleted"),
  );

  // 10.22 Export LGPD: rota existe, OMITE segredos, label registrado
  check(
    "10.22 Export: rota existe + omite password/cpfHash/token + label account.exported",
    10,
    exists("src/app/api/account/export/route.ts") &&
      !exportSrc11.includes("password: true") &&
      !exportSrc11.includes("cpfHash: true") &&
      !exportSrc11.includes("emailVerificationToken") &&
      labelsSrc11.includes("account.exported"),
  );

  // 10.23 Purga 30d: função pura + sweep real no DB + wiring no cron + labels
  const purgePure =
    isPatientPurgeDue({ deletedAt: null, patientsPurgedAt: null, now: new Date() }) === false &&
    isPatientPurgeDue({ deletedAt: new Date(Date.now() - 29 * DAY11), patientsPurgedAt: null, now: new Date() }) === false &&
    isPatientPurgeDue({ deletedAt: new Date(Date.now() - 31 * DAY11), patientsPurgedAt: null, now: new Date() }) === true;

  const purgeUser = await prisma.user.create({
    data: {
      name: "Purge Test", email: `purge-${Date.now()}@test.local`, password: "x", clinicName: "Purge",
      emailVerifiedAt: new Date(), patientSlotCount: 1, deletedAt: new Date(Date.now() - 40 * DAY11),
    },
  });
  const purgePhone = "+5511" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const purgePatient = await prisma.patient.create({
    data: { name: "Purge Patient", phone: purgePhone, phoneCanonical: purgePhone.replace(/\D/g, ""), userId: purgeUser.id },
  });
  await prisma.patientQuotaSlot.create({
    data: { userId: purgeUser.id, identifierType: "PHONE", identifierHash: hashPhone(purgePhone), patientId: purgePatient.id },
  });
  await runAccountPurge(new Date());
  const [purgedPatients, purgedSlots, purgedUser] = await Promise.all([
    prisma.patient.count({ where: { userId: purgeUser.id } }),
    prisma.patientQuotaSlot.count({ where: { userId: purgeUser.id } }),
    prisma.user.findUnique({ where: { id: purgeUser.id }, select: { patientsPurgedAt: true, patientSlotCount: true } }),
  ]);
  const purgeAudit = await prisma.auditLog.count({ where: { tenantUserId: purgeUser.id, action: "account.purged" } });
  check(
    "10.23 Purga 30d: pura + sweep apaga pacientes + patientsPurgedAt + audit + wiring no cron + labels",
    10,
    purgePure &&
      purgedPatients === 0 && purgedSlots === 0 &&
      !!purgedUser?.patientsPurgedAt && purgedUser?.patientSlotCount === 0 &&
      purgeAudit === 1 &&
      schedulerSrc11.includes("runAccountPurge") &&
      labelsSrc11.includes("account.purged"),
  );
  // cleanup do purgeUser (audit é append-only → GUC bypass)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { tenantUserId: purgeUser.id } });
  });
  await prisma.user.delete({ where: { id: purgeUser.id } });

  // ====================================================================
  // BUGFIX 2026-06-24 — login exige e-mail confirmado + reenvio +
  // termos como modal + fix do scroll lateral (relato dos sócios)
  // ====================================================================
  console.log("\n━━━ BUGFIX 2026-06-24 ━━━\n");

  const { authOptions: bugAuthOptions, EmailNotVerifiedError: BugEmailErr } =
    await import("../src/lib/auth");
  const bugBcrypt = await import("bcryptjs");
  // A função real fica em `.options.authorize` — o next-auth CredentialsProvider
  // retorna `{ ...defaults, authorize: () => null, options: <as suas opções> }` e
  // só faz o merge (suas opções vencem) ao normalizar os providers em runtime.
  const authorizeFn = (bugAuthOptions.providers[0] as unknown as {
    options: { authorize: (creds: Record<string, string>, req: { headers: Record<string, string> }) => Promise<unknown> };
  }).options.authorize;

  const bugPwd = "senha123";
  const bugHash = await bugBcrypt.hash(bugPwd, 10);
  const unverUser = await prisma.user.create({
    data: {
      name: "Bug Unverif",
      email: `bug-unverif-${Date.now()}@test.local`,
      password: bugHash,
      clinicName: "Bug Clinic",
      emailVerifiedAt: null,
    },
  });

  // 11.30 — login bloqueado quando e-mail não verificado (mesmo com senha certa);
  // senha errada continua retornando null (não distingue o caso de verificação).
  let blockedThrew = false;
  try {
    await authorizeFn({ email: unverUser.email, password: bugPwd }, { headers: {} });
  } catch (e) {
    blockedThrew = e instanceof BugEmailErr;
  }
  const wrongPwdRes = await authorizeFn(
    { email: unverUser.email, password: "errada" },
    { headers: {} },
  );
  check(
    "11.30 Login bloqueado p/ e-mail não verificado (throw EmailNotVerifiedError); senha errada → null",
    10,
    blockedThrew && wrongPwdRes === null,
  );

  // 11.31 — após verificar o e-mail, authorize passa e retorna o usuário.
  await prisma.user.update({
    where: { id: unverUser.id },
    data: { emailVerifiedAt: new Date() },
  });
  const okRes = (await authorizeFn(
    { email: unverUser.email, password: bugPwd },
    { headers: {} },
  )) as { id: string } | null;
  check(
    "11.31 Após emailVerifiedAt setado, authorize retorna o usuário",
    10,
    !!okRes && okRes.id === unverUser.id,
  );

  // 11.32 — endpoint de reenvio existe + ciclo de token (volta a não-verificado,
  // gera token, verifica e zera o token).
  await prisma.user.update({
    where: { id: unverUser.id },
    data: { emailVerifiedAt: null },
  });
  const { createVerificationToken: bugCreateTok, verifyEmailToken: bugVerifyTok } =
    await import("../src/lib/anti-fraud/email-verification");
  const vtoken = await bugCreateTok(unverUser.id);
  const afterCreate = await prisma.user.findUnique({
    where: { id: unverUser.id },
    select: { emailVerificationToken: true },
  });
  const verifyRes = await bugVerifyTok(vtoken);
  const afterVerify = await prisma.user.findUnique({
    where: { id: unverUser.id },
    select: { emailVerifiedAt: true, emailVerificationToken: true },
  });
  check(
    "11.32 Reenvio: endpoint existe + createVerificationToken/verifyEmailToken faz o ciclo",
    10,
    exists("src/app/api/auth/resend-verification/route.ts") &&
      !!afterCreate?.emailVerificationToken &&
      verifyRes.ok &&
      !!afterVerify?.emailVerifiedAt &&
      afterVerify?.emailVerificationToken === null,
  );

  // cleanup do unverUser
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { tenantUserId: unverUser.id } });
  });
  await prisma.user.delete({ where: { id: unverUser.id } });

  // 11.33 — Termos/Privacidade como MODAL (LegalDialog) no cadastro e no layout
  // auth; o /registro não navega mais para /termos (abria outra aba).
  const layoutSrcBug = readFileSync(join(root, "src/app/(auth)/layout.tsx"), "utf8");
  check(
    "11.33 Termos/Privacidade como modal (LegalDialog) no cadastro+layout — sem abrir nova aba",
    10,
    exists("src/components/legal/legal-dialog.tsx") &&
      registroPageSrc11.includes("LegalDialog") &&
      !registroPageSrc11.includes('href="/termos"') &&
      layoutSrcBug.includes("LegalDialog") &&
      !layoutSrcBug.includes('href="/termos"'),
  );

  // 11.34 — Scroll lateral: honeypot usa clip (não left:-9999px); badge do
  // reCAPTCHA escondido via CSS; atribuição obrigatória presente no form.
  const globalsSrcBug = readFileSync(join(root, "src/app/globals.css"), "utf8");
  check(
    "11.34 Scroll lateral: honeypot com clip (sem -9999px) + badge reCAPTCHA escondido + atribuição",
    10,
    !registroPageSrc11.includes("-9999px") &&
      registroPageSrc11.includes("clipPath") &&
      globalsSrcBug.includes(".grecaptcha-badge") &&
      registroPageSrc11.includes("Protegido por reCAPTCHA"),
  );

  // 11.35 — Normalização de e-mail (achado do review): conta gravada em lowercase
  // é encontrada no login mesmo digitando em MAIÚSCULAS/com espaços (loginSchema
  // faz trim().toLowerCase() e authorize usa o valor normalizado no lookup).
  const normEmail = `norm-${Date.now()}@test.local`;
  const normHash = await bugBcrypt.hash("senha123", 10);
  const normUser = await prisma.user.create({
    data: { name: "Norm Test", email: normEmail, password: normHash, clinicName: "Norm", emailVerifiedAt: new Date() },
  });
  const normRes = (await authorizeFn(
    { email: `  ${normEmail.toUpperCase()}  `, password: "senha123" },
    { headers: {} },
  )) as { id: string } | null;
  check(
    "11.35 Login normaliza e-mail (MAIÚSCULAS/espaços) e acha a conta lowercase",
    10,
    !!normRes && normRes.id === normUser.id,
  );
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { tenantUserId: normUser.id } });
  });
  await prisma.user.delete({ where: { id: normUser.id } });

  // 11.36 — Documento do dono aceita CPF **ou** CNPJ (signup + checkout). Pura,
  // sem DB: valida o dispatch, o schema do registro, a máscara e o hash por tipo
  // (CPF mantém o namespace `cpf:` → compat com hashes já gravados).
  const { validateDocument: validateDoc36, formatDocument: formatDoc36 } = await import(
    "../src/lib/anti-fraud/document"
  );
  const { hashCpf: hashCpf36, hashDocument: hashDoc36 } = await import(
    "../src/lib/billing/identifiers"
  );
  const { registerSchema: regSchema36 } = await import("../src/lib/validations/auth");
  const VALID_CNPJ_36 = "11.222.333/0001-81";
  const VALID_CPF_36 = "111.444.777-35";
  const doc36Cnpj = validateDoc36(VALID_CNPJ_36);
  const doc36Cpf = validateDoc36(VALID_CPF_36);
  const reg36Cnpj = regSchema36.safeParse({
    name: "Empresa LTDA",
    email: "cnpj36@test.local",
    password: "senha123",
    clinicName: "Clínica PJ",
    cpf: VALID_CNPJ_36,
  }).success;
  const reg36Garbage = !regSchema36.safeParse({
    name: "X Ltda",
    email: "bad36@test.local",
    password: "senha123",
    clinicName: "Clinica",
    cpf: "123456789012", // 12 dígitos: nem CPF nem CNPJ
  }).success;
  check(
    "11.36 Signup aceita CPF e CNPJ (validateDocument + registerSchema + máscara + hash por tipo)",
    10,
    doc36Cnpj.valid &&
      doc36Cnpj.kind === "CNPJ" &&
      doc36Cpf.valid &&
      doc36Cpf.kind === "CPF" &&
      reg36Cnpj &&
      reg36Garbage &&
      formatDoc36("11222333000181") === VALID_CNPJ_36 &&
      hashDoc36("11144477735") === hashCpf36("11144477735") &&
      hashDoc36("11222333000181") !== hashDoc36("11144477735"),
  );

  // 11.37 — Override admin (beta/cortesia): conta FREE ganha entitlements de
  // PREMIUM (msgs 5000, ilimitado) SEM mexer em plan/status (cobrança intacta);
  // desligar reverte na hora (msgs 50). Pura + DB.
  const { effectivePlanTier: effPlan37, PLANS: PLANS37 } = await import("../src/lib/billing/plans");
  const { check: entCheck37 } = await import("../src/lib/billing/entitlements");
  const { getCurrentUsage: getUsage37 } = await import("../src/lib/billing/usage");

  const beta37 = await prisma.user.create({
    data: {
      name: "Beta Tester",
      email: `beta-${Date.now()}@test.local`,
      password: "x",
      clinicName: "Beta Co",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.subscription.create({
    data: {
      userId: beta37.id,
      plan: "FREE",
      status: "ACTIVE",
      adminOverrideUntil: new Date("2099-12-31T00:00:00.000Z"),
    },
  });
  const subOn37 = await prisma.subscription.findUnique({ where: { userId: beta37.id } });
  const usageOn37 = await getUsage37(beta37.id);
  const entOn37 = await entCheck37(beta37.id, "message.send");
  // desliga o override
  await prisma.subscription.update({
    where: { userId: beta37.id },
    data: { adminOverrideUntil: null },
  });
  const subOff37 = await prisma.subscription.findUnique({ where: { userId: beta37.id } });
  const usageOff37 = await getUsage37(beta37.id);
  check(
    "11.37 Override beta: FREE→PREMIUM (msgs 5000) sem mexer no plan/status; desligar reverte (50)",
    10,
    effPlan37(subOn37) === "PREMIUM" &&
      usageOn37.messagesIncluded === PLANS37.PREMIUM.messagesIncluded &&
      entOn37.allowed === true &&
      subOn37?.plan === "FREE" &&
      subOn37?.status === "ACTIVE" &&
      effPlan37(subOff37) === "FREE" &&
      usageOff37.messagesIncluded === PLANS37.FREE.messagesIncluded,
    `msgsOn=${usageOn37.messagesIncluded} msgsOff=${usageOff37.messagesIncluded}`,
  );
  // cleanup do 11.37
  await prisma.usageCounter.deleteMany({ where: { userId: beta37.id } });
  await prisma.subscription.delete({ where: { userId: beta37.id } }).catch(() => {});
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { tenantUserId: beta37.id } });
  });
  await prisma.user.delete({ where: { id: beta37.id } });

  // 11.38 — Máscara monetária acumuladora (valor médio): preenche da direita em
  // centavos + cap 7 dígitos (99.999,99); Zod do settings rejeita acima do teto.
  const { centsToDisplay: c2d38, rawToCents: r2c38 } = await import("../src/lib/currency-mask");
  const { updateSettingsSchema: setSchema38 } = await import("../src/lib/validations/settings");
  let disp38 = "";
  const type38 = (d: string) => {
    disp38 = c2d38(r2c38(disp38 + d));
    return disp38;
  };
  check(
    "11.38 Máscara monetária acumuladora (5→0,05 … 5.731,28), cap 7 dígitos + Zod max 99.999,99",
    10,
    type38("5") === "0,05" &&
      type38("7") === "0,57" &&
      type38("3") === "5,73" &&
      type38("1") === "57,31" &&
      type38("2") === "573,12" &&
      type38("8") === "5.731,28" &&
      r2c38("99999999") === 9999999 &&
      c2d38(9999999) === "99.999,99" &&
      setSchema38.safeParse({ avgAppointmentValue: 100000 }).success === false &&
      setSchema38.safeParse({ avgAppointmentValue: 99999.99 }).success === true,
  );

  // ====================================================================
  // RODADA 2 (feedback Paonetone) — webhook: casamento FIFO + ack
  // ====================================================================
  console.log("\n━━━ RODADA 2 (webhook FIFO) ━━━\n");

  const fifoStamp = Date.now();
  const fifoUser = await prisma.user.create({
    data: {
      name: "FIFO Test",
      email: `fifo-test-${fifoStamp}@test.local`,
      password: "x",
      clinicName: "FIFO Clinic",
      emailVerifiedAt: new Date(),
      evolutionInstanceName: `fifo-wpp-${fifoStamp}`,
      whatsappStatus: "CONNECTED",
    },
  });
  const fifoPhone = "+5541999990000";
  const fifoPatient = await prisma.patient.create({
    data: { userId: fifoUser.id, name: "Paciente FIFO", phone: fifoPhone },
  });
  const min = 60 * 1000;
  // 3 confirmações enviadas em ordem crescente de confirmationSentAt, com datas
  // futuras crescentes. FIFO casa da confirmação MAIS ANTIGA para a mais nova
  // (A→B→C) — o oposto do LIFO anterior (que casaria C→B→A).
  const apptA = await prisma.appointment.create({
    data: {
      userId: fifoUser.id, patientId: fifoPatient.id, status: "PENDING",
      confirmationSentAt: new Date(fifoStamp - 30 * min), dateTime: new Date(fifoStamp + 120 * min),
    },
  });
  const apptB = await prisma.appointment.create({
    data: {
      userId: fifoUser.id, patientId: fifoPatient.id, status: "PENDING",
      confirmationSentAt: new Date(fifoStamp - 20 * min), dateTime: new Date(fifoStamp + 180 * min),
    },
  });
  const apptC = await prisma.appointment.create({
    data: {
      userId: fifoUser.id, patientId: fifoPatient.id, status: "PENDING",
      confirmationSentAt: new Date(fifoStamp - 10 * min), dateTime: new Date(fifoStamp + 240 * min),
    },
  });

  // Simula respostas "1" sucessivas: cada match confirma e sai do pool PENDING.
  const seq: string[] = [];
  for (let i = 0; i < 4; i++) {
    const m = await findPendingAppointmentForResponse(fifoUser.id, fifoPhone);
    if (!m) {
      seq.push("null");
      break;
    }
    seq.push(m.id);
    await prisma.appointment.update({
      where: { id: m.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  }
  const label = (s: string) =>
    s === apptA.id ? "A" : s === apptB.id ? "B" : s === apptC.id ? "C" : "null";
  check(
    "12.1 webhook casa FIFO (confirmação mais antiga primeiro: A→B→C, depois esgota)",
    10,
    seq[0] === apptA.id && seq[1] === apptB.id && seq[2] === apptC.id && seq[3] === "null",
    `seq=${seq.map(label).join("→")}`,
  );

  // 12.2 — filtro dateTime>=now: agendamento já no passado não casa.
  const fifoPatient2 = await prisma.patient.create({
    data: { userId: fifoUser.id, name: "Paciente Passado", phone: "+5541999990001" },
  });
  await prisma.appointment.create({
    data: {
      userId: fifoUser.id, patientId: fifoPatient2.id, status: "PENDING",
      confirmationSentAt: new Date(fifoStamp - 60 * min), dateTime: new Date(fifoStamp - 5 * min),
    },
  });
  const pastMatch = await findPendingAppointmentForResponse(fifoUser.id, "+5541999990001");
  check("12.2 não casa agendamento já no passado (dateTime < now)", 10, pastMatch === null);

  // cleanup rodada 2 (User cascade → patients/appointments/messageLogs)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { tenantUserId: fifoUser.id } });
  });
  await prisma.user.delete({ where: { id: fifoUser.id } });

  // ====================================================================
  // GOOGLE CALENDAR — FASE A (gate PREMIUM + cifra + modelo + firewall)
  // ====================================================================
  console.log("\n━━━ GOOGLE CALENDAR — FASE A ━━━\n");

  // Chave de cifra efêmera p/ o roundtrip (fora do runner vitest a ausência
  // é erro fatal por design — ver token-crypto.ts).
  process.env.GCAL_TOKEN_ENC_KEY ??= randomBytes(32).toString("hex");
  const { encryptToken: gcalEncrypt, decryptToken: gcalDecrypt } = await import(
    "../src/lib/services/google/token-crypto"
  );

  const gcalUser = await prisma.user.create({
    data: {
      name: "GCal Test",
      email: `gcal-test-${Date.now()}@test.local`,
      password: "x",
      clinicName: "GCal Clinic",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.subscription.create({
    data: { userId: gcalUser.id, plan: "FREE", status: "ACTIVE" },
  });

  // GCAL.1 — gate server-side: FREE não conecta (PLAN_REQUIRED → PREMIUM).
  const gcalFreeDeny = await checkEntitlement(gcalUser.id, "gcal.connect");
  check(
    "GCAL.1 FREE bloqueado em gcal.connect (PLAN_REQUIRED → upgrade PREMIUM)",
    10,
    !gcalFreeDeny.allowed &&
      gcalFreeDeny.reason === "PLAN_REQUIRED" &&
      gcalFreeDeny.upgrade === "PREMIUM",
  );

  // GCAL.2 — override admin (cortesia) libera connect e sync.
  await prisma.subscription.update({
    where: { userId: gcalUser.id },
    data: { adminOverrideUntil: new Date(Date.now() + 60_000) },
  });
  const gcalOverrideConnect = await checkEntitlement(gcalUser.id, "gcal.connect");
  const gcalOverrideSync = await checkEntitlement(gcalUser.id, "gcal.sync");
  check(
    "GCAL.2 override admin (PREMIUM efetivo) permite gcal.connect e gcal.sync",
    10,
    gcalOverrideConnect.allowed && gcalOverrideSync.allowed,
  );

  // GCAL.3 — gcal.convert respeita o gate de e-mail verificado (não é bypass
  // do email-verify que as ações manuais exigem).
  await prisma.user.update({ where: { id: gcalUser.id }, data: { emailVerifiedAt: null } });
  const gcalConvertUnverified = await checkEntitlement(gcalUser.id, "gcal.convert");
  check(
    "GCAL.3 gcal.convert bloqueado sem e-mail verificado (EMAIL_NOT_VERIFIED)",
    10,
    !gcalConvertUnverified.allowed && gcalConvertUnverified.reason === "EMAIL_NOT_VERIFIED",
  );

  // GCAL.4 — cifra roundtrip com chave real + blob versionado.
  const gcalPlain = `refresh-token-${Date.now()}`;
  const gcalBlob = gcalEncrypt(gcalPlain);
  check(
    "GCAL.4 token cifrado roundtrip (AES-256-GCM, blob versionado g1.)",
    10,
    gcalBlob.startsWith("g1.") && !gcalBlob.includes(gcalPlain) && gcalDecrypt(gcalBlob) === gcalPlain,
  );

  // GCAL.5 — modelo 1:1: upsert por userId atualiza (não duplica) e o token
  // persiste cifrado.
  await prisma.googleCalendarConnection.create({
    data: { userId: gcalUser.id, refreshTokenEnc: gcalBlob, googleAccountEmail: "a@g.com" },
  });
  await prisma.googleCalendarConnection.upsert({
    where: { userId: gcalUser.id },
    create: { userId: gcalUser.id, refreshTokenEnc: gcalBlob },
    update: { googleAccountEmail: "b@g.com", status: "NEEDS_RECONSENT" },
  });
  const gcalConns = await prisma.googleCalendarConnection.findMany({
    where: { userId: gcalUser.id },
  });
  check(
    "GCAL.5 GoogleCalendarConnection 1:1 (upsert atualiza; token só cifrado no banco)",
    10,
    gcalConns.length === 1 &&
      gcalConns[0].googleAccountEmail === "b@g.com" &&
      gcalConns[0].status === "NEEDS_RECONSENT" &&
      gcalConns[0].refreshTokenEnc.startsWith("g1."),
  );

  // GCAL.6 — rotas/UI da Fase A existem + OAuth com PKCE/state/consent.
  const gcalRouteBase = "src/app/api/integrations/google-calendar";
  const gcalOauthSrc = readFileSync(join(root, "src/lib/services/google/oauth.ts"), "utf8");
  const gcalCallbackSrc = readFileSync(join(root, `${gcalRouteBase}/callback/route.ts`), "utf8");
  check(
    "GCAL.6 rotas OAuth + card + overlay existem; PKCE S256 + state + prompt=consent",
    10,
    ["connect", "callback", "disconnect", "status", "events"].every((r) =>
      exists(`${gcalRouteBase}/${r}/route.ts`),
    ) &&
      exists("src/components/settings/google-calendar-connection.tsx") &&
      readFileSync(join(root, "src/app/(dashboard)/agenda/page.tsx"), "utf8").includes(
        "GoogleEventBlock",
      ) &&
      gcalOauthSrc.includes("code_challenge_method") &&
      gcalOauthSrc.includes("prompt") &&
      gcalOauthSrc.includes("access_type") &&
      gcalCallbackSrc.includes("verifyStateCookie") &&
      gcalCallbackSrc.includes("codeVerifier"),
  );

  // GCAL.7 — FIREWALL: o serviço de eventos do Google não pode nem MENCIONAR
  // a tabela Appointment (eventos nunca viram agendamento por sync), e o
  // teardown LGPD (delete + purga) revoga o grant.
  const gcalCalendarSrc = readFileSync(join(root, "src/lib/services/google/calendar.ts"), "utf8");
  const accountRouteSrc = readFileSync(join(root, "src/app/api/account/route.ts"), "utf8");
  const purgeSrc = readFileSync(join(root, "src/lib/account/account-purge.ts"), "utf8");
  check(
    "GCAL.7 firewall (calendar.ts não toca Appointment) + teardown LGPD revoga grant",
    10,
    !gcalCalendarSrc.includes("prisma.appointment") &&
      accountRouteSrc.includes("revokeGoogleGrant") &&
      purgeSrc.includes("revokeGoogleGrant"),
  );

  // GCAL.8 (Fase B) — promoção: Appointment + ExternalEvent linkados; o unique
  // (userId, googleEventId) garante idempotência (não promove o mesmo 2×).
  const gcalPatient = await prisma.patient.create({
    data: {
      name: "Promo Paciente",
      phone: "+5511977776666",
      phoneCanonical: "5511977776666",
      userId: gcalUser.id,
    },
  });
  const gcalAppt = await prisma.appointment.create({
    data: {
      patientId: gcalPatient.id,
      userId: gcalUser.id,
      dateTime: new Date(Date.now() + 86_400_000),
      durationMinutes: 30,
    },
  });
  const gcalEventId = `evt-${Date.now()}`;
  await prisma.externalEvent.create({
    data: {
      userId: gcalUser.id,
      googleEventId: gcalEventId,
      title: "Consulta Promo",
      startsAt: gcalAppt.dateTime,
      allDay: false,
      appointmentId: gcalAppt.id,
    },
  });
  let gcalIdempotent = false;
  try {
    await prisma.externalEvent.create({
      data: {
        userId: gcalUser.id,
        googleEventId: gcalEventId,
        title: "dup",
        startsAt: gcalAppt.dateTime,
        allDay: false,
      },
    });
  } catch (e) {
    gcalIdempotent = (e as { code?: string }).code === "P2002";
  }
  const gcalLinked = await prisma.externalEvent.findUnique({
    where: { userId_googleEventId: { userId: gcalUser.id, googleEventId: gcalEventId } },
  });
  check(
    "GCAL.8 promoção: ExternalEvent linkado ao Appointment + unique(userId,googleEventId) idempotente",
    10,
    !!gcalLinked && gcalLinked.appointmentId === gcalAppt.id && gcalIdempotent,
  );

  // GCAL.9 — overlay de-dup: eventos já promovidos somem do overlay (query +
  // filtro presente na rota de events).
  const gcalEventsSrc = readFileSync(join(root, `${gcalRouteBase}/events/route.ts`), "utf8");
  const gcalDedup = await prisma.externalEvent.findMany({
    where: {
      userId: gcalUser.id,
      googleEventId: { in: [gcalEventId, "nao-existe"] },
      appointmentId: { not: null },
    },
    select: { googleEventId: true },
  });
  check(
    "GCAL.9 overlay de-dup esconde eventos promovidos (query só o promovido + predicado de EXCLUSÃO real na rota)",
    10,
    gcalDedup.length === 1 &&
      gcalDedup[0].googleEventId === gcalEventId &&
      gcalEventsSrc.includes("externalEvent.findMany") &&
      // Assere o predicado que carrega a de-dup, não só a existência da query:
      // um filtro invertido (`promotedIds.has`) ou removido derruba este check.
      gcalEventsSrc.includes("!promotedIds.has"),
  );

  // GCAL.10 — FIREWALL Fase B: o scheduler NUNCA pode mencionar ExternalEvent
  // (senão eventos importados herdariam WhatsApp/no-show).
  const gcalSchedulerSrc = readFileSync(join(root, "src/lib/services/scheduler.ts"), "utf8");
  check(
    "GCAL.10 firewall Fase B: scheduler.ts NÃO menciona ExternalEvent",
    10,
    !/externalevent/i.test(gcalSchedulerSrc),
  );

  // GCAL.11 — apagar o Appointment cascateia o ExternalEvent (o evento volta a
  // ser promovível, não fica escondido pra sempre) + rotas Fase B existem.
  await prisma.appointment.delete({ where: { id: gcalAppt.id } });
  const gcalEEAfterDelete = await prisma.externalEvent.findUnique({
    where: { userId_googleEventId: { userId: gcalUser.id, googleEventId: gcalEventId } },
  });
  check(
    "GCAL.11 delete do Appointment cascateia ExternalEvent (evento volta ao overlay) + rotas convert/event-signals existem",
    10,
    gcalEEAfterDelete === null &&
      exists(`${gcalRouteBase}/convert/route.ts`) &&
      exists(`${gcalRouteBase}/event-signals/route.ts`),
  );

  // ====================================================================
  // GOOGLE CALENDAR — FASE C (sync app→Google: espelhar Appointment)
  // ====================================================================
  console.log("\n━━━ GOOGLE CALENDAR — FASE C ━━━\n");

  // GCAL.12 — gate gcal.push (PREMIUM) NÃO exige e-mail verificado (o
  // Appointment já existe; não cria dado no app) + coluna googleEventId existe.
  await prisma.subscription.update({
    where: { userId: gcalUser.id },
    data: { adminOverrideUntil: new Date(Date.now() + 60_000) },
  });
  // gcalUser está com emailVerifiedAt = null desde GCAL.3.
  const gcalPushGate = await checkEntitlement(gcalUser.id, "gcal.push");
  const gcalMirrorPatient = await prisma.patient.create({
    data: {
      name: "Mirror Paciente",
      phone: "+5511966665555",
      phoneCanonical: "5511966665555",
      userId: gcalUser.id,
    },
  });
  const gcalMirrorAppt = await prisma.appointment.create({
    data: {
      patientId: gcalMirrorPatient.id,
      userId: gcalUser.id,
      dateTime: new Date(Date.now() + 172_800_000),
      durationMinutes: 30,
      googleEventId: "caitest123",
      googleCalendarId: "primary",
    },
  });
  check(
    "GCAL.12 gate gcal.push (PREMIUM, sem exigir e-mail verificado) + coluna Appointment.googleEventId",
    10,
    gcalPushGate.allowed && gcalMirrorAppt.googleEventId === "caitest123",
  );

  // GCAL.13 — escopo OAuth virou LEITURA+ESCRITA (calendar.events); readonly não
  // dá escrita; qualquer um dos dois satisfaz a leitura (callback não rejeita).
  const {
    hasWriteScope: gcalHasWrite,
    hasCalendarScope: gcalHasCal,
    CALENDAR_EVENTS_SCOPE: GCAL_WRITE_SCOPE,
    CALENDAR_EVENTS_READONLY_SCOPE: GCAL_RO_SCOPE,
  } = await import("../src/lib/services/google/oauth");
  check(
    "GCAL.13 escopo read/write (calendar.events): hasWriteScope só p/ write; hasCalendarScope p/ ambos",
    10,
    gcalOauthSrc.includes(GCAL_WRITE_SCOPE) &&
      gcalHasWrite(`openid email ${GCAL_WRITE_SCOPE}`) === true &&
      gcalHasWrite(`openid email ${GCAL_RO_SCOPE}`) === false &&
      gcalHasCal(`openid email ${GCAL_RO_SCOPE}`) === true &&
      gcalHasCal(`openid email ${GCAL_WRITE_SCOPE}`) === true,
  );

  // GCAL.14 — firewall nos DOIS sentidos: (a) eventos origem-app somem do overlay
  // (mapGoogleEvent → null pela tag); (b) events route de-dup por
  // Appointment.googleEventId; (c) convert rejeita promover um evento origem-app.
  const {
    mapGoogleEvent: gcalMap,
    appOriginEventId: gcalDeterministicId,
    APP_ORIGIN_TAG: GCAL_TAG,
    APP_ORIGIN_VALUE: GCAL_TAGVAL,
  } = await import("../src/lib/services/google/calendar");
  const gcalConvertSrc = readFileSync(join(root, `${gcalRouteBase}/convert/route.ts`), "utf8");
  const gcalMappedAppOrigin = gcalMap({
    id: "mirror-x",
    status: "confirmed",
    start: { dateTime: "2026-07-07T14:00:00-03:00" },
    end: { dateTime: "2026-07-07T15:00:00-03:00" },
    eventType: "default",
    extendedProperties: { private: { [GCAL_TAG]: GCAL_TAGVAL } },
  });
  check(
    "GCAL.14 firewall 2 sentidos: overlay descarta origem-app (tag) + de-dup por Appointment.googleEventId + convert bloqueia loop",
    10,
    gcalMappedAppOrigin === null &&
      /^[a-v0-9]{5,1024}$/.test(gcalDeterministicId("appt-xyz")) &&
      gcalCalendarSrc.includes("isAppOriginRaw") &&
      gcalEventsSrc.includes("appointment.findMany") &&
      gcalConvertSrc.includes("googleEventId: input.googleEventId"),
  );

  // GCAL.15 — wiring do mirror: rotas disparam via after() e o mirror IGNORA
  // agendamentos promovidos DO Google (externalEvent) + gateia por escopo de escrita.
  const gcalApptRouteSrc = readFileSync(join(root, "src/app/api/appointments/route.ts"), "utf8");
  const gcalApptIdRouteSrc = readFileSync(
    join(root, "src/app/api/appointments/[id]/route.ts"),
    "utf8",
  );
  const gcalMirrorSrc = readFileSync(join(root, "src/lib/services/google/mirror.ts"), "utf8");
  check(
    "GCAL.15 mirror: rotas usam after()+sync*; mirror ignora promovidos (externalEvent) e gateia escopo de escrita",
    10,
    gcalApptRouteSrc.includes("syncAppointmentCreate") &&
      gcalApptRouteSrc.includes("after(") &&
      gcalApptIdRouteSrc.includes("syncAppointmentUpdate") &&
      gcalApptIdRouteSrc.includes("syncAppointmentDelete") &&
      gcalApptIdRouteSrc.includes("googleEventId") &&
      gcalMirrorSrc.includes("externalEvent") &&
      gcalMirrorSrc.includes("hasWriteScope") &&
      gcalMirrorSrc.includes("createGoogleEvent"),
  );

  // ====================================================================
  // MSG — instrução de resposta como bloco fixo (dono do sistema)
  // Bug reportado: usuário editava "Responda 2 para CONFIRMAR ou 5 para
  // CANCELAR" — números que o parser lê ao contrário/ignora. Fix: a instrução
  // deixou de ser texto livre e passou a ser anexada no envio, derivada do
  // parser (fonte única). Ver .context/features/settings.md.
  // ====================================================================
  // MSG.1 — a instrução canônica deriva dos códigos do parser e o parser casa
  // esses mesmos códigos (loop fechado: o número instruído SEMPRE é aceito).
  check(
    "MSG.1 RESPONSE_INSTRUCTION deriva do parser e parseResponse casa os códigos",
    10,
    RESPONSE_INSTRUCTION === `Responda ${CONFIRM_CODE} para CONFIRMAR ou ${CANCEL_CODE} para CANCELAR.` &&
      parseResponse(CONFIRM_CODE) === "CONFIRMED" &&
      parseResponse(CANCEL_CODE) === "CANCELED",
  );

  // MSG.2 — withResponseInstruction anexa a canônica e é idempotente.
  const msgBody = "Olá {nome}, consulta em {data} às {hora}.";
  check(
    "MSG.2 withResponseInstruction anexa canônica + idempotente",
    10,
    withResponseInstruction(msgBody) === `${msgBody}\n\n${RESPONSE_INSTRUCTION}` &&
      withResponseInstruction(withResponseInstruction(msgBody)) === withResponseInstruction(msgBody),
  );

  // MSG.3 — CENÁRIO DO BUG end-to-end: template com números errados embutidos.
  // A mensagem enviada sai com a instrução CANÔNICA (não os números errados), e
  // o paciente que responde o código de confirmar é CONFIRMADO (não cancelado).
  const wrongTemplate =
    "Olá {nome}. Responda 2 para CONFIRMAR ou 5 para CANCELAR.";
  const sentMessage = formatMessage(withResponseInstruction(wrongTemplate), {
    nome: "Maria",
    data: "quinta-feira, 9 de julho",
    hora: "14:30",
    clinica: "Claudia Estética",
  });
  check(
    "MSG.3 template com número errado → envio sai canônico + resposta confirma (não cancela)",
    10,
    sentMessage.endsWith(RESPONSE_INSTRUCTION) &&
      !sentMessage.includes("5 para CANCELAR") &&
      !sentMessage.includes("Responda 2 para CONFIRMAR") &&
      parseResponse(CONFIRM_CODE) === "CONFIRMED",
  );

  // MSG.4 — DB round-trip: salvar (via strip, como faz a rota PUT) um template
  // com instrução embutida guarda só o corpo; o banco nunca duplica a instrução.
  const msgUser = await prisma.user.create({
    data: {
      name: "MSG Test",
      email: `msg-${randomBytes(4).toString("hex")}@test.local`,
      password: "x",
      clinicName: "MSG Clinic",
    },
  });
  await prisma.settings.create({
    data: {
      userId: msgUser.id,
      // Simula o que a rota PUT persiste: aplica stripResponseInstruction antes.
      reminderMessage: stripResponseInstruction(
        "Oi {nome}. Responda 2 para CONFIRMAR ou 5 para CANCELAR agora.",
      ),
    },
  });
  const msgSettings = await prisma.settings.findUnique({ where: { userId: msgUser.id } });
  check(
    "MSG.4 settings guarda só o corpo (sem instrução embutida) e o envio anexa 1×",
    10,
    !!msgSettings &&
      !/responda[^]*confirmar[^]*cancelar/i.test(msgSettings.reminderMessage) &&
      withResponseInstruction(msgSettings.reminderMessage).endsWith(RESPONSE_INSTRUCTION),
  );
  await prisma.user.delete({ where: { id: msgUser.id } });

  // MSG.5 — wiring: schema default sem "Responda"; scheduler anexa; rota faz
  // strip no save; página mostra o aviso fixo com a instrução canônica.
  const schemaSrcMsg = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const schedulerSrcMsg = readFileSync(join(root, "src/lib/services/scheduler.ts"), "utf8");
  const settingsRouteSrcMsg = readFileSync(join(root, "src/app/api/settings/route.ts"), "utf8");
  const configPageSrcMsg = readFileSync(join(root, "src/app/(dashboard)/configuracoes/page.tsx"), "utf8");
  const defaultsBlock = schemaSrcMsg.slice(
    schemaSrcMsg.indexOf("confirmationMessage     String"),
    schemaSrcMsg.indexOf("reminderMessage         String") + 200,
  );
  check(
    "MSG.5 wiring: schema defaults sem instrução + scheduler anexa + rota faz strip + página mostra aviso",
    10,
    !/@default\("[^"]*Responda[^"]*CONFIRMAR[^"]*CANCELAR/.test(defaultsBlock) &&
      schedulerSrcMsg.includes("withResponseInstruction") &&
      settingsRouteSrcMsg.includes("stripResponseInstruction") &&
      configPageSrcMsg.includes("ResponseInstructionNote") &&
      configPageSrcMsg.includes("RESPONSE_INSTRUCTION"),
  );

  // cleanup GCal (cascade apaga a conexão)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { tenantUserId: gcalUser.id } });
  });
  await prisma.user.delete({ where: { id: gcalUser.id } });

  // ====================================================================
  // CLEANUP
  // ====================================================================
  console.log("\n━━━ Limpando dados de teste ━━━");
  await prisma.user.deleteMany({
    where: { id: { in: [testUser.id, quotaUser.id, proUser.id] } },
  });
  // Limpa audit de IPs de teste + o cron.run semeado no check 9.5
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
    await tx.auditLog.deleteMany({ where: { ipAddress: { startsWith: "10.99.99." } } });
    await tx.$executeRawUnsafe(
      `DELETE FROM "AuditLog" WHERE action = 'cron.run' AND metadata->>'fromTest' = 'true'`,
    );
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
  const sprint8 = results.filter((r) => r.sprint === 8);
  const sprint9 = results.filter((r) => r.sprint === 9);
  const sprint10 = results.filter((r) => r.sprint === 10);
  const failed = results.filter((r) => !r.pass);
  console.log(`Sprint 1: ${sprint1.filter((r) => r.pass).length}/${sprint1.length}`);
  console.log(`Sprint 2: ${sprint2.filter((r) => r.pass).length}/${sprint2.length}`);
  console.log(`Sprint 3: ${sprint3.filter((r) => r.pass).length}/${sprint3.length}`);
  console.log(`Sprint 4: ${sprint4.filter((r) => r.pass).length}/${sprint4.length}`);
  console.log(`Sprint 5: ${sprint5.filter((r) => r.pass).length}/${sprint5.length}`);
  console.log(`Sprint 6: ${sprint6.filter((r) => r.pass).length}/${sprint6.length}`);
  console.log(`Sprint 8: ${sprint8.filter((r) => r.pass).length}/${sprint8.length}`);
  console.log(`Sprint 9: ${sprint9.filter((r) => r.pass).length}/${sprint9.length}`);
  console.log(`Sprint 10: ${sprint10.filter((r) => r.pass).length}/${sprint10.length}`);
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
