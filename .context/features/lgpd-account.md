# Feature: LGPD & Conta (consentimento, export, exclusão + purga)

> Sprint 11 (2026-06-20). Camada legal/LGPD — **pré-requisito pra ligar marketing** (CPF de paciente sem termos/privacidade publicados é passivo jurídico em saúde). Cobre: páginas legais, aceite no signup, exportação de dados e exclusão de conta (soft delete) com purga de pacientes após 30 dias.
>
> ⏸️ **Adiado (sem CNPJ por ~2-3 meses)**: NF-e via Asaas e rodapé com razão social/CNPJ.

## Arquivos

| Camada | Caminho |
| ------ | ------- |
| Conteúdo legal | `src/lib/legal/content.ts` (`LEGAL_VERSION`, `TERMS_SECTIONS`, `PRIVACY_SECTIONS` — **rascunho, revisar com advogado**) |
| Páginas públicas | `src/app/termos/page.tsx`, `src/app/privacidade/page.tsx` + `src/components/legal/legal-page.tsx` |
| Consentimento | `src/app/api/auth/register/route.ts` (grava `termsAcceptedAt/privacyAcceptedAt/termsVersion/consentIp`), `(auth)/registro/page.tsx` (checkbox + links) |
| Export | `src/lib/account/export.ts` (`buildAccountExport`) + `src/app/api/account/export/route.ts` |
| Soft-delete | `src/app/api/account/route.ts` (`DELETE`) |
| Bloqueio de login | `src/lib/auth.ts` (authorize), `src/lib/auth-helpers.ts` (getAuthSession), `src/app/page.tsx` |
| Purga 30d | `src/lib/account/account-purge.ts` (`isPatientPurgeDue` puro + `runAccountPurge`) — no cron `scheduler.ts` |
| UI | `src/components/settings/account-data-card.tsx` (export + excluir) em `/configuracoes` |
| Migration | `20260620194121_sprint11_lgpd_soft_delete_consent` (User: `deletedAt, patientsPurgedAt, termsAcceptedAt, termsVersion, privacyAcceptedAt, consentIp` + `@@index([deletedAt])`) |

## Regras

### Consentimento
- Checkbox **obrigatório** no signup (front gateia com `z.literal(true)`; backend tolerante e **deriva** o timestamp quando `acceptedTerms` é truthy). Grava `termsAcceptedAt = privacyAcceptedAt = now`, `termsVersion = LEGAL_VERSION`, `consentIp = ip`. Reusa o audit `auth.register` (com `termsVersion` no metadata). `LEGAL_VERSION` é a fonte única (página exibe / register grava a mesma string).
- **Grandfathered** (contas pré-Sprint-11): `termsAcceptedAt` fica null (= "nunca aceitou", não forja consentimento). Reconsent (interstitial no próximo login) **adiado** — colide com o gate de email-verify; coluna nullable já distingue os casos.

### Exclusão (soft delete) — `DELETE /api/account`
1. Cancela a assinatura no provider (best-effort).
2. **Anonimiza a PII do dono**: `email → deleted-<id>@deleted.local` (libera o `@unique`), `name/clinicName → "Conta removida"`, `cpf/cpfHash/whatsappPhoneNumber/lastQrcodeBase64 → null`. **Preserva** `termsAcceptedAt/version` (prova legal de consentimento).
3. `User.deletedAt = now` + `Subscription` → `CANCELED`, providerIds limpos.
4. Audit `account.deleted`. Front faz `signOut`.
- **3 chokepoints rejeitam `deletedAt`** (revogação efetiva de JWT stateless): `authorize` (antes do bcrypt), `getAuthSession` (`select deletedAt` → null), `page.tsx` (usa `getAuthSession`).
- **Re-signup** com o email original cria conta NOVA (o original foi anonimizado; cuid garante unicidade do `deleted-<id>@`). Sem reativação self-service.
- Trade-off aceito: zerar `cpfHash` tira a conta do contador anti-fraude `existingSameCpf >= 4` (risco baixo — recaptcha/email/verify ainda exigidos).

### Purga 30d
- `runAccountPurge()` no cron: contas com `deletedAt < now-30d` e `patientsPurgedAt = null` → apaga `PatientQuotaSlot + Patient` (cascade Appointment/MessageLog), seta `patientsPurgedAt + patientSlotCount=0`, audit `account.purged`. Idempotente (`patientsPurgedAt`). `isPatientPurgeDue` é pura/testável.

### Export — `GET /api/account/export`
- Baixa JSON com TODOS os dados do tenant (escopado por `userId`), **não pago** (direito legal). **Omite**: `password`, hashes (`cpfHash`, `identifierHash`), tokens, `phoneCanonical`, QR base64. AuditLog vai **resumido** (sem before/after/metadata). BillingEvent fora. Audit `account.exported`.

## Pontos sensíveis
- **Multi-tenancy**: todas as queries por `userId`. O export e o delete só tocam dados da sessão.
- **Migration**: 1ª desde o incidente de 2026-06-14. Aditiva (tudo nullable). ⚠️ **Antes de deployar, confirmar `DIRECT_URL` no Vercel** (memória `next-action-direct-url`) — `migrate deploy` precisa da conexão direta.
- **Texto legal é RASCUNHO** (`content.ts`) — placeholders `[A PREENCHER: ...]` (razão social, CNPJ futuro, e-mail do DPO). Revisar com advogado antes de valer.

## Validação manual no browser (2026-06-20)
Confirmado via Chrome MCP + DB (usuário descartável):
1. ✅ `/termos` renderiza público (chrome do /precos, "Última atualização", seções + placeholders `[A PREENCHER]`). `/privacidade` usa o mesmo componente.
2. ✅ Rodapé legal no `(auth)/layout` (links Termos/Privacidade no login).
3. ✅ Card "Seus dados e sua conta (LGPD)" em `/configuracoes` (só estado relevante): "Exportar meus dados" + "Excluir minha conta" com textos corretos.
4. ✅ Excluir → AlertDialog → digitar `EXCLUIR` habilita → confirma → `signOut`/redirect.
5. ✅ DB pós-delete: `email = deleted-<id>@deleted.local`, name/clinicName "Conta removida", cpf/cpfHash/whatsapp = null, `deletedAt` setado, subscription CANCELED + providerIds null, **pacientes mantidos (1)** pra purga 30d. Email original **não existe mais → login bloqueado**.
6. ✅ Purga 30d coberta por sprint 10.23 (DB-backed: conta deletada há 40d → pacientes apagados + `patientsPurgedAt`). Export/omissões por 10.22 + review adversarial.

## Como estender
- **Reconsent de grandfathered**: interstitial no login quando `termsAcceptedAt` null E versão < atual (cuidar do loop com email-verify).
- **NF-e + rodapé CNPJ**: quando abrir MEI/CNPJ (ver `deployment-status.md`).
