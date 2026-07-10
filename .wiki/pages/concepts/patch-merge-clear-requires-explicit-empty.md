---
title: Limpar um campo num PATCH de merge exige enviar valor vazio (omitir não limpa)
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [google-calendar, api, gotcha, patch-semantics, mirror]
sources:
  - raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/revive-cancelled-event-on-id-reuse.md
  - pages/synthesis/google-calendar-integration-state.md
status: stable
---

> Num `PATCH` com **merge semantics** (o do Google `events.patch`, JSON Merge Patch em geral), campos AUSENTES do corpo ficam INALTERADOS. Para **limpar** um campo é preciso enviá-lo explicitamente (string vazia ou `null`). Um builder que "omite quando vazio" nunca consegue apagar o valor antigo.

## O bug (Fase C do Google Calendar)

`buildEventResource` montava o corpo do evento com um spread condicional:

```ts
...(input.description ? { description: input.description } : {})   // ❌ omite quando vazio
```

Isso é ótimo para `events.insert` (não manda campo vazio). Mas o MESMO resource era usado como corpo do `events.patch` na edição. Fluxo que quebra:

1. Criar agendamento com observação "Paciente diabético" → evento no Google com `description="Paciente diabético"`.
2. Editar o agendamento e **apagar** a observação (`notes=null`).
3. O mirror faz `patch` com `description` **omitido** → o Google faz merge → mantém "Paciente diabético".

Resultado: a fonte da verdade (app) diz "sem observação", o Google ainda mostra a nota antiga. Além de stale, é um vazamento leve de privacidade (uma nota clínica que o profissional apagou de propósito continua na agenda do Google).

## Fix

Enviar o campo SEMPRE, com valor vazio quando não há conteúdo:

```ts
description: input.description ?? ""   // ✅ "" limpa no patch; inócuo no insert
```

`""` limpa a `description` no `events.patch` de forma confiável e não faz mal no `insert`. O teste unitário que codificava o comportamento antigo (`"description" in resource === false`) foi invertido para asserir a presença com `""`.

## Regra geral

- Antes de reusar um "builder de create" como corpo de um **patch de merge**, verifique cada campo opcional: se o usuário pode ESVAZIAR o campo, o patch precisa enviá-lo (vazio/`null`), não omitir.
- Sintoma clássico: "editar preenchendo funciona; editar apagando não reflete". Quase sempre é merge-patch omitindo a chave.
- Vale para Google APIs (`patch` = merge; `update`/PUT = replace), JSON Merge Patch (RFC 7386), e muitos ORMs/`updateMany` com `undefined` (que também é ignorado).

## Cross-refs

- `.context/features/google-calendar.md` § Fase C (fix #2).
- [[revive-cancelled-event-on-id-reuse]] — o outro gotcha de `events.patch`/`insert` da mesma sessão.

## Fontes

- raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
