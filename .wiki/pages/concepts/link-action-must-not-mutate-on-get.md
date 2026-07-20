---
title: Link de ação não pode mutar no GET (anti-prefetch do WhatsApp)
type: concept
created: 2026-07-19
updated: 2026-07-19
tags: [security, whatsapp, prefetch, http-semantics, confirmation-link, gotcha]
sources:
  - raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
related:
  - .context/features/confirmation-link.md
  - pages/concepts/stateless-password-reset-token.md
status: stable
---

# Link de ação não pode mutar no GET (anti-prefetch do WhatsApp)

> Um link que o paciente recebe no WhatsApp para **confirmar/cancelar** um agendamento NÃO pode executar a ação ao ser aberto (GET). O preview/scanner do WhatsApp **pré-carrega** o link → dispararia a mutação sozinho, sem o paciente clicar em nada.

## Contexto

Feature "Confirmação por Link" (2026-07-19): a mensagem trocou o "Responda 1 para CONFIRMAR ou 2 para CANCELAR" por um **link único** (`/confirmar/<token>`). A tentação óbvia — fazer o link já confirmar ("um clique e pronto") — é um bug de segurança/correção esperando acontecer.

## O problema: GET não é seguro quando um bot o dispara

- O WhatsApp (e a maioria dos apps de mensagem, antivírus de e-mail, crawlers de preview) faz um **GET automático** no link pra gerar o card de preview / checar malware. Isso acontece **antes** de qualquer humano ver a mensagem.
- Se o GET muta, o agendamento é **confirmado (ou cancelado) pelo scanner**, não pelo paciente. O paciente nunca decidiu nada.
- É o mesmo princípio de "GET deve ser idempotente/seguro" do HTTP — mas aqui a violação tem gatilho **garantido** (todo link enviado por WhatsApp é pré-carregado), não hipotético.

## O padrão correto: GET read-only + POST muta

- **Página GET** (`src/app/confirmar/[token]/page.tsx`) é **Server Component read-only**: só faz `findUnique` e renderiza os dados (clínica, data, paciente) + dois **botões**. Zero escrita.
- **Ação é POST** (`src/app/api/confirmar/[token]/route.ts`), disparada pelo clique num componente client (`confirm-actions.tsx`). O scanner não dispara POST.
- ⚠️ **Regressão a evitar** (documentada no código): nunca mutar no GET, e **nunca transformar a página numa Server Action que rode no load** — isso reintroduz o problema por outra porta.

## Detalhes que reforçam

- **Uso único é do ESTADO, não do token**: a mutação só age se `status === PENDING` (e `dateTime > now`). Confirmado/cancelado trava terminal — reload da página não re-dispara. Sem tabela de "tokens usados".
- Token é **HMAC-SHA256 stateless** (mesmo padrão do [[stateless-password-reset-token]]); a verificação é pura (sem DB). Mas note: **stateless-e-seguro no GET não basta** — o que protege do prefetch é o GET não mutar, não a natureza do token.
- Página **não-indexável** (`robots: { index: false }`) e token inválido → mensagem **neutra** (não vaza se o agendamento existe).

## Quando NÃO se aplica

- Links puramente informativos (abrir uma fatura, ver um agendamento) podem mutar nada no GET tranquilamente — o cuidado é só quando o GET **teria efeito colateral**.
- Fluxos atrás de login/CSRF em que o link não é público não têm o gatilho do scanner — mas manter a ação em POST continua sendo a higiene correta.

## Cross-refs

- `.context/features/confirmation-link.md` — feature completa (token, deadline, auto-cancelamento, settings).
- [[stateless-password-reset-token]] — mesmo esquema de token HMAC stateless single-use-por-estado.
- [[baked-deadline-needs-grace-floor]] — o `exp` do token dessa mesma feature e por que precisa de piso.

> Fonte: `src/app/confirmar/[token]/page.tsx`, `src/app/api/confirmar/[token]/route.ts`, raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
