---
title: Soft-delete não dispara onDelete:Cascade — credenciais externas ficam órfãs
type: concept
created: 2026-07-05
updated: 2026-07-05
tags: [lgpd, security, prisma, soft-delete, gotcha, integrations]
sources:
  - raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
  - .context/features/lgpd-account.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/quota-ledger-immortal-slot.md
status: stable
---

> A exclusão de conta neste projeto é **soft-delete**: a linha `User` **nunca** é removida (fica anonimizada com `deletedAt`, mantida como trilha de audit/FK). Portanto qualquer `onDelete: Cascade` a partir de `User` **jamais dispara** — e uma credencial externa viva (ex: refresh token do Google) sobreviveria indefinidamente. Achado **crítico** do red-team, confirmado no código.

## Contexto

`DELETE /api/account` (`src/app/api/account/route.ts`) só seta `User.deletedAt` + anonimiza PII (`email`, `name`, `cpfHash`, `whatsappPhoneNumber` → null). A purga 30d (`runAccountPurge`) apaga `Patient`/`PatientQuotaSlot`, mas **preserva o `User`** (prova legal de consentimento). Logo, modelar a limpeza de tokens confiando em `GoogleCalendarConnection ... onDelete: Cascade` é uma falsa sensação de segurança: o cascade nunca ocorre porque o pai nunca é deletado.

Consequência concreta: o refresh token cifrado (grant vivo à agenda de uma pessoa) e o watch channel ficariam ativos **para sempre** após a conta ser "excluída" — violação de LGPD + passivo de segurança, pior que o número de WhatsApp que o mesmo endpoint já anula.

## Pontos-chave

- **Cascade a partir de `User` é decorativo sob soft-delete.** Toda limpeza de dado sensível ligado ao User precisa de código **explícito** no `DELETE` e/ou na purga.
- **Ordene efeitos colaterais irreversíveis DEPOIS do commit.** O revoke (chamada externa irreversível) roda **após** o commit do soft-delete — nunca antes de uma transação que pode dar rollback (senão revoga o grant de uma conta que não foi excluída, deixando o usuário com a agenda quebrada). Achado #3 do code-review.
- **Isole o teardown best-effort.** Envolver em try/catch próprio para que uma falha (inclusive tabela ausente por ordem de migration) **nunca quebre a exclusão**, que é a operação crítica. Achado #4.
- **Keep-on-failure + retry na purga.** Se o revoke falhar (rede/500), **manter** o registro (senão o grant fica vivo sem token para novo revoke) e sinalizar via `captureError`; a purga 30d faz **revoke-then-delete** de qualquer conexão sobrevivente, apagando o token de qualquer forma no prazo. Achado #1.
- **Rede de segurança na purga é obrigatória, não opcional**, justamente porque só ela cobre o caso de revoke que falhou no delete.

## Quando aparece

- Qualquer integração externa por-tenant que guarda **credencial reutilizável** (OAuth refresh token, chave de API do cliente) num modelo filho de `User`, num sistema que usa soft-delete.
- Contraste: dados que a purga já apaga por varredura direta (`Patient`) não sofrem disso; o problema é específico de quem dependia do cascade.

## Cross-refs

- `.context/features/lgpd-account.md` — fluxo de delete/purga.
- `.context/features/google-calendar.md` § LGPD — implementação do teardown de token.
- [[quota-ledger-immortal-slot]] — outro caso de "o `User` sobrevive à exclusão".

## Fontes

- raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
