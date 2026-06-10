---
title: Claude no Chrome bloqueia sites financeiros (Asaas)
type: concept
created: 2026-06-10
updated: 2026-06-10
tags: [tooling, claude, chrome, asaas, automation, processo]
sources:
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - pages/entities/asaas-integration.md
status: stable
---

> Gotcha de processo: a automação de browser do Claude (extensão Chrome) **nega ações em sites de categoria financeira** — no nosso caso, o painel do Asaas (`www.asaas.com`). É bloqueio de produto; autorização do usuário no chat **não** sobrepõe.

## Sintoma

Qualquer ação (`screenshot`, `navigate`, click) na aba do Asaas retorna `Permission denied by user`, mesmo com o usuário mandando seguir. Também observado em `google.com/recaptcha/admin` na mesma sessão (admin console).

## Consequência prática pro projeto

Passos do painel Asaas são **sempre manuais do usuário**:
- Gerar/rotacionar `ASAAS_API_KEY`.
- Configurar/alterar webhook (URL + token `asaas-access-token`).
- Ativar NF-e, ver cobranças, estornos.

## Workflow que funcionou (sem secrets no chat)

1. Agente gera secrets localmente (`openssl rand -hex 32` → arquivo em `/tmp`).
2. Agente adiciona na Vercel via CLI (`printf ... | vercel env add`).
3. Usuário lê o secret com `! cat /tmp/...` e cola no painel financeiro ele mesmo.
4. Pra chaves vindas do painel (API key): usuário roda `! npx vercel env add NOME production` e cola interativamente — o valor nunca passa pelo agente.

> Fonte: raw/sessions/2026-06-10-sprint6-and-golive.md — duas negações consecutivas durante o go-live da Sprint 7.
