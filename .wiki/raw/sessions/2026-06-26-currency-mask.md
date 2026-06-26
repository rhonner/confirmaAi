---
type: session
date: 2026-06-26
branch: main
status: ingested
files_touched:
  - src/lib/currency-mask.ts
  - src/components/ui/currency-input.tsx
  - src/lib/validations/settings.ts
---

# Sessão 2026-06-26 — Máscara monetária acumuladora (valor médio da consulta)

## Objetivo

Trocar o `CurrencyInput` (parser livre, formatava no blur) por uma **máscara acumuladora de centavos** (preenche da direita): `5`→`0,05`, `573128`→`5.731,28`, teto 99.999,99 (7 dígitos).

## Resultado

- Lógica pura em `src/lib/currency-mask.ts` (`centsToDisplay`/`rawToCents`/`valueToCents`); componente em `currency-input.tsx` só faz `onChange(rawToCents(e.target.value)/100)` e exibe `centsToDisplay(valueToCents(value))`.
- Contrato preservado: `value`/`onChange` em reais (number). Defesa server-side: Zod do settings `.max(99999.99)`.
- Verificado: tsc · vitest 263 (unit da máscara) · build · test:sprints 126 (11.38) · Chrome MCP (sequência exata + cap).

## Decisões / aprendizados

- Aprendizado: a máscara RTL fica robusta **re-extraindo os dígitos do texto exibido a cada onChange** (`replace(/\D/g,"").slice(0,7)`) — cobre digitar E backspace sem rastrear teclas; cap = `slice(0,7)` na string de dígitos; trabalha em centavos inteiros e converte pra reais só no contrato. Ver [[currency-mask-cents-accumulator]].
- Decisão: separar a lógica pura num módulo sem React → testável em vitest/test-sprints sem importar componente client.

## Para ingerir na wiki

- [x] criar `pages/concepts/currency-mask-cents-accumulator.md`
