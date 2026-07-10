---
title: Verificação OAuth do Google para escopo sensível (o que realmente exige)
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [oauth, google-calendar, verification, go-to-market, lgpd]
sources:
  - raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
related:
  - pages/synthesis/google-calendar-integration-state.md
  - pages/concepts/owner-document-cpf-or-cnpj.md
status: draft
---

# Verificação OAuth do Google para escopo sensível (o que realmente exige)

> Para tirar o aviso "O Google não verificou este app" (que aparece a todo usuário, inclusive em produção), o app precisa passar pela **verificação OAuth**. `calendar.events.readonly` é escopo **sensível** (não *restrito*) — os requisitos são mais leves do que se costuma temer.

## Contexto

O PREMIUM do produto depende da integração Google Calendar. Enquanto o app não for verificado, **todo cliente vê a tela de app não-verificado** — bloqueador de GA. Em 2026-07-10 houve superestimação dos requisitos; a lista real abaixo corrige isso.

## O que É exigido (escopo sensível)

- **Política de privacidade pública** que **declara o uso dos dados do Google** (o que é lido, uso read-only, armazenamento, não-compartilhamento) + **afirmação de Uso Limitado** ("obedece à *Google API Services User Data Policy*, inclusive Uso Limitado"). Adicionada como seção em `src/lib/legal/content.ts`.
- **Consistência nome↔domínio**: o nome do app no consent deve bater com a marca/domínio verificado. Renomeamos o app OAuth de "ConfirmaAí" → **"Clínica Organizada"** (= `clinicaorganizada.com`) por isso.
- **Domínio autorizado** verificado no Google Search Console (já estava).
- **Logo** (recomendado; brand verification).

## O que NÃO é exigido

- **CNPJ não é exigido pelo Google.** Nem pela LGPD para operar como PF: o campo do controlador aceita **CPF**. Ver [[owner-document-cpf-or-cnpj]].
- **Vídeo demo** normalmente **não** é obrigatório para escopo *sensível* (é requisito de escopo *restrito*, tipo Gmail/Drive full). O Google pode pedir no review, mas não bloqueia a submissão.
- **Security assessment** (idem — só restrito).

## Passos (quando os pré-requisitos estiverem prontos)

1. Preencher o controlador na política (nome + CPF + e-mail do DPO) — o **dono** digita o CPF (assistente não insere documento de identidade).
2. Publicar o app (Testing → Production) na página de Público-alvo.
3. Submeter na Central de verificação (justificativa: overlay **read-only** da própria agenda como blocos de contexto, sem escrita).
4. Review do Google: dias a semanas.

## Gotcha de navegação

- Google Cloud Console para o projeto `confirmaai-501623` exige a conta wcwecalc → URL com **`authuser=2`** (u/0 = rhonner.matheus não tem acesso). Ver [[claude-chrome-per-profile-extension]].

## Cross-refs

- `.context/features/google-calendar.md` — § Como estender item 1 (checklist do dono).
- [[google-calendar-integration-state]] · [[owner-document-cpf-or-cnpj]]

## Fontes

- raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
