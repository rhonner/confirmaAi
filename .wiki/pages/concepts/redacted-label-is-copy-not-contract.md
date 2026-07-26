---
title: Rótulo redigido é copy, não contrato — política lê booleano
type: concept
created: 2026-07-25
updated: 2026-07-25
tags: [pattern, copy, i18n, integrations, google-calendar, quota, gotcha]
sources:
  - raw/sessions/2026-07-25-0028-isprivate-and-retroactive-status.md
  - raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md
  - .context/features/agenda-day-grid.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/quota-ledger-immortal-slot.md
  - pages/concepts/regression-test-assert-the-predicate.md
status: stable
---

> Quando um mapper **redige** um valor externo num rótulo legível ("Ocupado" para evento
> particular), esse rótulo passa a pertencer à camada de **copy**. Qualquer *decisão* que leia
> o rótulo acopla política a texto traduzível. O mapper que redige tem de **exportar também o
> motivo** da redação — um booleano — e a política lê o booleano.

## O caso concreto

`mapGoogleEvent` (`src/lib/services/google/calendar.ts`) troca o título de eventos com
`visibility: private|confidential` por **"Ocupado"** — copy pt-BR, escrita para humano. Duas
decisões passaram a comparar esse título:

- `canPromoteGoogleEvent` — "evento particular não promove" (não há o que pré-preencher).
- `parseEventSignals` — extrai nome/telefone do título para o diálogo de promoção.

## Por que isso é pior do que parece

O raio de explosão é **assimétrico**: uma mudança inocente de copy corrompe dado em outro
subsistema.

- O agente `ux-writer` renomeia "Ocupado" → "Indisponível" (trabalho legítimo, nenhum teste de
  copy reclama).
- `canPromoteGoogleEvent` deixa de reconhecer o evento → **particular fica promovível**.
- `parseEventSignals` sugere **o próprio rótulo como nome do paciente** → o usuário salva um
  paciente chamado "Ocupado" → **queima uma vaga vitalícia de quota**, que é imortal por
  design ([[quota-ledger-immortal-slot]]).

Ou seja: string de UI → criação de entidade cobrada. Nada no caminho grita.

## O smell: **derivar e descartar**

O mapper **já sabia** — ele computou `visibility ∈ {private, confidential}` para decidir
redigir, e jogou o predicado fora, deixando só o efeito (o título trocado). Quem estiver
depois na fila é forçado a **reconstruir o predicado por engenharia reversa da saída**, e a
única pista disponível é a copy.

**Regra**: se um mapper calcula um predicado para decidir a forma da saída, **exporte o
predicado**. Aqui: `GcalEventDTO.isPrivate: boolean` (fix de 2026-07-25, commit `812289e`).

## Generalização

Vale para qualquer par (valor redigido/normalizado, motivo da redação):

- `"Ocupado"` × `isPrivate` — este caso.
- Nome mascarado de usuário anonimizado (LGPD) × `deletedAt != null`.
- `"—"`/`"Sem telefone"` na UI × `phone == null`.
- Status amigável de billing × o enum cru (ver a tradução em `.context/features/billing.md`).

Em todos, o teste é a pergunta: **se um redator trocar essa string amanhã, algo além de pixel
muda?** Se sim, a política está lendo a coisa errada.

## Como travar a regressão

Um teste de comportamento não pega isso (com a copy atual, os dois caminhos concordam). O que
pega é **asserção negativa sobre o fonte** — o guard não pode voltar a mencionar o rótulo —
rodando sobre o código **sem comentários** (a própria doc que explica a remoção cita a string).
É o check `MV.4` em `scripts/test-sprints.ts`; ver [[regression-test-assert-the-predicate]].

## Estado

- Fix implementado em `812289e`; `isPrivate` atravessa mapper → DTO → `use-api.ts` → política.
- Comportamento validado em **produção** em 2026-07-25 (evento particular abre no Google e
  **não** abre o diálogo, nas duas grades) — ver a raw da sessão e
  `.context/features/agenda-day-grid.md` § "Validação em PRODUÇÃO dos fixes de 2026-07-25".
- Mapper pinado por unit (`tests/unit/gcal-calendar.test.ts`: `private`/`confidential` → true,
  `default` → false).

## Wikilinks

- [[external-event-firewall]] — onde a política de promoção vive e por que ela existe.
- [[quota-ledger-immortal-slot]] — o custo real de criar um paciente por engano.
- [[regression-test-assert-the-predicate]] — como travar um guard que "some" sem quebrar teste.

> Fonte: raw/sessions/2026-07-25-0028-isprivate-and-retroactive-status.md
