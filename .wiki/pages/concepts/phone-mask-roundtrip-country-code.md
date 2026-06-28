---
title: Máscara de telefone — round-trip canônico↔display e o strip do código de país
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [telefone, brasil, mascara, input-controlado, ui, gotcha]
sources:
  - raw/sessions/2026-06-27-2252-paonetone-round2.md
related:
  - .context/features/patients.md
  - pages/concepts/currency-mask-cents-accumulator.md
status: stable
---

# Máscara de telefone: round-trip canônico↔display

> Digitar "1" no campo de WhatsApp do paciente virava "(55) 1" e os `5` acumulavam a cada tecla (relato da sócia: "fica aplicando 5 repetidamente").

## Contexto

`<PhoneInput>` é um input controlado: o `value` é **canônico** (`+5511999999999`) e o display é o **local formatado** (`(11) 99999-9999`). `onChange` devolve canônico (`toCanonicalPhone`), e o display vem de `formatPhoneDisplay(value)`. Ambos passam por `getLocalDigits`, que tira o código de país `55`.

## A pegadinha

`getLocalDigits` decidia tirar o `55` **só por tamanho**: `if (d.startsWith("55") && d.length > 11)`. A intenção: um número com DDI tem 12-13 dígitos; ≤ 11 já é local. Mas o round-trip do input quebra isso:

1. Usuário digita "1" no campo vazio → `toCanonicalPhone("1")` = `"+551"`.
2. Re-render: `formatPhoneDisplay("+551")` → `getLocalDigits("+551")`: dígitos `"551"` (3, **não** > 11) → **não tira** o `55` → local `"551"` → exibe `"(55) 1"`.
3. Próxima tecla repete: o `+55` que o `toCanonicalPhone` prefixa é **relido como DDD 55**, e mais um `+55` é prefixado ⇒ os `5` acumulam.

Ou seja: enquanto digitando, o canônico é **curto** (≤ 11 dígitos), então a heurística de tamanho nunca dispara e o código de país vira parte do "local". O bug aparece já na 1ª tecla.

## Fix

O `+` desambigua: um valor com `+` explícito é canônico (o `55` ali **é** código de país). 

```ts
const hasPlus = value.trimStart().startsWith("+")
let d = digitsOnly(value)
if (d.startsWith("55") && (hasPlus || d.length > 11)) d = d.slice(2)
```

- Canônico curto (`+551`) agora tira o `55` → "(1". Round-trip estável.
- **DDD 55** (Santa Maria/RS) digitado **sem** `+` (ex: "(55) 99999-8888") é preservado: sem `+` e ≤ 11 dígitos, não tira. (Colar `5511…` com 13 dígitos sem `+` ainda cai no ramo `> 11` — ambiguidade latente residual, mas sem consumidor que realimente display-form.)

## Quando aparece / não aparece

- **Aparece** em qualquer máscara que faça round-trip canônico↔display extraindo "dígitos locais" por heurística de tamanho, com um prefixo fixo (DDI) que some no display.
- **Não aparece** se o display preservasse o prefixo, ou se a extração usasse o sinal (`+`) como fronteira canônica desde o início.

## Lição de teste

O 1º teste reimplementava a fiação do `<PhoneInput>` (`toCanonicalPhone(display + ch)`) — passa mesmo se o componente regredir. Fix: além do teste dos helpers (`tests/unit/phone.test.ts`), um teste de **componente real** via Testing Library (`tests/unit/phone-input.test.tsx`) que digita tecla a tecla no `<PhoneInput>` e checa o `value` exibido. Reproduzido também no Chrome MCP (tecla a tecla, não digitação rápida — o batch de eventos mascara o bug).

## Cross-refs

- [[currency-mask-cents-accumulator]] — irmão: máscara BR com round-trip display↔valor, lógica pura separada do componente.
- `.context/features/patients.md` — operacional (regra do telefone, regex, `PhoneInput`).

## Fontes

- raw/sessions/2026-06-27-2252-paonetone-round2.md
