---
type: session
date: 2026-06-26
branch: main
status: ingested
files_touched:
  - src/lib/anti-fraud/cnpj-validator.ts
  - src/lib/anti-fraud/document.ts
  - src/lib/billing/identifiers.ts
  - src/lib/validations/auth.ts
  - src/app/api/auth/register/route.ts
  - src/lib/billing/checkout-cpf.ts
  - src/app/api/billing/checkout/route.ts
  - src/app/(auth)/registro/page.tsx
  - src/app/(dashboard)/billing/checkout/page.tsx
  - scripts/test-sprints.ts
---

# Sessão 2026-06-26 — Documento do dono aceita CPF ou CNPJ + auditoria de máscaras

## Objetivo

(1) Analisar todos os campos que precisam de máscara monetária. (2) Permitir CNPJ além de CPF no cadastro/cobrança (clínica costuma ser PJ).

## Resultado

- **Máscaras monetárias**: auditadas — único input monetário é `avgAppointmentValue` (Configurações), já mascarado por `CurrencyInput`; displays usam `formatBRL`. Nada a corrigir.
- **CPF→CPF/CNPJ** (dono): campo único auto-detectável (≤11 CPF, 14 CNPJ). Novo `document.ts` (`validateDocument`/`formatDocument`) + `cnpj-validator.ts`. Storage segue `User.cpf/cpfHash` (sem migration). `hashDocument` despacha namespace (`cpf:`/`cnpj:`) → hashes de CPF já gravados intactos. Asaas (`cpfCnpj`) já aceitava os dois. Paciente continua só CPF.
- Verificado: tsc · vitest 252 · build · test:sprints 124 (check 11.36) · Chrome MCP (máscara CPF+CNPJ + erro do inválido) · API+DB (CNPJ→201, `User.cpf`=14 dígitos) · revisão adversarial sem regressões.

## Decisões / aprendizados

- Decisão: campo único auto-detect (não seletor/checkbox) — Por quê: menos atrito; o tamanho já distingue CPF de CNPJ sem o usuário escolher.
- Decisão: NÃO renomear coluna `cpf`/`cpfHash` p/ `document` — Por quê: evitaria migration + ripple; a coluna passa a guardar qualquer um dos dois (dívida só de nome, documentada).
- Aprendizado: ao alargar um identificador hasheado, preserve compat via **dispatch de namespace** no hash (CPF mantém `cpf:`), senão a dedup/threshold quebra pra base existente. Ver [[identifier-hash-namespacing]].

## Para ingerir na wiki

- [x] criar `pages/concepts/owner-document-cpf-or-cnpj.md`
