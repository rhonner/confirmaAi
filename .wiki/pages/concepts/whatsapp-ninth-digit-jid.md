---
title: WhatsApp JID pode vir sem o nono dígito brasileiro
type: concept
created: 2026-06-12
updated: 2026-06-12
tags: [whatsapp, evolution, brasil, telefone, gotcha, webhook]
sources:
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - .context/features/webhook-evolution.md
  - pages/concepts/rhf-radix-gotcha.md
status: stable
---

> Gotcha descoberto no **smoke test de produção** (2026-06-12): paciente cadastrado como `+5541997974990` respondeu "1" e nada aconteceu. O JID do WhatsApp veio `554197974990@s.whatsapp.net` — **sem o nono dígito** — e o match por igualdade exata descartou a resposta silenciosamente.

## Por quê

Números móveis brasileiros registrados no WhatsApp **antes do rollout do nono dígito** mantêm o JID antigo de 8 dígitos (DDD + 8). O envio funciona normal (Evolution aceita o número com 9), mas a **resposta volta com o JID curto** — assimetria que só aparece com pacientes reais.

## Sintoma

- Confirmação chega no paciente ✅
- Paciente responde "1" ✅ (visível nos logs da Evolution: `conversation: '1'`)
- Webhook entrega no app ✅ (200 silencioso)
- Status continua `PENDING` ❌ — o filtro `patient.phone = <jid>` não casa.

Sem erro em lugar nenhum — churn silencioso perfeito. Em escala, toda clínica com pacientes "pré-nono-dígito" teria confirmações que nunca confirmam.

## Fix

`brPhoneCandidates(phone)` em `src/lib/phone.ts`: gera o par com/sem 9 e o lookup usa `phone: { in: candidates }`. Regra: só celular ganha variante (1º dígito do número local 6-9); fixo (2-5) nunca tem 9. Aplicado no match do `messages.upsert` (`webhook/evolution/[instance]/route.ts`).

## Lição de processo

O bug era **invisível em dev/teste** (números de teste são recentes, JID = cadastro). Só smoke test com número real antigo expõe. Reforça a regra do DoD de testar fluxo crítico de verdade — e o diagnóstico veio de ler o log da Evolution na VPS (`docker logs evolution-api`), onde o JID aparece cru.

> Fonte: sessão de go-live 2026-06-12; logs Evolution v2.3.7.
