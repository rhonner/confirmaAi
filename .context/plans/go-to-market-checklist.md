# Go-to-Market — checklist final (pós-monetização v2 + LGPD)

> Estado em **2026-06-20**: a stack está completa e **em produção** — monetização v2 (Sprints 1-10) + LGPD (Sprint 11). O que resta para ligar marketing/aquisição é majoritariamente **fora de código** (depende do fundador). Este doc é a lista de fechamento.

## ✅ Já em produção (código)
- Fluxo core: signup → WhatsApp confirma → Pix paga → Pro ativa automático.
- Billing: checkout (CPF-null corrigido), anti-duplicação de assinatura + cancelamento no provider, dunning 1/3/7 + aviso de perto-do-limite, QR Pix com TTL curto + regenerar.
- Conta: reset Free (1×), **LGPD** — `/termos` + `/privacidade`, aceite no signup, export, exclusão (soft delete + purga 30d).
- Infra: `DIRECT_URL` cadastrada no Vercel (✅ 2026-06-20) → auto-migrate robusto; migration LGPD `20260620194121` aplicada em prod.
- Observabilidade: `/api/health`, Sentry, UptimeRobot (3 monitores).

## 🔲 Pendências do fundador (BLOQUEIAM marketing pleno)

1. **Texto legal — preencher + advogado** 🔴 _(maior bloqueador jurídico)_
   - O conteúdo de `/termos` e `/privacidade` é **rascunho** (`src/lib/legal/content.ts`). Preencher os placeholders `[A PREENCHER: ...]`: **razão social / responsável**, **CPF/CNPJ** (quando houver), **e-mail do encarregado (DPO)**.
   - Ao mudar texto de forma material, **bump `LEGAL_VERSION`** (a versão consentida gravada em `User.termsVersion`).
   - **Revisar com advogado** antes de considerar válido (clínica de saúde + CPF de paciente = dado sensível sob LGPD).

2. **Limpeza de cobranças órfãs no Asaas** 🟠
   - Assinaturas/cobranças PENDING criadas **antes** do fix de retry-duplicado seguem cobrando mensalmente. Cancelar no painel (Asaas → Assinaturas/Cobranças). A aba já costuma estar aberta no perfil de ops.

3. **Safe Browsing (Search Console)** 🟠
   - Monitorar a flag de "phishing" do Chrome em `clinicaorganizada.com` (Search Console já verificado). Se virar listagem central → "Request review". Acompanhar antes de escalar aquisição.

## ⏸️ Travado em CNPJ (quando abrir MEI — ~2-3 meses)
- **NF-e via Asaas** (config feita na Sprint 7; ativar + validar emissão automática em prod).
- **Rodapé com razão social / CNPJ / endereço.**
- Migrar conta Hetzner Individual → Organization (dados de fatura).

## 📋 Follow-ups de código (não bloqueiam)
- **Reconsent de grandfathered**: interstitial quando `User.termsAcceptedAt` é null + versão < atual (cuidar do loop com o gate de email-verify). Coluna já existe.
- **Retention 90d do AuditLog** (dívida Sprint 1 — `runRetentionJob` no scheduler).
- **Premium**: reintroduzir quando multi-profissional OU Google Calendar existirem (hoje `hidden`).

## Referências
- Roadmap/estado: [`monetization-v2.md`](monetization-v2.md) · [`deployment-status.md`](deployment-status.md)
- Features: [`../features/lgpd-account.md`](../features/lgpd-account.md) · [`../features/billing.md`](../features/billing.md) · [`../features/account-reset.md`](../features/account-reset.md)
