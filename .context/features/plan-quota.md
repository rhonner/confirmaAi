# Feature: Plan Quota (vagas vitalícias de paciente)

> Mecanismo que **nunca libera vaga**: cada paciente único registrado pelo tenant ocupa uma vaga em `PatientQuotaSlot` de forma irreversível. No plano `FREE`, o limite é 5 vagas; planos pagos são ilimitados (mas registram histórico).
>
> Esta é a regra core do modelo de negócio. Toda exceção / brecha registrada aqui foi avaliada — qualquer mudança precisa ser intencional.

## Arquivos que compõem a feature

| Camada            | Caminho                                          |
| ----------------- | ------------------------------------------------ |
| Models Prisma     | `prisma/schema.prisma` (`PatientQuotaSlot`, `IdentifierType`, `Patient.cpf/cpfHash/phoneCanonical/archivedAt`, `User.patientSlotCount`) |
| Hashing/canonical | `src/lib/billing/identifiers.ts`                 |
| Validação CPF     | `src/lib/anti-fraud/cpf-validator.ts`            |
| Reserva de vaga   | `src/lib/billing/quota.ts` (`reserveSlotInTx`, `attachCpfToExistingSlot`) |
| Entitlements      | `src/lib/billing/entitlements.ts` (`check`)      |
| Config dos planos | `src/lib/billing/plans.ts`                       |
| Backfill          | `scripts/backfill-quota-slots.ts`                |
| Endpoint          | `src/app/api/billing/subscription/route.ts`      |
| Hook frontend     | `src/hooks/use-api.ts` → `useSubscription`, `PaywallError` |
| Form              | `src/components/forms/patient-form-dialog.tsx` (campo CPF, paywall toast) |
| Schema validação  | `src/lib/validations/patient.ts` (cpfSchema)     |

## Regras

### Identificadores e hash

- **CPF** (quando presente) é **identificador primário**. Validado via DV (módulo 11), rejeita sequenciais (`00000000000`, `11111111111`, …). Armazenado em `Patient.cpf` (canonicalizado, 11 dígitos) e `Patient.cpfHash` (SHA-256 com namespace `cpf:` + `CPF_HASH_PEPPER`).
- **Telefone** sempre presente. Canonicalizado em `Patient.phoneCanonical` (apenas dígitos). Hash com namespace `phone:` + pepper.
- **Namespace nos hashes** previne colisão entre CPF de 11 dígitos e telefone com mesmos dígitos.

### `PatientQuotaSlot`

- 1 paciente ↔ 1 slot via `PatientQuotaSlot.patientId @unique` (FK `onDelete: SetNull`).
- `(userId, identifierHash)` é único globalmente por tenant.
- Slot **NUNCA é deletado** automaticamente. `Patient` deletado → `slot.patientId = null` (órfão).

### Plano Free vs Pago

- **FREE**: `patientSlots = 5`. **CPF obrigatório** (no schema é opcional, mas backend rejeita criação sem CPF via `entitlements.check` retornando `CPF_REQUIRED`).
- **PRO/PREMIUM**: `patientSlots = null` (ilimitado). CPF opcional. Slots ainda são criados (necessário para downgrade futuro).

### Lógica de reserva (`reserveSlotInTx`)

Dentro de uma `prisma.$transaction({ isolationLevel: "Serializable" })`:

1. **Match por qualquer identificador**: query `PatientQuotaSlot` onde `userId=X` e `identifierHash IN (cpf?, phone?)`.
2. Se match com `patientId` ocupado por outro paciente → `SlotConflictError` (HTTP 400).
3. Se match com `patientId = NULL` (órfão) → reusa, atribui patientId, audit `quota.patient_reused`. **Não consome vaga**.
4. Se nenhum match → check quota (`count(slots WHERE userId) >= plan.patientSlots`):
   - Bloqueia → audit `quota.patient_blocked`, retorna `{ ok: false, reason: "QUOTA_EXCEEDED" }`.
   - Permite → cria slot novo (primary = CPF se presente, senão phone). Increment `User.patientSlotCount`.

### Edição de paciente (limitações)

- **Telefone** pode mudar livremente — atualiza `Patient.phone` e `phoneCanonical`. Slot **NÃO** muda (identifier original permanece).
- **CPF**:
  - Adicionar pela primeira vez (slot era PHONE) → atualiza `Patient.cpf/cpfHash` E **promove o slot** para CPF via `attachCpfToExistingSlot` (mesma vaga, identifier mais forte).
  - Mudar CPF (já existia outro) → **rejeitado** com 400. UI orienta: "exclua e recadastre — a vaga é preservada".
  - Remover CPF → **rejeitado** com 400.

## Endpoints

| Método | Path                          | Resposta                            |
| ------ | ----------------------------- | ----------------------------------- |
| GET    | `/api/billing/subscription`   | `{ plan, status, patientSlotCount, patientSlotLimit, currentPeriodEnd, cancelAtPeriodEnd }` |

Sprint 5 adicionará checkout, portal, webhook, etc.

## Pontos sensíveis

- **Race condition**: `reserveSlotInTx` usa `isolationLevel: "Serializable"`. 2 requests simultâneos no 5º slot serializam — um cria, outro recebe `QUOTA_EXCEEDED`. Verificado em testes.
- **`User.patientSlotCount`**: contador desnormalizado para feedback rápido na UI. Atomic increment dentro da tx. Drift teórico se algum write bypass passar fora da tx — backfill script reconcilia.
- **Hash determinístico com pepper**: `CPF_HASH_PEPPER` é segredo de produção. **Rotacionar exige rehash de toda base** (`scripts/rehash-quota-slots.ts` é exemplo dev-only). Em prod, planejar antes.
- **CPF nunca aparece em logs**: redacted em `prisma-extension.ts` `REDACTED_FIELDS` (`cpf`, `cpfHash`).
- **Cross-tenant CPF de paciente**: descartado. Paciente pode legitimamente estar em N clínicas (cada uma é cliente diferente). Detecção cross-tenant fica restrita ao **dono da clínica** (`User.cpfHash` em Sprint 4).
- **Grandfathering**: pacientes pré-Sprint-2 têm `phoneCanonical` populado mas `cpf=NULL`. Continuam funcionando. Form Free **não obriga** CPF na edição (só na criação).
- **Limite cobre criação E import**: gate em `patient.create` E `patient.import` (Sprint 4 será onde import existe).
- **Soft-archive (`Patient.archivedAt`)**: ainda sem UI/uso. Reservado para Sprint 7 (UX) caso usuário queira "esconder" paciente sem perder histórico — slot continua consumindo vaga.

## Validação manual no browser (Sprint 3)

Confirmado em 2026-05-07 via Chrome MCP, fluxo end-to-end:

1. ✅ Login com rhonner.matheus@gmail.com (PRO/ACTIVE) → header mostra badge "Pro" pill (sem contador).
2. ✅ Sidebar tem novo item **"Plano"** entre Pacientes e Configurações.
3. ✅ `/billing` autenticada renderiza com plano atual + 3 cards comparativos + "Plano atual" badge no card correspondente.
4. ✅ `/precos` pública (sem login) renderiza header + 3 cards + FAQ + CTA "Começar grátis".
5. ✅ Após `npx tsx scripts/toggle-admin-plan.ts FREE` + reload:
   - Badge no header vira "5/5 pacientes" com barra **vermelha** (level=blocked, 5 pacientes seedados).
   - Banner vermelho persistente no `/pacientes`: "Você atingiu o limite de pacientes do plano Free".
   - Click no badge abre **popover** com "Plano Grátis", contador, mensagem de bloqueio, link "Ver planos e fazer upgrade →".
6. ✅ "Novo Paciente" → dialog mostra campo CPF com label "CPF" e hint "Obrigatório no plano Free.".
7. ✅ Submit do 6º paciente Free → backend retorna 402, `<PaywallModal>` `hard` abre fullscreen com:
   - Ícone 🔒 + título "Limite de pacientes atingido"
   - Card Pro (R$ 65, "Recomendado") e Premium (R$ 110)
   - Botões "Assinar Pro" / "Assinar Premium" → `/billing`
   - **Sem botão X** de fechar (variant=hard)
   - Click fora não fecha
   - ESC não fecha
8. ✅ Click "Assinar Pro" navega para `/billing` (Link do Next.js).
9. ✅ Após `toggle-admin-plan.ts PRO` + reload: badge volta a "Pro" pill, banner some.

Helper de dev: `scripts/toggle-admin-plan.ts FREE|PRO|PREMIUM` para alternar o plano de rhonner.matheus@gmail.com.

## UX (Sprint 3)

- **`<UsageBadge>`** (`src/components/billing/usage-badge.tsx`) no header de todas as páginas autenticadas. Cor por nível: verde (<60%), amarelo (60–79%), laranja (80–99%), vermelho (100%). Plano pago mostra "Pro"/"Premium" sem contador.
- **`<QuotaBanner>`** (`src/components/billing/quota-banner.tsx`) na página `/pacientes`. Renderiza só em ≥80% (laranja) ou 100% (vermelho). Mostra modal "soft" UMA vez ao passar de 60% (flag localStorage `quota-soft-nudge-shown`).
- **`<PaywallModal>`** (`src/components/billing/paywall-modal.tsx`). Variante `hard` no 402 do `POST /api/patients` (não fecha clicando fora — força CTA). Variante `soft` no banner/auto-nudge (fechável).
- **`<PlanCard>`** (`src/components/billing/plan-card.tsx`) comparativo reutilizável.
- **Hook `useUsage()`** retorna `{ count, limit, percentage, level, isUnlimited }`. `level: ok | warning | alert | blocked` mapeia direto pra cor da UI.
- **`PaywallError`** classe exportada em `src/hooks/use-api.ts`. `fetchApi` captura HTTP 402 e lança esse erro com `{ reason, upgrade, current, limit }`.

## Como estender

- **Mudar limite do FREE** (ex: 10): `PLANS.FREE.patientSlots = 10` em `plans.ts`. Comunicar usuários ativos por email.
- **Adicionar identificador novo** (ex: passport): adicionar valor no enum `IdentifierType`, helper de canonicalização/hash, atualizar `primaryIdentifier`/`allIdentifiers`. Slot continua único por hash.
- **Permitir downgrade Pro → Free com >5 pacientes**: entitlements.check ja gateia criação, então tecnicamente já dá pra downgrade — só não permitir CRIAR novos. UI deve avisar antes do downgrade.
- **Reset de conta Free** — ✅ implementado (Sprint 10, 2026-06-20): apaga Patient + slots e zera a quota, 1× vitalício, só FREE + zero agendamentos. Ver [`account-reset.md`](account-reset.md).
