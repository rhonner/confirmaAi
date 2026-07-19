# Feature: Onboarding + Terminologia por ramo

> No primeiro login, o usuário escolhe o **ramo do negócio**. Isso conclui o
> onboarding e dirige a **terminologia da UI** — ex.: saúde usa "Paciente";
> estética/salão/financeiro/outro usam "Cliente". Feature 2026-07-19.

## Decisões
- Ramos (`enum BusinessType`): `HEALTH` (saúde/clínica/psi/dentista → "Paciente"),
  `AESTHETICS`, `BEAUTY` (salão), `FINANCE`, `OTHER` (todos → "Cliente").
- Wizard de **passo único** (escolher o ramo) — MVP. Passos extra (nome, WhatsApp, 1º cadastro) = follow-up.
- ⚠️ **Só RÓTULOS de UI mudam.** O modelo Prisma `Patient`, as rotas `/api/patients` e a rota `/pacientes`
  mantêm o nome técnico. NÃO renomear código/rotas/modelos.

## Arquivos
| Camada                 | Caminho                                                    |
| ---------------------- | ---------------------------------------------------------- |
| Enum + campos          | `User.businessType?`, `User.onboardingCompletedAt?` (`prisma/schema.prisma`) |
| Migration              | `prisma/migrations/20260719155729_add_business_type_onboarding/` (com backfill) |
| Terminologia (fonte)   | `src/lib/terminology.ts` (`getTerminology`, `BUSINESS_TYPE_LABELS`) |
| Hook (client)          | `src/hooks/use-terminology.ts` (`useTerminology`)          |
| API                    | `src/app/api/onboarding/route.ts` (`POST`)                 |
| Wizard (UI)            | `src/components/onboarding/onboarding-wizard.tsx`          |
| Gate                   | `<OnboardingWizard/>` em `src/app/(dashboard)/layout.tsx`  |
| Sessão                 | `businessType`/`onboardingCompletedAt` no JWT/sessão (`auth.ts`, `types/next-auth.d.ts`) |

## Fluxo
1. `businessType`/`onboardingCompletedAt` são semeados no **JWT/sessão** (espelham `clinicName`).
   Usuários EXISTENTES foram **backfillados** na migration (`onboardingCompletedAt = now`, `businessType` NULL
   → "Paciente") → NÃO veem o wizard. Novos usuários nascem com `onboardingCompletedAt` NULL → veem o wizard.
2. `<OnboardingWizard/>` (dashboard layout) abre um Dialog **sem dismissão** quando
   `session.user.onboardingCompletedAt == null`. Cards de ramo → "Concluir".
3. `POST /api/onboarding { businessType }` grava `businessType` + `onboardingCompletedAt = now` (scoped `userId`).
4. O client chama `useSession().update()` → o callback `jwt` (trigger "update") relê o banco → a sessão reflete
   → o wizard fecha e a **terminologia atualiza app-wide** (ex.: sidebar "Pacientes" → "Clientes").

## Terminologia
- `getTerminology(businessType)` → `{ patient: { singular, plural, article } }`. HEALTH/null → "Paciente";
  resto → "Cliente". Default conservador "Paciente".
- `useTerminology()` (client, lê da sessão) para componentes `"use client"`. Server components: usar
  `getTerminology(businessType)` com o valor vindo da sessão/props.

## Validação
- **E2E no Chrome (2026-07-19):** resetei o onboarding da conta de teste → wizard apareceu → escolhi
  "Estética" → "Concluir" → toast "…aparecem como 'Clientes'" + **sidebar "Pacientes" → "Clientes"**. Conta
  revertida. Gate: tsc · vitest 383 · build · test:sprints 153/153.

## Correções de code-review (xhigh, 2026-07-19)
- **CRÍTICO — JWT stale forçava o wizard na base logada:** após deploy, tokens antigos não têm o claim
  `onboardingCompletedAt` → o `?? null` do session callback abria o wizard (não-dispensável) para TODO
  usuário já logado, mesmo já backfillado. **Fix:** o `jwt` callback agora **relê o banco quando o claim
  está AUSENTE** (`=== undefined`, ≠ null) e popula o token (persiste no próximo fetch do client). `null`
  explícito (usuário novo) NÃO relê. Ver `auth.ts`.
- **Wizard travava o dashboard se o POST falhasse:** era não-dispensável. **Fix:** virou **dispensável**
  (`dismissed` local + `onOpenChange`); reaparece no próximo load enquanto não concluído (nudge, não trava).
- **updateSession frágil pós-POST:** um blip no refresh mostrava erro com o onboarding já salvo. **Fix:** o
  `finish()` fecha o wizard assim que o **POST** persiste; o `updateSession()` é best-effort (o próximo load
  reflete via o lazy-load do jwt).
- **Exaustividade:** `OPTION_ICONS` é `Record<BusinessType, icon>` (novo ramo no enum → erro de compilação).
- Removido campo morto `article` de `Terminology`.

## Trocar o ramo em Configurações (FEITO 2026-07-19)
- Card "Dados da clínica" ganhou um `<select>` **"Ramo do negócio"** (`businessType`) integrado ao form de
  settings (um só "Salvar"). `businessType` foi adicionado ao `updateSettingsSchema` (enum opcional), à rota
  `GET/PUT /api/settings` (lido/gravado no `User`), ao `SettingsResponse` e ao `type Settings` do `use-api`.
  `""` = não definido → **não é enviado** no submit (o enum do backend rejeitaria ""). Após salvar, o
  `onSubmit` já chama `useSession().update()` → a terminologia reflete na hora. **Validado E2E no Chrome:**
  trocar p/ "Saúde" → sidebar "Clientes"→"Pacientes" na hora + toast. Gate: tsc·vitest 386·build·sprints 153/153.

## ⚠️ Deferido (polish — NÃO é bug, decisão do dono quando quiser)
- Rótulos "Paciente" que ficaram: mensagens de toast do **server** (`/api/patients/*`), `plan-meta.ts`,
  `paywall-modal` (const de módulo), `plan-card`, páginas públicas (`precos`, `verificar-email`), e o fallback
  `?? "Paciente"` do `month-view`. São strings server-side / const de módulo / páginas sem sessão.
- Dedup dos `.toLowerCase()` (adicionar `singularLower`/`pluralLower` a `Terminology`) — 8 consumidores.
- Passos extra do wizard (nome/WhatsApp/1º cadastro).

## Como estender
- **Novo ramo**: adicionar ao `enum BusinessType` (migration) + `BUSINESS_TYPE_LABELS` + mapear em
  `getTerminology` (Paciente vs Cliente) + um card/ícone no wizard.
- **Novo termo** (ex.: "Consulta"→"Sessão"): adicionar ao tipo `Terminology` + aos mapas HEALTH/CLIENT.
