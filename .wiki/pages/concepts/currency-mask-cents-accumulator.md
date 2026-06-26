---
title: Máscara monetária acumuladora (centavos, preenche da direita)
type: concept
created: 2026-06-26
updated: 2026-06-26
tags: [ui, input-mask, currency, brl, react, forms]
sources:
  - raw/sessions/2026-06-26-currency-mask.md
related:
  - .context/features/settings.md
status: stable
---

> Máscara de valor monetário no padrão BR: o usuário só digita dígitos e eles **preenchem da direita pra esquerda** como centavos — `5`→`0,05`, `57`→`0,57`, `573128`→`5.731,28`. Sem cursor no meio, sem digitar vírgula.

## A técnica (robusta e curta)

O texto exibido é **sempre** os centavos formatados. A cada `onChange`, **re-extraia os dígitos do valor pós-edição** e reinterprete:

```ts
export function rawToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "").slice(0, 7) // cap = 7 dígitos → 99.999,99
  return digits ? parseInt(digits, 10) : 0
}
export function centsToDisplay(cents: number): string {
  if (!cents) return "" // vazio em 0 → deixa o placeholder
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// no input controlado: value = centsToDisplay(cents); onChange => rawToCents(e.target.value)/100
```

## Por que re-extrair (em vez de rastrear teclas)

Como o display já é a versão formatada, `replace(/\D/g,"")` recupera a sequência de dígitos **independente de cursor/separadores** — então o MESMO handler cobre:
- **Digitar**: `"5.731,28"` + `8` → `"5.731,288"` → dígitos `57312 88` → reinterpreta.
- **Backspace**: apaga o último char → menos 1 dígito → reinterpreta (1 dígito a menos). Apagar um separador é no-op (dígitos não mudam → reformata igual).
- **Paste sujo**: `"R$ 12.345,67"` → só os dígitos.

O **cap** é `slice(0, N)` na string de dígitos (N=7 aqui), não uma comparação numérica.

## Regras que evitam bug

- Trabalhe em **centavos inteiros** internamente; converta pra reais só no contrato (`value`/`onChange: number`) — evita erro de float ao formatar.
- `inputMode="numeric"` (teclado só dígitos). `type="text"` (não `number`, que não aceita máscara).
- Separe a **lógica pura** (sem React) num módulo (`src/lib/currency-mask.ts`) → testável em vitest/test-sprints sem importar o componente `"use client"`.
- Cursor: como o valor cresce sempre pela direita e o controlado reformata, o cursor cai no fim naturalmente — não precisa de `setSelectionRange`.

## No ConfirmaAí

`src/components/ui/currency-input.tsx` (campo "valor médio da consulta", Settings). Defesa server-side: Zod `.max(99999.99)`. Operacional: `.context/features/settings.md`.

> Fonte: raw/sessions/2026-06-26-currency-mask.md
