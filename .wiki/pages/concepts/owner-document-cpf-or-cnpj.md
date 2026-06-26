---
title: Documento do dono — alargar de CPF para CPF-ou-CNPJ sem quebrar o anti-fraude
type: concept
created: 2026-06-26
updated: 2026-06-26
tags: [cpf, cnpj, anti-fraude, billing, asaas, signup, identifier]
sources:
  - raw/sessions/2026-06-26-cpf-cnpj-owner-document.md
related:
  - pages/concepts/identifier-hash-namespacing.md
  - pages/entities/asaas-integration.md
  - .context/features/auth.md
status: stable
---

> O documento do **dono da conta** (responsável pela assinatura) passou de **só CPF** para **CPF ou CNPJ** (clínica costuma ser PJ; o Asaas cobra via `cpfCnpj`, que aceita os dois). O interessante são as 3 decisões que evitaram quebrar coisas.

## Decisões (o "porquê")

1. **Campo único auto-detectável**, sem seletor/checkbox — decide CPF vs CNPJ pelo **nº de dígitos** (≤11 → CPF, 14 → CNPJ). `validateDocument`/`formatDocument` em `src/lib/anti-fraud/document.ts` delegam a `cpf-validator`/`cnpj-validator`. Menos atrito; o tamanho já desambigua.
2. **Sem renomear a coluna**: continua `User.cpf`/`User.cpfHash` (agora guarda CPF *ou* CNPJ canônico). Renomear pra `document` exigiria migration + ripple em ~10 arquivos. Dívida só de nome, documentada — **zero migration, zero risco no deploy**.
3. **Hash compatível por dispatch de namespace**: `hashDocument` (em `identifiers.ts`) → CPF mantém o namespace `cpf:` (**hashes já gravados continuam batendo**), CNPJ usa `cnpj:`. A dedup/threshold cross-tenant (`detectOwnerCpfReuse`, conta por `cpfHash`) é hash-agnóstica → mesma política pros dois. Extensão direta de [[identifier-hash-namespacing]].

## A lição reusável

Ao **alargar um identificador que é hasheado** (CPF → CPF/CNPJ, telefone → +1 formato, etc.): preserve a compatibilidade da base existente fazendo o hash **despachar por namespace** mantendo o namespace antigo pro caso antigo. Se trocar o namespace de todos, a dedup/threshold para de reconhecer os registros já gravados.

## O que NÃO mudou (de propósito)

- **CPF do PACIENTE** (identificador de quota — `quota.ts`, `primaryIdentifier`, `patient.ts`) continua **só CPF**: um paciente é pessoa física; alargar ali bagunçaria o slot ledger. `validateCpf`/`hashCpf` intactos.
- **Asaas**: `asaas.ts` já mandava `cpfCnpj: cpf.replace(/\D/g,"")` sem checar tamanho → CNPJ de 14 dígitos passa direto. Nada a alterar. Ver [[asaas-integration]].
- **Pix**: o método (Pix/cartão) e a geração de QR são independentes do documento — o documento só identifica o pagador. Vender no Pix segue igual, agora também pra PJ.

## Cross-refs

- [[identifier-hash-namespacing]] — namespacing `cpf:`/`phone:`/`cnpj:` no hash.
- [[asaas-integration]] — campo `cpfCnpj`.
- `.context/features/auth.md` § "Documento do dono (CPF/CNPJ)" — detalhe operacional + validação.

> Fonte: raw/sessions/2026-06-26-cpf-cnpj-owner-document.md
