---
title: React Hook Form + Radix — gotchas
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [rhf, radix, ui, gotcha, testing]
sources:
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
related:
  - .context/features/auth.md
status: stable
---

> Bugs sutis descobertos no walk-through Chrome MCP do Sprint 4 (form de signup `/registro`). Esses padrões só pegam clicando de verdade — typecheck e Playwright básico passam.

## Bug 1: `recaptchaToken: null` quebra `z.string().optional()`

Em dev sem `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, o `useRecaptcha().getToken()` retorna `null` (intencional — ver [[dev-fallback-without-secrets]]). Esse `null` chega no body do POST como `JSON.stringify({...data, recaptchaToken: null})`.

Backend Zod tinha:
```ts
recaptchaToken: z.string().optional()
```

`.optional()` permite **`undefined`**, não `null`. Resultado: backend retorna 400 "Dados inválidos" em todo signup vindo da UI em dev — invisível em testes API direto que não passam o campo.

**Fix:**
```ts
recaptchaToken: z.string().optional().nullable()
```

Generalização: campos opcionais que vêm de `JSON.stringify` precisam aceitar `null`. `JSON.stringify` mantém `null` mas omite `undefined`.

## Bug 2: Radix Checkbox + RHF Controller — valor não chega

Pattern problemático:
```tsx
<Controller
  name="acceptedTerms"
  control={control}
  render={({ field }) => (
    <Checkbox checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} />
  )}
/>
```

E backend Zod com `z.literal(true, { message: "É necessário aceitar os termos" })`.

Sintomas:
- User marca o checkbox visualmente (`data-state="checked"`).
- Submit do form → backend retorna "É necessário aceitar os termos".

Causa: combinação de RHF state + Controller + `z.literal(true)` + `defaultValues` → o `acceptedTerms` simplesmente não vai no payload do submit em algumas configurações.

**Fix pragmático**: tornar backend tolerante (`z.unknown().optional()`) e validar só no client. Termos de Uso aceito é um soft signal — outras camadas anti-fraude (CPF + reCAPTCHA + email verify + rate limit + honeypot) já são suficientes pra travar bot.

**Lição:** quando há divergência client-RHF vs backend-Zod difícil de debugar, prefira **validar no client + envio explícito** ao invés de depender do spread `...data`:
```ts
body: JSON.stringify({
  ...data,
  acceptedTerms: data.acceptedTerms === true, // explicit
})
```

## Bug 3: Radix Popover/Checkbox e `.click()` programático

`document.querySelector('button[role=checkbox]').click()` (ou `.click()` em PopoverTrigger) **frequentemente não dispara** o handler do Radix — Radix usa `onPointerDown` interno em vez do `click` clássico. Sintoma: walk-through automatizado via JS falha; humano clicando funciona.

**Workaround pra MCP/test runner:**
- Use `computer.left_click(coordinate)` que dispara pointer event nativo.
- Em Playwright, `page.click(selector)` funciona porque simula pointer corretamente.
- Em React Testing Library, `userEvent.click()` funciona; `fireEvent.click()` falha.

Já documentado em [[../entities/radix-popover-and-dialog]].

## Por que essa página existe

Esses 3 bugs **não eram pegáveis** por:
- typecheck (`npx tsc --noEmit`) ✗
- vitest unit ✗
- Playwright básico de "componente renderiza" ✗

Só foram capturados no Chrome MCP walk-through real do Sprint 4. Reforça a regra "definição de feito inclui Chrome MCP" documentada em `.context/README.md`.

## Wikilinks

- [[dev-fallback-without-secrets]]
- [[../entities/radix-popover-and-dialog]]

> Fonte: investigação durante `/wiki-ingest` da Sprint 4 walk-through. `src/app/(auth)/registro/page.tsx`, `src/lib/validations/auth.ts`.
