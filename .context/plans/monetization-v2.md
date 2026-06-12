# Plano: Monetização v2 — Free com limite vitalício de 5 pacientes únicos

> **Pivô estratégico** sobre o `billing-and-audit-roadmap.md` existente. Aquele roadmap propunha cobrança por **mensagens WhatsApp/mês**; este substitui pela métrica de **pacientes únicos vitalícios** (Free = 5 pacientes históricos totais por conta), mantendo a infraestrutura de auditoria e o desenho de webhooks/idempotência. Onde houver conflito, **este documento vence**.
>
> Branch: `v2.0.0`. Stack: Next.js 16 monolito, Prisma v7, Postgres, NextAuth v4, Asaas (recomendado).
>
> **Convenção do orquestrador**: este plano cria 3 features novas (`billing`, `audit`, `plan-quota`) e altera 2 (`patients`, `auth`). Documentar em `.context/features/<nome>.md` ao final de cada fase.

## 🔒 Dívidas técnicas em aberto (índice)

> Itens fechados em sprints futuras estão marcados como `🔒 (DÍVIDA SPRINT 1)` no checklist da sprint correspondente. Esta seção é só um índice cruzado para `grep` rápido.

| Dívida | Origem | Resolve em |
| ------ | ------ | ---------- |
| ~~Cross-tenant CPF detection (paciente)~~ — **descartado** (paciente em múltiplas clínicas é comportamento legítimo, não fraude) | Sprint 1 hardening → não fazer | — |
| ~~Rate limit signup com tabela dedicada `SignupAttempt`~~ | ✅ Sprint 4 | — |
| ~~reCAPTCHA v3 no signup~~ | ✅ Sprint 4 | — |
| ~~Email verification obrigatória~~ | ✅ Sprint 4 | — |
| ~~Disposable email blocklist~~ | ✅ Sprint 4 | — |
| ~~Cross-tenant CPF detection (dono da clínica)~~ | ✅ Sprint 4 | — |
| ~~HMAC explícito do webhook do gateway~~ | ✅ Sprint 5 | — |
| Retention 90d do AuditLog (usa GUC bypass `app.allow_audit_mutation`) | Sprint 1 hardening | [Sprint 10](#sprint-10--receita-passiva-emails-transacionais--admin-1-semana) |
| AuditLog em tx com rollback (trail persiste) | Sprint 1 | **Trade-off aceito** — não vira code change. Documentado em `.context/features/audit.md`. |

---

## 0. Decisões de produto (precisam ser fechadas antes de codar)

### 0.1 Estrutura de planos (recomendação)

Recomendo **3 níveis** (Free + 2 pagos), não 4. Quatro níveis fragmentam decisão e reduzem conversão pra SMB.

| Plano        | Preço/mês  | Pacientes únicos vitalícios | Mensagens/mês | Recursos exclusivos                                                           |
| ------------ | ---------- | --------------------------- | ------------- | ----------------------------------------------------------------------------- |
| **Free**     | R$ 0       | **5 (TOTAL/HISTÓRICO)**     | 50            | CRUD básico, dashboard simples, 1 número WhatsApp                             |
| **Pro**      | R$ 65/mês  | Ilimitado                   | 1.000         | Export CSV, relatórios avançados, lembretes 2-tap, suporte por email          |
| **Premium**  | R$ 110/mês | Ilimitado                   | 5.000         | Multi-profissional, integração Google Calendar, NF-e, suporte prioritário, API |

**Por que 3 e não 4** (Free/Básico/Pro/Premium):
- Free é pra qualificação (tem clínica? mexe com pacientes?). Limite de 5 é pra forçar conversão rápida — não pra reter.
- Básico (R$ 47?) entre Free e Pro canibaliza o Pro. Quem não converte para R$ 97 dificilmente converte pra R$ 47 — vai ficar no Free.
- Premium é teto + diferenciação para clínicas maiores que viram leads orgânicos depois.

**Alternativa "Básico R$ 47"** se quiser testar: oferece **30 pacientes únicos** + 200 mensagens. Útil só se notar muitos cancelamentos do Pro citando preço — não introduzir no MVP.

### 0.2 Trial

Recomendo **NÃO fazer trial pago** no MVP. Substituir por:
- **Free vitalício com 5 pacientes** já é o trial natural — clínica testa com 5 pacientes reais por 1-2 semanas e decide.
- Trial de 14 dias adiciona complexidade (dunning de trial, expiração, captura de cartão upfront/sem cartão) sem ganho claro.
- Reavaliar após 90 dias com dados reais de conversão.

### 0.3 Comportamento ao limite

**Bloqueio duro**, sem grace e sem overage no MVP:
- 6º paciente → bloqueado, paywall.
- 51ª mensagem (Free) → scheduler **não** envia, marca `MessageLog.status = QUOTA_BLOCKED`, paywall.
- Razão: comunicação simples, força decisão. Overage = complexidade de billing variable + dispute risk.

### 0.4 Provedor de cobrança

**Asaas** (Brasil-first):
- Pix nativo + cartão recorrente.
- NF-e automática (legal pra clínicas que exigem).
- API simples, webhook claro, customer portal.
- Taxa: ~1.99% Pix, ~3.99% cartão (mais barato que Stripe BR).
- Encapsular atrás de `src/lib/billing/provider.ts` interface — trocar por Stripe/Pagar.me = 1 arquivo.

**Não usar Stripe BR no MVP**: integração com NF-e exige terceiro (Bling/Conta Azul). Asaas resolve nativo.

### 0.5 Identificador de unicidade do paciente

Esta é a decisão **mais sensível** do projeto. Opções:

| Identificador | Confiabilidade | Fricção UX | Anti-fraude | Recomendação |
| ------------- | -------------- | ---------- | ----------- | ------------ |
| Telefone (atual `Patient.phone`) | Média | Baixa | Fraca (números virtuais grátis em massa) | Manter como dedup secundário |
| CPF | **Alta** | Média (pede mais um campo) | **Forte** (Receita Federal valida formato; reuso entre contas detectável) | **Adotar como primário no Free** |
| Email | Baixa | Baixa | Fraca | Não usar como identificador |
| Nome+nascimento | Baixa | Alta | Falsa segurança | Não usar |

**Decisão**: CPF **opcional** no schema mas **obrigatório** para criar paciente no Free (campo aparece quando `plan = FREE`). Pago não exige (clínica de estética/salão pode não querer pedir).

**Validação**: dígito verificador do CPF (algoritmo determinístico, sem API externa). Reject `00000000000` e CPFs sequenciais.

**Hash**: armazenar `cpf` como SHA-256 com pepper global (`CPF_HASH_PEPPER` env var) em coluna separada `Patient.cpfHash` para LGPD (não vazar CPF em backups/logs). CPF original em coluna `cpf` cifrada at-rest pelo Postgres ou via `pgcrypto`.

### 0.6 Cancelamento e reativação

- Cancelamento: ao final do ciclo (não imediato). Mantém recursos pagos até `currentPeriodEnd`.
- Reativação após cancelamento: usuário volta ao plano sem perder pacientes históricos.
- Downgrade Pro → Free: **não permitir** se conta já tem >5 pacientes históricos. UI mostra "Você precisa exportar e cancelar para voltar ao Free" — fricção intencional.

---

## 1. A regra core — análise profunda

### 1.1 O que é "paciente único vitalício"

Definição operacional precisa:

> Um paciente único é uma linha no banco que **alguma vez** ocupou uma "vaga" no plano Free do tenant, identificada por **CPF (hash) ou telefone canonicalizado**, e essa vaga **nunca é liberada**, mesmo após exclusão.

**NÃO confundir com**:
- "Pacientes ativos" (não-arquivados) — irrelevante pro limite.
- "Pacientes do mês" — irrelevante.
- "Linhas em `Patient`" — não, porque excluído continua contando.

### 1.2 Mecanismo: Patient Quota Ledger

Não dá pra contar `Patient.count()` porque DELETE zeraria. Solução: **tabela append-only** que registra cada paciente único que **alguma vez** existiu.

```prisma
model PatientQuotaSlot {
  id          String   @id @default(cuid())
  userId      String
  identifierType  IdentifierType  // CPF | PHONE
  identifierHash  String          // SHA-256(CPF + pepper) ou phone canônico hashed
  firstSeenAt DateTime @default(now())
  patientId   String?  // FK ao Patient atual; null se foi deletado
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, identifierHash])  // dedup: mesmo paciente recriado não consome 2ª vaga
  @@index([userId])
}

enum IdentifierType { CPF PHONE }
```

**Como funciona**:
- Criar paciente: tenta `INSERT` em `PatientQuotaSlot`. Se conflita (`@@unique`), reaproveita slot existente (atualiza `patientId`).
- Excluir paciente: `Patient` é deletado, `PatientQuotaSlot` permanece com `patientId = null`.
- Recriar paciente com mesmo CPF/phone: cai no slot existente, **não consome nova vaga**.
- Free quota check: `SELECT count(*) FROM PatientQuotaSlot WHERE userId = $1`.

**Por que funciona**:
- Cascade do `User → Patient` não toca em `PatientQuotaSlot` (relação direta `User → PatientQuotaSlot`, mas slot só some se user some — e nesse caso conta toda foi).
- Idempotente: importar CSV duas vezes não dobra contagem.

### 1.3 Brechas, exploits e mitigações

| Exploit | Mecânica | Mitigação |
| ------- | -------- | --------- |
| **Múltiplas contas grátis** | Usuário cria N contas Free para N×5 pacientes | (a) Rate-limit signup por IP (3/dia); (b) reCAPTCHA v3 invisível no signup; (c) device fingerprint (`fpjs.com` free tier — opcional MVP); (d) e-mail validation obrigatória; (e) **CPF do dono da clínica** no signup, hash, dedup global |
| **Telefones descartáveis** | Recebe-SMS, Twilio trial | Forçar CPF como identificador no Free; phone vira só comunicação |
| **CPFs aleatórios válidos** | Gerador online produz CPFs válidos por dígito verificador | Detectar **reuso cross-tenant**: se mesmo `cpfHash` aparece em N tenants, alertar admin. Não bloquear (paciente pode ir em várias clínicas), só sinalizar |
| **Renomear/alterar CPF** | Trocar CPF de paciente existente para "fingir" novo | `PatientQuotaSlot.identifierHash` é imutável — `UPDATE` em `Patient.cpf` cria novo slot, não libera o velho. Resultado: usuário consome 2 vagas. Documentar no UI: "Alterar CPF gasta uma nova vaga do plano". |
| **Excluir e recriar** | DELETE + POST com mesmos dados | Slot persiste, recriação reaproveita. Conta = 1 vaga. ✓ |
| **Editar telefone para "compartilhar" pacientes** | Mudar phone do paciente A pro de B existente | `@@unique([userId, phone])` no Patient impede; `@@unique([userId, identifierHash])` no slot também |
| **API direta** (sem UI) | Curl no `POST /api/patients` ignorando paywall | **Bloqueio no service layer**, não no UI. Middleware `enforceQuota('patient.create')` em toda rota mutadora |
| **Bulk import CSV** | Subir 1000 pacientes de uma vez | Validar quota **antes do loop** + dentro do loop (transação fail-fast); rejeitar import se `slots + linhas > limite` |
| **Webhook Evolution cria paciente?** | Hoje não cria, mas se um dia criar | Webhook respeita quota também — log e ignora |
| **Race condition** | 2 requests simultâneos criam o 5º e 6º paciente | Usar `SELECT count() ... FOR UPDATE` ou unique constraint composta + retry. Ou contador desnormalizado em `User.patientSlotCount` com `UPDATE WHERE patientSlotCount < 5` (atômico) |

### 1.4 Problemas comerciais

- **Conversão muito agressiva**: 5 é pouco. Clínica que faz 5 atendimentos/dia atinge no dia 1. **Resposta**: é proposital — força decisão antes do hábito de uso. Reavaliar após 90 dias com dados.
- **Frustração**: usuário cadastra 5 pacientes, vai pro 6º e bate parede. **Resposta**: alertas progressivos em 60% (3 de 5), 80% (4 de 5), 100% (5 de 5). Modal de upgrade no 4º paciente, não no 6º.
- **Caso edge — clínica de teste**: cadastrou 5 fakes só pra ver o sistema. Agora tá travada. **Resposta**: botão "Reset minha conta" no Free **só** se conta tem 0 agendamentos confirmados (sinal de não-uso real). Limpa `Patient` + `PatientQuotaSlot`. Disponível 1×/conta. Auditado.

### 1.5 Impacto psicológico

- Mensagem de bloqueio importa. Evitar: "Você atingiu o limite". Preferir: "Você cadastrou seus primeiros 5 pacientes! Para continuar, [Upgrade]."
- Mostrar progresso desde o início: barra "2/5 pacientes" no header, mesmo no 1º paciente. Cria expectativa do limite, não surpresa.
- No 4º paciente: modal com "Você está quase no limite. Veja o Pro:" — não bloqueante, fechável.
- No 5º: "Esse é seu último paciente Free. Próximo cadastro requer Pro." — prepara.
- No 6º: paywall fullscreen, opções claras (Pro / Aguardar / Sair).

---

## 2. Modelagem de dados

### 2.1 Novos modelos / enums

```prisma
enum PlanTier { FREE PRO PREMIUM }
enum SubscriptionStatus { ACTIVE PAST_DUE CANCELED SUSPENDED }
enum IdentifierType { CPF PHONE }
enum BillingProvider { ASAAS STRIPE PAGARME }
enum ActorType { USER SYSTEM WEBHOOK ADMIN }

model Subscription {
  id                     String             @id @default(cuid())
  userId                 String             @unique
  plan                   PlanTier           @default(FREE)
  status                 SubscriptionStatus @default(ACTIVE)
  currentPeriodStart     DateTime           @default(now())
  currentPeriodEnd       DateTime?          // null para FREE (não tem ciclo)
  cancelAtPeriodEnd      Boolean            @default(false)
  provider               BillingProvider?   // null para FREE
  providerCustomerId     String?
  providerSubscriptionId String?            @unique
  adminOverrideUntil     DateTime?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
  user                   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model PatientQuotaSlot {
  id              String         @id @default(cuid())
  userId          String
  identifierType  IdentifierType
  identifierHash  String
  firstSeenAt     DateTime       @default(now())
  patientId       String?        // null se paciente foi deletado
  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  patient         Patient?       @relation(fields: [patientId], references: [id], onDelete: SetNull)

  @@unique([userId, identifierHash])
  @@index([userId])
}

model UsageCounter {
  id               String   @id @default(cuid())
  userId           String
  periodStart      DateTime
  periodEnd        DateTime
  messagesSent     Int      @default(0)
  messagesIncluded Int
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, periodStart])
  @@index([userId, periodEnd])
}

model BillingEvent {
  id               String    @id @default(cuid())
  userId           String?
  provider         BillingProvider
  eventType        String
  providerEventId  String    @unique  // idempotência
  payload          Json
  processedAt      DateTime?
  createdAt        DateTime  @default(now())

  @@index([userId, createdAt])
}

model AuditLog {
  id           String    @id @default(cuid())
  createdAt    DateTime  @default(now())
  actorType    ActorType
  actorId      String?
  tenantUserId String?
  action       String    // "patient.create", "billing.checkout.completed", ...
  entityType   String?
  entityId     String?
  ipAddress    String?
  userAgent    String?
  beforeJson   Json?
  afterJson    Json?
  metadata     Json?

  @@index([tenantUserId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([action, createdAt(sort: Desc)])
}

model SignupAttempt {
  id          String   @id @default(cuid())
  ipAddress   String
  emailHash   String
  cpfHash     String?
  fingerprint String?
  succeeded   Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([ipAddress, createdAt])
  @@index([cpfHash])
}
```

### 2.2 Alterações em modelos existentes

```prisma
model User {
  // ... campos atuais ...
  cpf              String?       @unique  // CPF do dono da clínica (signup)
  cpfHash          String?       @unique  // SHA-256 com pepper, indexável globalmente
  patientSlotCount Int           @default(0)  // contador desnormalizado para fast quota check
  subscription     Subscription?
  quotaSlots       PatientQuotaSlot[]
  usageCounters    UsageCounter[]
}

model Patient {
  // ... campos atuais ...
  cpf            String?
  cpfHash        String?      // SHA-256(cpf + pepper). NÃO @unique — pode ser deletado e recriado
  phoneCanonical String       // só dígitos, +55 prefix removido p/ dedup
  archivedAt     DateTime?    // soft archive (não conta no UI mas conta na quota)

  @@unique([userId, cpfHash])  // dedup CPF dentro do tenant
  @@index([userId, archivedAt])
}
```

### 2.3 Migrations sequenciais (ordem importa)

1. **0001_add_audit**: cria `AuditLog`, `ActorType` enum.
2. **0002_add_subscription**: cria `Subscription`, `PlanTier`, `SubscriptionStatus`, `BillingProvider`. Trigger: cada `User` existente recebe `Subscription { plan: FREE, status: ACTIVE }`.
3. **0003_add_quota**: adiciona colunas em `Patient` (cpf, cpfHash, phoneCanonical, archivedAt). Backfill `phoneCanonical = regexp_replace(phone, '\D', '', 'g')`.
4. **0004_quota_slots**: cria `PatientQuotaSlot`. **Backfill**: para cada `Patient` existente, cria slot com `identifierType = PHONE` e `identifierHash = sha256(phoneCanonical + pepper)`. Atualiza `User.patientSlotCount`.
5. **0005_billing**: cria `BillingEvent`, `UsageCounter`, `SignupAttempt`.
6. **0006_user_cpf**: adiciona `User.cpf`, `User.cpfHash`. **Não** obrigar para usuários antigos (só novos signups). Migração faz nullable.

---

## 3. Backend — arquitetura

### 3.1 Camadas

```
src/lib/billing/
├── plans.ts            # config de planos (preço, limites, features)
├── provider.ts         # interface BillingProvider
├── asaas.ts            # implementação Asaas
├── stripe.ts           # (futuro)
├── entitlements.ts     # canCreatePatient, canSendMessage, canExport, ...
├── quota.ts            # logic de PatientQuotaSlot
├── usage.ts            # incrementUsage, resetPeriod
└── webhooks.ts         # handler de eventos do provider

src/lib/audit/
├── context.ts          # AsyncLocalStorage<AuditContext>
├── log.ts              # audit.log(...)
├── prisma-extension.ts # intercepta Prisma create/update/delete
└── labels.ts           # PT-BR labels para actions

src/middleware/
└── audit-context.ts    # popula context no request

src/lib/anti-fraud/
├── signup-rate-limit.ts
└── cpf-validator.ts
```

### 3.2 `plans.ts`

```ts
export const PLANS = {
  FREE: {
    tier: "FREE",
    label: "Grátis",
    priceMonthly: 0,
    patientSlots: 5,
    messagesIncluded: 50,
    features: { exportCsv: false, advancedReports: false, multiProfessional: false, googleCalendar: false, nfe: false, api: false },
  },
  PRO: {
    tier: "PRO",
    label: "Pro",
    priceMonthly: 6500,  // centavos
    patientSlots: null,  // ilimitado
    messagesIncluded: 1000,
    features: { exportCsv: true, advancedReports: true, multiProfessional: false, googleCalendar: false, nfe: false, api: false },
    asaasPlanId: process.env.ASAAS_PRO_PLAN_ID,
  },
  PREMIUM: {
    tier: "PREMIUM",
    label: "Premium",
    priceMonthly: 11000,
    patientSlots: null,
    messagesIncluded: 5000,
    features: { exportCsv: true, advancedReports: true, multiProfessional: true, googleCalendar: true, nfe: true, api: true },
    asaasPlanId: process.env.ASAAS_PREMIUM_PLAN_ID,
  },
} as const;

export type PlanTier = keyof typeof PLANS;
```

### 3.3 `quota.ts` — núcleo do enforcement

```ts
type PatientIdentifier = { cpf?: string; phone: string };

export async function reservePatientSlot(
  userId: string,
  identifier: PatientIdentifier
): Promise<{ ok: true } | { ok: false; reason: "QUOTA_EXCEEDED" | "DUPLICATE" }> {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { userId } });
    const plan = PLANS[sub?.plan ?? "FREE"];

    // Pago = slot ilimitado, mas ainda registra para histórico
    if (plan.patientSlots === null) {
      await registerSlot(tx, userId, identifier);
      return { ok: true };
    }

    const identifierType = identifier.cpf ? "CPF" : "PHONE";
    const hash = identifier.cpf ? hashCpf(identifier.cpf) : hashPhone(canonicalizePhone(identifier.phone));

    // Já existe? reaproveita
    const existing = await tx.patientQuotaSlot.findUnique({
      where: { userId_identifierHash: { userId, identifierHash: hash } },
    });
    if (existing) return { ok: true };

    // Conta atual (com lock)
    const count = await tx.patientQuotaSlot.count({ where: { userId } });
    if (count >= plan.patientSlots) {
      await audit.log({ action: "quota.patient_blocked", tenantUserId: userId, metadata: { plan: plan.tier, count } });
      return { ok: false, reason: "QUOTA_EXCEEDED" };
    }

    await tx.patientQuotaSlot.create({
      data: { userId, identifierType, identifierHash: hash },
    });
    await tx.user.update({ where: { id: userId }, data: { patientSlotCount: { increment: 1 } } });
    return { ok: true };
  }, { isolationLevel: "Serializable" });
}

export async function attachSlotToPatient(userId: string, identifierHash: string, patientId: string) {
  await prisma.patientQuotaSlot.update({
    where: { userId_identifierHash: { userId, identifierHash } },
    data: { patientId },
  });
}
```

### 3.4 `entitlements.ts`

```ts
export type Action =
  | "patient.create"
  | "patient.import"
  | "appointment.create"
  | "message.send"
  | "export.csv"
  | "report.advanced";

type Allow = { allowed: true };
type Deny = { allowed: false; reason: "QUOTA_EXCEEDED" | "PLAN_REQUIRED" | "PAYMENT_PAST_DUE" | "SUSPENDED"; upgrade?: "PRO" | "PREMIUM" };

export async function check(userId: string, action: Action, ctx?: { identifier?: PatientIdentifier }): Promise<Allow | Deny> {
  const sub = await getSubscription(userId);
  if (sub.status === "SUSPENDED") return { allowed: false, reason: "SUSPENDED" };
  if (sub.status === "PAST_DUE") return { allowed: false, reason: "PAYMENT_PAST_DUE" };

  const plan = PLANS[sub.plan];

  switch (action) {
    case "patient.create":
    case "patient.import":
      if (plan.patientSlots === null) return { allowed: true };
      if (ctx?.identifier) {
        const hash = identifierHashOf(ctx.identifier);
        const exists = await prisma.patientQuotaSlot.findUnique({ where: { userId_identifierHash: { userId, identifierHash: hash } } });
        if (exists) return { allowed: true }; // reuso
      }
      const count = await prisma.patientQuotaSlot.count({ where: { userId } });
      if (count >= plan.patientSlots) return { allowed: false, reason: "QUOTA_EXCEEDED", upgrade: "PRO" };
      return { allowed: true };

    case "appointment.create":
      // se patient já existe → ok. Se patient novo no payload → mesmo check de patient.create.
      return ctx?.identifier ? check(userId, "patient.create", ctx) : { allowed: true };

    case "message.send":
      const usage = await getCurrentUsage(userId);
      if (usage.messagesSent >= plan.messagesIncluded) return { allowed: false, reason: "QUOTA_EXCEEDED", upgrade: sub.plan === "FREE" ? "PRO" : "PREMIUM" };
      return { allowed: true };

    case "export.csv":
      return plan.features.exportCsv ? { allowed: true } : { allowed: false, reason: "PLAN_REQUIRED", upgrade: "PRO" };

    case "report.advanced":
      return plan.features.advancedReports ? { allowed: true } : { allowed: false, reason: "PLAN_REQUIRED", upgrade: "PRO" };
  }
}
```

### 3.5 Middleware de bloqueio (route handlers)

Cada rota mutadora chama `entitlements.check` antes de qualquer escrita:

```ts
// src/app/api/patients/route.ts
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return unauthorizedResponse();

  const body = await req.json();
  const validated = createPatientSchema.parse(body);

  const gate = await entitlements.check(session.user.id, "patient.create", {
    identifier: { cpf: validated.cpf, phone: validated.phone },
  });
  if (!gate.allowed) return paywallResponse(gate);

  // ... fluxo normal
}
```

`paywallResponse(gate)` retorna 402 Payment Required (semântico) com `{ error: "QUOTA_EXCEEDED", upgrade: { plan: "PRO", url: "/billing/upgrade?from=patient_quota" } }`. Frontend captura via interceptor TanStack Query e abre modal.

### 3.6 Pontos onde validar (não esquecer NENHUM)

| Endpoint | Action | Onde | Crítico |
| -------- | ------ | ---- | ------- |
| `POST /api/patients` | `patient.create` | route.ts | **SIM** |
| `PUT /api/patients/[id]` | `patient.create` se `cpf`/`phone` mudou | route.ts | **SIM** (mudar identificador = nova vaga) |
| `POST /api/appointments` | Se body inclui patient inline (não tem hoje, mas se vier) | route.ts | Médio |
| `POST /api/patients/import` (futuro) | `patient.import` | route.ts | **SIM** |
| `POST /api/auth/register` | rate-limit signup | rota | **SIM** |
| `scheduler.ts: sendConfirmations/Reminders` | `message.send` | service | **SIM** |
| `GET /api/appointments/export` | `export.csv` | route.ts | Médio |
| `GET /api/dashboard?range=...` advanced ranges | `report.advanced` | route.ts | Baixo (cosmético) |
| Webhook Evolution recebendo paciente novo | `patient.create` | route.ts | **SIM** se um dia criar |

### 3.7 Auditoria — eventos obrigatórios

Adicional ao roadmap original, eventos novos para o modelo de quota:

- `quota.patient_blocked` — bloqueio na criação. metadata: plano, count, identifierType.
- `quota.patient_reused` — slot existente reaproveitado.
- `quota.cpf_changed_consumed_slot` — alterar CPF consumiu nova vaga.
- `signup.rate_limited` — IP bloqueado.
- `signup.cpf_dedup_warning` — mesmo CPF já registrado em outra conta.
- `subscription.upgraded` / `subscription.downgraded` / `subscription.canceled` / `subscription.reactivated`.
- `paywall.shown` (frontend → log via API leve) — funil de conversão.

---

## 4. Anti-fraude (signup)

### 4.1 Camadas defensivas (defesa em profundidade)

1. **Rate limit por IP**: máx **3 signups/24h** por IP. Tabela `SignupAttempt`. Bloqueio retorna 429.
2. **Rate limit por CPF**: 1 conta ativa por CPF do dono da clínica (`@@unique` em `User.cpfHash`). Tentativa: erro "Já existe uma conta com este CPF. [Fazer login]".
3. **reCAPTCHA v3 invisível** no formulário de signup (`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`). Score < 0.5 → bloqueia.
4. **Email verification obrigatória** antes do primeiro paciente. Token via Resend, expira em 24h. Bloqueia criação até verificar.
5. **Disposable email detection**: lista mantida em `src/lib/anti-fraud/disposable-emails.ts` (gerada de `disposable-email-domains` no npm). Reject mailinator/guerrillamail/etc.
6. **Device fingerprint** (opcional MVP, fase 2): FingerprintJS Pro tem free tier 20k/mês. Mesmo fingerprint em > 2 contas Free → flag manual review.
7. **Honeypot field** no form de signup: campo invisível CSS, se preenchido → bot.

### 4.2 Cross-tenant CPF detection (tenant-da-clínica)

Não bloquear automaticamente — a mesma pessoa pode legitimamente ter 2 clínicas. Mas:
- Mesmo `User.cpfHash` em N contas → flag `audit.log({ action: "fraud.cpf_reused", metadata: { count: N, accounts: [...] } })`.
- Dashboard admin lista esses casos pra revisão manual.
- Se N > 3, suspender automaticamente a conta mais nova até revisão.

### 4.3 Cross-tenant CPF detection (paciente)

Pacientes legitimamente vão a múltiplas clínicas → **não tratar como fraude**.
Mas: log para análise de padrões. Útil também pra futuro produto (ex: ficha unificada do paciente entre clínicas, opt-in).

---

## 5. Cobrança — implementação Asaas

### 5.1 Setup (configuração inicial)

- Criar conta sandbox Asaas: https://sandbox.asaas.com
- Criar 2 produtos: "Pro" e "Premium" mensais.
- Pegar IDs e configurar webhook secret.
- Vars de ambiente:
  ```
  ASAAS_API_URL=https://sandbox.asaas.com/api/v3
  ASAAS_API_KEY=...
  ASAAS_WEBHOOK_SECRET=...
  ASAAS_PRO_PLAN_ID=...
  ASAAS_PREMIUM_PLAN_ID=...
  ```

### 5.2 Fluxo Pix

1. Frontend `/billing` → "Assinar Pro" → `POST /api/billing/checkout { plan: "PRO", method: "PIX" }`.
2. Backend cria customer no Asaas (se primeiro pagamento) + assinatura recorrente Pix.
3. Asaas retorna QR code Pix da primeira fatura. Backend retorna ao frontend.
4. Frontend mostra QR code + botão "Já paguei, atualizar".
5. Asaas webhook `PAYMENT_RECEIVED` → backend cria/atualiza `Subscription.status = ACTIVE`, `currentPeriodEnd = now + 30d`.
6. Frontend faz polling em `GET /api/billing/subscription` ou recebe via SSE/WebSocket (MVP: polling 5s, max 5min).

### 5.3 Fluxo Cartão

1. `POST /api/billing/checkout { plan: "PRO", method: "CREDIT_CARD" }` retorna URL do Asaas Checkout Link.
2. Usuário insere cartão na página do Asaas (não tocar em PCI).
3. Asaas confirma → webhook → ativa.
4. Próximas mensalidades cobradas automaticamente.

### 5.4 Webhook handler

```ts
// src/app/api/billing/webhook/route.ts
export async function POST(req: NextRequest) {
  const signature = req.headers.get("asaas-access-token");
  if (signature !== process.env.ASAAS_WEBHOOK_SECRET) {
    await audit.log({ actorType: "WEBHOOK", action: "billing.webhook_invalid_signature", metadata: { ip: req.headers.get("x-forwarded-for") } });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = await req.json();

  // Idempotência
  const existing = await prisma.billingEvent.findUnique({ where: { providerEventId: event.id } });
  if (existing?.processedAt) return NextResponse.json({ ok: true });

  await prisma.billingEvent.upsert({
    where: { providerEventId: event.id },
    create: { provider: "ASAAS", eventType: event.event, providerEventId: event.id, payload: event, userId: await resolveUserId(event) },
    update: {},
  });

  switch (event.event) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
      await activateSubscription(event);
      break;
    case "PAYMENT_OVERDUE":
      await markPastDue(event);
      break;
    case "SUBSCRIPTION_DELETED":
      await cancelSubscription(event);
      break;
  }

  await prisma.billingEvent.update({ where: { providerEventId: event.id }, data: { processedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
```

### 5.5 Lifecycle states

| Status | Como chega | Como sai | UI |
| ------ | ---------- | -------- | -- |
| `ACTIVE` (Free) | Signup | Upgrade → ACTIVE (Pro/Premium) | Tudo normal, badge "Free 3/5" |
| `ACTIVE` (Pago) | Webhook PAYMENT_RECEIVED | Cancel / past_due | Tudo normal, badge "Pro" |
| `PAST_DUE` | Webhook PAYMENT_OVERDUE | Pagar (→ ACTIVE) ou 7d sem pagar (→ SUSPENDED) | Banner amarelo no topo, scheduler ainda envia (grace) |
| `SUSPENDED` | Past due > 7d | Pagamento (→ ACTIVE) | Paywall global exceto `/billing` e `/login` |
| `CANCELED` | Cancel ao fim do ciclo | Resub (→ ACTIVE) | Avisa "expira em X dias" até `currentPeriodEnd` |

### 5.6 Defesa em profundidade

- Cron diário (em `scheduler.ts`) varre subscriptions:
  - `PAST_DUE` há > 7 dias → `SUSPENDED`.
  - `CANCELED` com `currentPeriodEnd < now` → `FREE` (downgrade automático). Se conta tem >5 pacientes, mantém pacientes mas bloqueia novos cadastros.
  - Reset `UsageCounter` no rollover (caso webhook perdido).

---

## 6. UX/UI — paywall e indicadores

### 6.1 Indicador permanente de uso

Header (presente em todo dashboard):

```
┌──────────────────────────────────────────────────┐
│ ConfirmaAí        [3/5 pacientes ▓▓▓░░] [Plano] │
└──────────────────────────────────────────────────┘
```

- Cor: verde (0-60%), amarelo (60-80%), laranja (80-99%), vermelho (100%).
- Click → modal com detalhes do plano + botão upgrade.
- Pago: badge muda pra "Pro" (não mostra contador de pacientes; mostra contador de mensagens se > 50% usado).

### 6.2 Alertas progressivos

- **3/5** (60%): toast amarelo "Você já cadastrou 3 dos 5 pacientes do Free. Conheça o Pro."
- **4/5** (80%): modal não-bloqueante centralizado "Você está quase no limite do plano Free. [Conhecer Pro] [Continuar]"
- **5/5** (100%): banner persistente no topo "Próximo paciente requer plano Pro. [Upgrade]"
- **6º tentativa**: paywall fullscreen.

### 6.3 Paywall fullscreen (no bloqueio)

```
┌───────────────────────────────────────────────────┐
│                                                   │
│            🔒  Você atingiu o limite              │
│                                                   │
│  Você cadastrou seus 5 primeiros pacientes! 🎉   │
│  Para continuar atendendo mais clientes, escolha  │
│  um plano:                                        │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐                 │
│  │     Pro     │  │   Premium   │                 │
│  │  R$ 65/mês  │  │ R$ 110/mês  │                 │
│  │ ✓ Ilimitado │  │ ✓ Tudo do  │                 │
│  │ ✓ 1k msgs   │  │   Pro       │                 │
│  │ ✓ Export    │  │ ✓ 5k msgs   │                 │
│  │             │  │ ✓ NF-e      │                 │
│  │ [Assinar]   │  │ [Assinar]   │                 │
│  └─────────────┘  └─────────────┘                 │
│                                                   │
│              ou [voltar para meus pacientes]      │
└───────────────────────────────────────────────────┘
```

- Não tem botão "Sair sem upgrade" óbvio (só link discreto).
- "Assinar" → `/billing/checkout?plan=PRO|PREMIUM&from=patient_quota`.
- Tracking: `audit.log({ action: "paywall.shown", metadata: { trigger: "patient_quota" } })`.

### 6.4 Páginas novas

- `/precos` (público): comparação dos 3 planos. SEO-friendly. Sem login.
- `/billing` (autenticado): plano atual, próxima cobrança, método, histórico de faturas, botão "Mudar plano", "Gerenciar pagamento" (Asaas portal), "Cancelar".
- `/billing/checkout` (autenticado): seleciona plano + método (Pix/cartão), mostra QR code se Pix.
- `/billing/sucesso` (autenticado): confirmação pós-pagamento.
- `/configuracoes/atividade` (autenticado): histórico de `AuditLog` do tenant. Filtros por tipo, data. Export CSV.
- `/admin/audit` (allowlist email): cross-tenant search.

### 6.5 Microcopy

- Bloqueio: "Esse paciente seria o seu 6º. Faça upgrade para continuar." (não "limite atingido")
- Sucesso: "Bem-vindo ao Pro! Cadastre quantos pacientes precisar." (afirmar o ganho)
- Trial não existe; mensagem em `/precos`: "Comece grátis com 5 pacientes. Sem cartão."

---

## 7. Frontend — implementação

### 7.1 Hooks novos

```ts
useSubscription()       // { plan, status, currentPeriodEnd }
useUsage()              // { patientSlotCount, messageCount, messageLimit }
useEntitlement(action)  // { allowed, reason, upgrade }
```

### 7.2 Componentes

- `<UsageBadge>` — header.
- `<UpgradeModal>` — centralizado, fechável até 5/5.
- `<Paywall>` — fullscreen, do 6º em diante.
- `<PlanCard plan="PRO">` — usado em `/precos` e `/billing`.
- `<FeatureGate feature="exportCsv">{children}</FeatureGate>` — renderiza ou mostra disabled+tooltip.

### 7.3 TanStack Query interceptor

Captura 402 globalmente:

```ts
// src/lib/api-client.ts
function fetchApi<T>(url: string, opts?: RequestInit) {
  // ...
  if (res.status === 402) {
    const body = await res.json();
    showPaywall(body.upgrade);
    throw new PaywallError(body);
  }
  // ...
}
```

---

## 8. Segurança e LGPD

### 8.1 Hash de CPF

`SHA-256(cpf + process.env.CPF_HASH_PEPPER)`. Pepper rotacionável (mas requer rehash de toda base) — não rotacionar exceto em incidente.

### 8.2 LGPD compliance

- CPF do paciente: **só armazenar se necessário** (Free obriga, Pago não). UI: "Pode pular se preferir (apenas planos pagos)".
- Direito ao esquecimento: `DELETE /api/account` apaga `Patient.cpf` e `Patient.cpfHash` mas **mantém** `PatientQuotaSlot.identifierHash` (anonimizado, é só hash). `User` é deletado, `AuditLog` mantém com PII redacted.
- Política de privacidade explícita em `/privacidade`. Aceite no signup com checkbox separado dos Termos.
- Portabilidade: `GET /api/account/export` retorna JSON com tudo do tenant.

### 8.3 Rate limit técnico

Não só signup — proteger endpoints sensíveis:
- `POST /api/auth/login`: 5 tentativas/min/IP.
- `POST /api/billing/webhook`: nada (mas valida assinatura).
- `POST /api/patients`: 30/min/user (anti-bulk fraud).

Implementar com `@upstash/ratelimit` + Redis OR tabela `ApiRateLimit` em Postgres (sem Redis no MVP — mais simples).

---

## 9. Riscos

### 9.1 Técnicos

| # | Risco | Severidade | Mitigação |
| - | ----- | ---------- | --------- |
| 1 | Race condition no 5º/6º paciente | Alta | Transação Serializable + `User.patientSlotCount` com `UPDATE ... WHERE patientSlotCount < limit` (atômico) |
| 2 | Webhook Asaas perdido (subscription não ativa) | Alta | Cron diário concilia `BillingEvent` não-processados; polling no frontend após pagar; botão "já paguei" força recheck |
| 3 | CPF inválido entra como válido | Média | Validador local determinístico + normalize antes de hash |
| 4 | `PatientQuotaSlot.patientId = null` órfão | Baixa | Aceitável (é o ponto). Cron mensal lista slots órfãos para auditoria |
| 5 | Migração 0004 backfill demora em conta grande | Média | Backfill em batches de 1000 com cursor; rodar fora do horário comercial |
| 6 | Asaas down → ninguém consegue pagar | Alta | Status page; modo cortesia (`adminOverrideUntil`) pra extender PAST_DUE manualmente |
| 7 | Bypass via API com token vazado | Alta | Audit em toda mutação; admin alert em `quota.patient_blocked` recorrente do mesmo IP |
| 8 | Reset de conta abusado | Média | 1 reset por conta vitalício + zero agendamentos confirmados pré-reset |
| 9 | Multi-tenant test data poluindo `PatientQuotaSlot` em prod | Média | Seed só em dev; production tem `NODE_ENV` check em endpoints de seed |
| 10 | Timezone (já tratado no v1) | Baixa | Fix v2 já aplicado |

### 9.2 Comerciais

| # | Risco | Mitigação |
| - | ----- | --------- |
| 1 | Limite de 5 muito agressivo, churn no funil | A/B test 5 vs 10 após primeiros 50 signups |
| 2 | Pro a R$ 97 caro pra micro-clínica | Considerar Básico R$ 47 (30 pacientes) só se virar friction confirmada |
| 3 | Concorrência copia o modelo | First-mover + integração WhatsApp já é moat |
| 4 | LGPD trava CPF | Termos explícitos + checkbox separado + opção de não fornecer (mas então vai pra plano Pago direto) |
| 5 | Cancelamento alto pós-pagamento | Onboarding ativo, email no dia 3/7/14, suporte manual via WhatsApp pessoal nos primeiros 30 |

### 9.3 Comunicação ao usuário

Riscos de **percepção**, não técnicos:
- "Sistema ladrão" se bloquear sem aviso. Mitigação: alertas em 60/80/100%, copy positivo.
- "Eu apaguei o paciente, por que ainda conta?" Mitigação: tooltip explícito ao deletar: "A vaga não é liberada. [Saiba mais]".

### 9.4 Escala — invariantes de arquitetura (adicionado 2026-06-10)

> **Premissa do fundador**: "quero vender e vender sem depois precisar mudar banco/arquitetura". Análise por camada do que a stack atual aguenta e qual é o "botão de escala" de cada uma — **nenhum exige rewrite ou migração de dados**.

| Camada | Hoje | Aguenta até | Botão de escala (sem rewrite) |
| ------ | ---- | ----------- | ------------------------------ |
| App (Next.js monolito) | Vercel serverless | indefinido (stateless, escala horizontal automática) | Plano Vercel Pro quando estourar limites do Hobby. Zero mudança de código. |
| Banco (Postgres + Prisma) | Neon/Supabase, multi-tenant por `userId` em DB único | dezenas de milhares de tenants (volume por tenant é minúsculo: centenas de rows/mês) | **Connection pooling obrigatório** (pooled string do Neon/PgBouncer — serverless esgota conexões diretas; vai pro go-live, Sprint 7). Depois: upgrade de tier do Postgres. Schema não muda. |
| Scheduler | Vercel Cron 30min → `GET /api/cron/run` serial | ~centenas de tenants por invocação (limite = timeout da function) | Chunking + time-budget (Sprint 6). Se um dia estourar: disparar o **mesmo endpoint** a partir da VPS Hetzner ou QStash — muda quem chama, não o código de domínio. |
| WhatsApp (Evolution) | 1 VPS CX23 (4GB) multi-instância | ~15-30 instâncias conectadas | Upgrade CX23→CX32→CX42 no painel Hetzner (resize, sem migração). Horizonte distante: 2ª VPS com routing por tenant (coluna `evolutionBaseUrl` nullable no User — migration aditiva trivial quando precisar, não antecipar). |
| Billing | Asaas atrás de `BillingProvider` interface | indefinido | Trocar/adicionar provider = 1 arquivo (`factory.ts`). Já desenhado assim. |
| Auditoria | `AuditLog` append-only no mesmo Postgres | ~10k tenants | Retention 90d (Sprint 10) já segura o crescimento; depois, arquivar em R2/S3 antes do delete. |

**Conclusão**: a arquitetura atual NÃO precisa mudar para escalar com a venda. Os riscos reais de "vender e quebrar" não são de arquitetura — são **operacionais e silenciosos**, e cada um tem sprint própria:

| Risco operacional | Por que ameaça o "rodar sozinho" | Resolve em |
| ----------------- | -------------------------------- | ---------- |
| WhatsApp do tenant desconecta e o scheduler o filtra pra fora **silenciosamente** | Cliente paga, produto não faz nada, ninguém sabe → churn + reputação | **Sprint 8** |
| Mensagens sem gate de quota | Free consome envio ilimitado → custo/abuso cresce com escala, receita não | **Sprint 6** |
| Zero observabilidade (erros, uptime, cron falho, webhook não processado) | Fundador descobre problema pelo cliente cancelando | **Sprint 9** |
| Conexões Postgres esgotadas em serverless | App cai justamente quando o tráfego (vendas) cresce | **Sprint 7** (pooled URL) |
| Churn involuntário (cartão falhou, ninguém cobra) | Receita vaza sem ação humana de recuperação | **Sprint 10** (dunning) |

---

## 10. Sequenciamento (MVP → v2)

### Sprint 1 — Fundação ✅ (2026-05-07)

- [x] Schema: `Subscription`, `PlanTier`, `SubscriptionStatus`, `BillingProvider`, `ActorType`, `AuditLog`.
- [x] Migration `20260507165040_add_audit_and_subscription` (modelos + backfill `Subscription { plan: FREE, status: ACTIVE }` para todo User existente).
- [x] `src/lib/audit/` completo (context ALS + extension + log + labels + route-wrapper + pii helpers).
- [x] Wrapper `auditWrap` / `withFixedActor` aplicado em todas as rotas mutadoras (patients, appointments, settings, whatsapp, register, forgot-password, webhook, cron).
- [x] Eventos de domínio instrumentados: `auth.login.success`/`failed`/`rate_limited`, `auth.logout`, `auth.register`, `signup.attempt`/`rate_limited`, `auth.password_reset_requested`, `appointment.confirmed_by_patient`/`canceled_by_patient`, `message.sent`/`send_failed`, `webhook.evolution.invalid_secret`, `subscription.backfill`.
- [x] Trigger no signup: `register/route.ts` cria `Subscription { plan: FREE, status: ACTIVE }` em transação atômica com User+Settings.
- [x] **Hardening pós-Sprint 1** (2026-05-07):
  - [x] Migration `20260507170554_audit_append_only` — trigger PG `audit_log_immutable` rejeita UPDATE/DELETE em AuditLog (bypass via GUC `app.allow_audit_mutation`).
  - [x] Rate limit em login (10 fails/5min/IP) e register (3 attempts/24h/IP) via queries em AuditLog (sem Redis).
  - [x] PII redaction: `REDACTED_FIELDS` cobre password/lastQrcodeBase64/cpf/cpfHash/identifierHash; helpers `maskPhone`/`maskEmail`/`truncateMessage` para metadata.
  - [x] Webhook Evolution: shared secret opcional via `EVOLUTION_WEBHOOK_SECRET`.
- [x] `.context/features/audit.md` + `.context/features/billing.md` (esqueleto) criados; `.context/features/auth.md`, `scheduler.md`, `webhook-evolution.md` atualizados.
- [x] Testes: 113/113 (16 novos para audit-context/diff/labels/pii) passam em `TZ=UTC` e `TZ=America/Sao_Paulo`.

**Dívidas técnicas registradas em sprints futuras** (todas marcadas com 🔒 (DÍVIDA SPRINT 1) no checklist da sprint que vai resolver — *não esquecer*):
- Retention 90d do AuditLog → **Sprint 10** (ex-Sprint 7, re-sequenciamento 2026-06-10).
- Cross-tenant CPF detection (paciente) → **Sprint 2**.
- Cross-tenant CPF detection (dono da clínica) + reCAPTCHA + email verification + disposable blocklist → **Sprint 4**.
- HMAC explícito do webhook do gateway de pagamento → **Sprint 5**.
- AuditLog em transações com rollback (trail persiste mesmo se tx falhar) — trade-off aceito documentado em `.context/features/audit.md`; não vira code change.

### Sprint 2 — Quota de pacientes ✅ (2026-05-07)

- [x] Schema: `PatientQuotaSlot`, alterações em `Patient` (cpf, cpfHash, phoneCanonical, archivedAt), `User.patientSlotCount`, `IdentifierType`.
- [x] Migration `20260507142334_add_patient_quota_slots` + backfill TS (`scripts/backfill-quota-slots.ts`) — Patients existentes viram slots PHONE.
- [x] `src/lib/billing/`: `plans.ts` (preços R$ 0/65/110, limites, features), `entitlements.ts` (check com Allow/Deny), `quota.ts` (`reserveSlotInTx` Serializable, `attachCpfToExistingSlot`), `identifiers.ts` (canonicalize/hash com namespace `cpf:`/`phone:`).
- [x] `src/lib/anti-fraud/cpf-validator.ts` (DV módulo 11, rejeita sequenciais).
- [x] Gate em `POST /api/patients` + `PUT /api/patients/[id]` com 402 semântico.
- [x] Endpoint `GET /api/billing/subscription`.
- [x] `useSubscription` hook + `PaywallError` no `fetchApi`.
- [x] Form `patient-form-dialog.tsx`: campo CPF formatado, validação client-side, obrigatório no Free, edição de CPF bloqueada após 1ª gravação.
- [x] Audit eventos: `quota.patient_blocked`, `quota.patient_reused`, `quota.slot_promoted_to_cpf`, `patient_quota.backfill`. Labels PT-BR.
- [x] Testes unit: 18 novos para CPF validator e identifiers (deterministic hash, namespace anti-colisão). 131/131 passa.
- [x] ~~Cross-tenant CPF detection (paciente)~~: **decisão revertida** — paciente em múltiplas clínicas é comportamento legítimo (cada um é um cliente diferente, não fraude), então não há valor em logar nem em alertar. Detecção cross-tenant fica restrita ao **dono da clínica** (User.cpfHash em Sprint 4).
- [x] `.context/features/plan-quota.md` criado; `patients.md` e `billing.md` atualizados; índice `.context/README.md` atualizado.

### Sprint 3 — UX de quota ✅ (2026-05-07)

- [x] `<UsageBadge>` no header (`src/components/billing/usage-badge.tsx`) — pill colorido (verde/amarelo/laranja/vermelho) por nível de uso, popover com detalhes, link para `/billing`. Plano pago mostra badge "Pro"/"Premium".
- [x] Hook `useUsage()` em `src/hooks/use-api.ts` — derivado de `useSubscription`, expõe count/limit/percentage/level/isUnlimited.
- [x] `<PaywallModal>` (`src/components/billing/paywall-modal.tsx`) — variantes `soft` (fechável) e `hard` (bloqueante até CTA explícito). Reasons: QUOTA_EXCEEDED / PLAN_REQUIRED / PAYMENT_PAST_DUE / SUSPENDED / CPF_REQUIRED / SOFT_NUDGE.
- [x] `<PlanCard>` (`src/components/billing/plan-card.tsx`) — card comparativo reutilizável usado em paywall, /billing e /precos.
- [x] `<QuotaBanner>` na página `/pacientes` — banner laranja em 80%+ e vermelho em 100%; modal soft único quando atinge 60% (flag em localStorage).
- [x] Refatoração `pacientes/page.tsx` para usar `<PatientFormDialog>` (deduplica form com CPF + paywall handling).
- [x] Página `/billing` (autenticada) — plano atual, uso, comparativo dos 3 planos, placeholder do portal de pagamento (Sprint 5).
- [x] Página `/precos` (pública, com SEO metadata) — comparativo + FAQ.
- [x] `PaywallError` exportado em `use-api.ts`; `fetchApi` captura 402 e lança `PaywallError`.
- [x] Sidebar: novo item "Plano" → `/billing`.
- [x] Seed atualizado (rhonner.matheus@gmail.com agora tem `Subscription { plan: PRO, status: ACTIVE }` + slots de quota corretos).
- [x] E2E Playwright `tests/e2e/quota-paywall.spec.ts` — 4/4 passa (badge, /billing, /precos, sidebar nav).
- [x] Checklist `npm run test:sprints` — 52/52 (15+25+12).

### Sprint 4 — Anti-fraude signup ✅ (2026-05-07)

- [x] Schema: `SignupAttempt`, `User.cpf`, `User.cpfHash`, `User.emailVerifiedAt`, `User.emailVerificationToken @unique`, `User.emailVerificationExpiresAt`. Migration `20260507163134_signup_antifraud` + grandfathering (`emailVerifiedAt = createdAt` para users existentes). Migration `20260507164221_user_cpfhash_not_unique` removeu unique pra permitir caso legítimo médico-com-2-clínicas (defesa fica no detector cross-tenant).
- [x] **Rate limit purpose-built** em `SignupAttempt` (`src/lib/anti-fraud/signup-rate-limit.ts`): 3/24h por IP + 5/24h por emailHash. Substitui o pattern AuditLog-based do Sprint 1.
- [x] **reCAPTCHA v3** front + back (`src/lib/anti-fraud/recaptcha.ts` + `src/hooks/use-recaptcha.ts`). Score < 0.5 bloqueia. Bypass dev sem chave; 503 prod sem chave.
- [x] **Email verification** (`src/lib/anti-fraud/email-verification.ts`): token SHA-256 64-hex, expira 24h, single-use. Resend integration com fallback dev (loga link no console). Endpoint `GET /api/auth/verify-email` + página `/verificar-email?status=ok|expired|not_found|invalid`.
- [x] **Disposable email blocklist** (`src/lib/anti-fraud/disposable-emails.ts`): 70+ domínios (mailinator family, 10minutemail, guerrillamail, yopmail, tempmail, etc).
- [x] **Cross-tenant CPF detection** (`src/lib/anti-fraud/owner-cpf-dedup.ts`): >1 conta com mesmo cpfHash → audit `fraud.cpf_reused_owner`. >3 → auto-suspend mais nova. Hard-block na criação >= 4 com audit + 409.
- [x] **Honeypot** field invisível CSS (`<input name="website">` 9999px off-screen). Se preenchido → 201 fake-success silencioso + audit `signup.honeypot_triggered`.
- [x] **Email não verificado bloqueia** patient.create / appointment.create / patient.import via `entitlements.check` retornando `EMAIL_NOT_VERIFIED`. Capturado pelo `<PaywallModal reason="EMAIL_NOT_VERIFIED" />`.
- [x] Audit events: `signup.attempt`, `signup.rate_limited`, `signup.disposable_email_blocked`, `signup.honeypot_triggered`, `signup.recaptcha_failed`, `signup.email_send_failed`, `auth.email_verified`, `auth.email_verify_failed`, `fraud.cpf_reused_owner`, `subscription.suspended` (auto). Labels PT-BR.
- [x] Frontend `/registro`: campo CPF formatado, checkbox de termos, honeypot field invisível, hook `useRecaptcha`, redirect pra `/verificar-email` após 201.
- [x] Tests unit: 14 novos (disposable + recaptcha). Total vitest: 145+.
- [x] Checks Sprint 4 no `npm run test:sprints`: 12 itens (SignupAttempt table, isDisposableEmail, hashEmail, rate limit, token lifecycle, cross-tenant detect, EMAIL_NOT_VERIFIED gate, file existence). **64/64** total (Sprints 1-4).
- [x] **Chrome MCP walk-through** (regra obrigatória DoD): 9 cenários validados — campo CPF visível, mailinator bloqueado, cadastro válido + email log, link de verify confirma, reuso do token rejeitado, CPF inválido (DV/sequencial) bloqueado, honeypot fake-success silencioso.

### Sprint 5 — Cobrança Asaas ✅ (2026-05-07)

- [x] **`BillingProvider` interface** + helper `eventToSubscriptionPatch` (`src/lib/billing/provider.ts`).
- [x] **`AsaasProvider`** real (Brasil-first, Pix nativo): `/customers`, `/subscriptions`, `/payments/{id}/pixQrCode`. Ativado via `BILLING_PROVIDER=ASAAS`.
- [x] **`MockProvider`** dev (QR fake + HMAC com pepper local) — default em dev, permite todo o fluxo sem chave externa.
- [x] **`factory.ts`** — escolhe provider via env com fallback por `NODE_ENV`.
- [x] Schema: `BillingEvent` (`providerEventId @unique` para idempotência) + `UsageCounter` (Sprint 6 prep). Migration `20260507192022_billing_events_usage`.
- [x] **`POST /api/billing/checkout`** (PIX + cartão).
- [x] **`POST /api/billing/webhook`** com idempotência via P2002.
- [x] 🔒 **(DÍVIDA SPRINT 1)** **HMAC explícito** via `verifyWebhookSignature` do provider. Inválido → 401 + audit `billing.webhook.invalid_signature`.
- [x] **`POST /api/billing/portal`** + **`POST /api/billing/cancel`** + **`POST /api/billing/mock-trigger`** (dev-only).
- [x] Páginas **`/billing/checkout`** (QR Pix + copiar + simular dev) + **`/billing/sucesso`**.
- [x] `/billing` atualizada com Portal + Cancelar (AlertDialog), CTAs dos cards levam ao checkout real.
- [x] **Lifecycle**: `runBillingMaintenance()` no cron diário — PAST_DUE > 7d → SUSPENDED, CANCELED + period < now → downgrade FREE. Audit em cada transição.
- [x] Tests: 11 unit (provider) + 8 sprint checks. **72/72** total no `test:sprints`.
- [x] **Chrome MCP walk-through**: 8 cenários — checkout Pix, mock pay, redirect sucesso, badge muda pra Pro, /billing reflete Pro com próxima cobrança, cancelar com AlertDialog, status pós-cancel.

> **Re-sequenciamento 2026-06-10**: as antigas Sprints 6-8 viraram 6, 10 e 11. Entraram 3 sprints novas (7: go-live, 8: resiliência WhatsApp, 9: observabilidade) motivadas pela premissa "rodar e vender sozinho" — ver análise em [§9.4](#94-escala--invariantes-de-arquitetura-adicionado-2026-06-10). Regra de ouro da ordem: **proteger custo (6) → existir em produção (7) → não falhar silenciosamente (8 e 9) → recuperar receita sozinho (10) → blindagem legal antes de marketing pesado (11)**.

### Sprint 6 — Mensagens, gates e hardening de escala do scheduler ✅ (2026-06-10)

- [x] `src/lib/billing/usage.ts`: `getCurrentUsage` (lazy create por período) + `incrementMessagesSent` (atômico) + `currentPeriodFor` (ciclo pago válido → ciclo; FREE/ciclo expirado → mês calendário UTC).
- [x] Gate `message.send` no scheduler: sem saldo → **não** envia, `MessageLog { status: QUOTA_BLOCKED }` (novo valor do enum) + audit `quota.message_blocked`, **deduplicado** por (appointment, type). Gate também real em `entitlements.check` (402 com current/limit/upgrade).
- [x] Rollover do `UsageCounter`: lazy por design — virada de período = criação de nova linha keyed por `@@unique([userId, periodStart])`; ciclo pago expirado (webhook perdido) cai no fallback de mês calendário, contador nunca congela. Sem job de reset.
- [x] UI badge de mensagens no header (`MessageUsagePill`, só aparece ≥ 50% do limite) + linha de mensagens no popover + `messagesSent/messagesIncluded` no `GET /api/billing/subscription` e `useUsage()`.
- [x] **Escala**: chunking do scheduler — lotes de 200 ordenados por `dateTime asc`, time-budget de 45s (`maxDuration = 60` na rota), `stats.truncated` quando estoura; run seguinte continua.
- [x] **Escala**: índices compostos `Appointment(status, confirmationSentAt)` e `(status, dateTime)` — migration `20260610213959_sprint6_message_quota_and_scheduler_indexes`.
- [x] **Escala**: audit `cron.run` com `SchedulerStats` completo (durationMs, sent, blocked, truncated) a cada execução — heartbeat pro alerta da Sprint 9.
- [x] Helper dev `scripts/set-message-usage.ts` (DoD regra 7).
- [x] Testes: 6 unit (`usage-period.test.ts`) + 7 checks no `test:sprints` (**79/79** total). tsc/vitest/build limpos. Chrome MCP walk-through 6 cenários (ver `scheduler.md` § Validação manual).
- [x] `.context/features/scheduler.md` + `billing.md` atualizados.

### Sprint 7 — Go-live: deploy de produção (2-3 dias de execução)

> **Pré-requisito externo**: decisão de nome/domínio com o sócio (bloqueada desde 2026-05-02). Passo-a-passo completo já escrito em [`deployment-status.md`](deployment-status.md) — esta sprint é executá-lo. **Nada das sprints seguintes vende sem esta.**

- [ ] Comprar domínio + DNS (`evolution.<dominio>` → 49.13.202.135).
- [ ] Hardening da VPS Hetzner (UFW, fail2ban, swap 2GB, unattended-upgrades, SSH sem senha).
- [ ] Stack Evolution: Docker compose (Evolution API + Postgres dedicado + Redis), `EVOLUTION_API_KEY` gerada, Caddy + Let's Encrypt.
- [ ] Conta Asaas **produção**: chaves, webhook URL + `asaas-access-token` no painel, NF-e ativada.
- [ ] Vercel: envs de produção (`BILLING_PROVIDER=ASAAS`, NEXTAUTH, Evolution, etc.).
- [ ] **Escala (crítico)**: `DATABASE_URL` com **pooled connection string** (pooler do Neon/PgBouncer). Conexão direta + serverless = esgotamento de conexões exatamente quando o tráfego cresce. Validar `connection_limit` adequado no Prisma.
- [ ] `npx prisma migrate deploy` contra o DB de produção.
- [ ] **Cadência do cron**: Vercel Hobby limita cron a 1×/dia (`0 3 * * *` atual) — lembretes com janela de 2h não funcionam assim. Configurar disparo externo a cada 15-30 min em `POST /api/cron/run` com `Authorization: Bearer CRON_SECRET` (crontab da VPS Hetzner é a opção sem custo/dependência nova; alternativas: cron-job.org, Vercel Pro).
- [ ] Smoke test E2E real: signup → verificar email → conectar WhatsApp (QR) → paciente → agendamento → confirmação chega no celular → responder "1" → status `CONFIRMED`.
- [ ] Atualizar `deployment-status.md` ao final.

> **Status 2026-06-10**: domínio `clinicaorganizada.com` comprado (Cloudflare), DNS configurado (raiz/www → Vercel, `evolution.` → 49.13.202.135), app v1 no ar na Vercel e Evolution API respondendo com HTTPS. Restante: Asaas prod, envs, pooled DATABASE_URL, cadência do cron, migrations v2 + merge `v2.0.0` → `main`.

### Sprint 8 — Resiliência WhatsApp: anti-churn silencioso (3-4 dias) **[NOVA]**

> **Maior ameaça ao "rodar sozinho"**: a instância Evolution do tenant desconecta → o scheduler filtra `whatsappStatus != CONNECTED` pra fora → as confirmações **param silenciosamente** → cliente paga por um produto que não faz nada → churn. Hoje ninguém é avisado.

- [ ] Detecção: webhook Evolution já recebe `connection.update` — ao transicionar para desconectado, gravar `User.whatsappDisconnectedAt` + audit `whatsapp.disconnected`.
- [ ] **Notificação ao cliente por email** (Resend, infra da Sprint 4): "Seu WhatsApp desconectou — suas confirmações estão pausadas. Reconecte em /configuracoes" — imediato + reforço em 24h se continuar desconectado.
- [ ] Banner vermelho persistente no dashboard enquanto desconectado, CTA direto pro QR code.
- [ ] Job no cron diário: tenants desconectados **com agendamentos futuros** → renotificar + audit `whatsapp.disconnected_with_pending` (são os que estão perdendo valor agora).
- [ ] Health-check da Evolution API no cron: ping no endpoint de instâncias; falha → audit `evolution.health_failed` (consumido pelo `/api/health` da Sprint 9).
- [ ] Métrica agregada: % de tenants conectados (exposta no admin, Sprint 10).
- [ ] Atualizar `.context/features/whatsapp.md` + `webhook-evolution.md` + `scheduler.md`.

### Sprint 9 — Observabilidade: só ser interrompido quando quebra (2 dias) **[NOVA]**

> "Não me preocupar" ≠ não olhar; = **ser alertado apenas quando algo quebra**. Sem isso, o canal de descoberta de incidente é o cliente cancelando.

- [ ] Sentry (free tier) no Next.js: erros de rotas API, scheduler e webhooks com contexto de tenant.
- [ ] Rota **`GET /api/health`** que agrega checks e retorna 500 se qualquer um falhar:
  - último `cron.run` (audit) há mais de 90 min → cron morto;
  - `BillingEvent.processedAt = null` há mais de 1h → webhook de pagamento travado;
  - health-check Evolution (Sprint 8) falhando → VPS/Evolution down.
- [ ] Uptime monitor externo gratuito (UptimeRobot/BetterStack) em: app Vercel, `https://evolution.<dominio>`, e `GET /api/health` — o monitor vira o sistema de alerta (email/push) sem infra própria.
- [ ] Criar `.context/features/observability.md` com runbook curto de incidentes (cron morto → onde olhar; Evolution down → como reiniciar; webhook travado → como reconciliar `BillingEvent`).

### Sprint 10 — Receita passiva: emails transacionais + admin (1 semana)

> Ex-Sprint 7. Dunning automático é motor de receita, não cosmético: recupera churn involuntário (cartão falhou) sem ação humana.

- [ ] **Dunning**: pagamento falhou → emails nos dias 1/3/7 + aviso de suspensão iminente (lifecycle PAST_DUE → SUSPENDED já existe; isto é a camada de comunicação).
- [ ] Emails transacionais (Resend): boas-vindas, pagamento confirmado, cancelamento, próximo do limite (3/5 e 5/5).
- [ ] `/configuracoes/atividade` (audit do próprio user).
- [ ] `/admin/audit` (allowlist) + painel com % de tenants WhatsApp-conectados (métrica da Sprint 8) e casos `fraud.cpf_reused_owner`.
- [ ] Reset de conta Free (1×, com check de zero agendamentos).
- [ ] Onboarding banner com upgrade CTA.
- [ ] 🔒 **(DÍVIDA SPRINT 1)** Retention 90d do `AuditLog`: cron job diário que faz `BEGIN; SET LOCAL app.allow_audit_mutation = 'true'; DELETE FROM "AuditLog" WHERE "createdAt" < now() - INTERVAL '90 days'; COMMIT;` (o GUC bypass-aware foi feito no hardening — ver migration `20260507170554_audit_append_only`). Adicionar como nova função em `src/lib/services/scheduler.ts` `runRetentionJob()` ou cron separado. Métricas: log do número de linhas apagadas. Quando volume justificar (>10k tenants), arquivar em R2/S3 antes do delete.

### Sprint 11 — LGPD e legal (3 dias)

> Ex-Sprint 8. **Pré-requisito para campanha de marketing ativa** — não escalar aquisição antes disto (CPF de paciente sem termos/privacidade publicados é passivo jurídico em saúde).

- [ ] `/termos` e `/privacidade`.
- [ ] Checkbox separado no signup.
- [ ] `GET /api/account/export`.
- [ ] `DELETE /api/account` com redaction.
- [ ] NF-e via Asaas (validar emissão automática em produção — config feita na Sprint 7).
- [ ] Razão social, CNPJ, endereço no rodapé (depende de abrir MEI — ver nota em `deployment-status.md`).

### Total: ~8-9 semanas de execução focada (5 concluídas + 6 sprints restantes)

---

## 11. Checklist consolidado (master)

### Produto
- [ ] Decisão final: 3 planos (Free/Pro/Premium), preços R$ 0 / 97 / 197.
- [ ] Decisão: trial não, mas Free vitalício 5 pacientes.
- [ ] Decisão: bloqueio duro, sem overage MVP.
- [ ] Decisão: Asaas como provider.
- [ ] Decisão: CPF obrigatório no Free, opcional no Pago.

### Backend
- [ ] Schema completo (Subscription, PatientQuotaSlot, UsageCounter, BillingEvent, AuditLog, SignupAttempt).
- [ ] Migrations 0001-0006 + backfill.
- [ ] `src/lib/billing/` (plans, provider, asaas, entitlements, quota, usage, webhooks).
- [ ] `src/lib/audit/` (context, log, prisma-extension, labels).
- [ ] `src/lib/anti-fraud/` (signup-rate-limit, cpf-validator).
- [ ] Gates em todas as rotas mutadoras (lista da seção 3.6).
- [ ] Cron diário (defesa em profundidade billing + reset usage).

### Frontend
- [ ] `<UsageBadge>`, `<UpgradeModal>`, `<Paywall>`, `<PlanCard>`, `<FeatureGate>`.
- [ ] Páginas `/precos`, `/billing`, `/billing/checkout`, `/billing/sucesso`, `/configuracoes/atividade`, `/admin/audit`.
- [ ] Hooks `useSubscription`, `useUsage`, `useEntitlement`.
- [ ] Interceptor 402 → paywall.

### Anti-fraude
- [ ] Rate limit signup (IP + CPF).
- [ ] reCAPTCHA v3.
- [ ] Email verification.
- [ ] Disposable blocklist.
- [ ] Honeypot.
- [ ] (Fase 2) FingerprintJS.

### Segurança
- [ ] Hash CPF com pepper.
- [ ] HMAC validation no webhook.
- [ ] Audit de webhook inválido.
- [ ] Rate limit em rotas sensíveis (login, patients).

### LGPD
- [ ] Termos + Privacidade + checkbox no signup.
- [ ] Export de dados.
- [ ] Delete account com redaction.
- [ ] NF-e ativa.

### Auditoria
- [ ] Eventos de domínio (login, logout, message.sent, etc).
- [ ] Eventos de billing (checkout, webhook, status changes).
- [ ] Eventos de quota (blocked, reused, cpf_changed).
- [ ] `/configuracoes/atividade` para usuário.
- [ ] `/admin/audit` para admin.
- [ ] Retention 90 dias.

### Testes
- [ ] Unit: quota race conditions, CPF validator, dedup logic.
- [ ] Integration: webhook idempotência, lifecycle transitions.
- [ ] E2E: criar 5 pacientes Free → bloqueio → upgrade → desbloqueio.
- [ ] E2E: pagar Pix → ativação.
- [ ] E2E: cancel → permanece até `currentPeriodEnd` → vira FREE com >5 pacientes.

---

## 12. Decisões fechadas (2026-05-07)

1. **Preços**: R$ 0 / **65** / **110** (Free / Pro / Premium). ✅
2. **CPF obrigatório no Free**: SIM. Pago: opcional. ✅
3. **Trial pago**: não no MVP. Free vitalício é o trial. ✅
4. **Provedor**: Asaas. ✅
5. **Reset de conta Free**: 1× vitalício, com check de zero agendamentos confirmados. ✅
6. **Ordem do sprint**: começar pela **fundação (Sprint 1: auditoria + Subscription)**. Sem prazo apertado, prioridade é segurança e correção técnica — auditar é cross-cutting e barato no início, custa muito retrofitar. ✅
7. **Clientes existentes**: viram FREE com slots pré-populados. Quem já tem >5 fica grandfathered (mantém pacientes existentes; criação de novos exige upgrade). ✅

---

> Plano fechado em `2026-05-07`. Branch: `v2.0.0`. Sprints 1-5 concluídas em 2026-05-07.
> **Revisão 2026-06-10**: re-sequenciamento orientado à premissa "rodar e vender sozinho, sem trocar banco/arquitetura depois" — adicionadas Sprints 7 (go-live), 8 (resiliência WhatsApp) e 9 (observabilidade); antigas 7/8 viraram 10/11; §9.4 documenta os invariantes de escala.
> Próximo passo: **Sprint 6** (gates de mensagem + hardening de escala do scheduler) — não depende do domínio, pode começar já. Sprint 7 destrava quando o domínio for decidido com o sócio.
