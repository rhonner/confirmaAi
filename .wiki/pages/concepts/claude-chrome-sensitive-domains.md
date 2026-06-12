---
title: Claude no Chrome — "Permission denied" em sites sensíveis é prompt, não bloqueio duro
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

> Gotcha de processo: ações da automação de browser em sites sensíveis (financeiros como o Asaas, admin consoles do Google) retornam `Permission denied by user`. **CORREÇÃO (mesma sessão)**: na primeira análise parecia bloqueio duro de produto — mas era **prompt de permissão da extensão** no Chrome do usuário. Quando o usuário aprovou o prompt (após "tenta de volta"), a automação no painel do Asaas funcionou normalmente (webhook foi configurado fim-a-fim pelo agente).

## Sintoma e diagnóstico

- Erro `Permission denied by user` em `screenshot`/`navigate`/click — **idêntico** para "prompt negado/perdido" e "site bloqueado por categoria". O agente não consegue distinguir os dois casos.
- Protocolo: **não martelar**; avisar o usuário pra olhar o prompt da extensão e tentar 1× de novo com ele assistindo. Se negar de novo com o usuário olhando → aí sim é bloqueio de categoria, vira passo manual.

## O que continua sendo sempre manual do usuário (guardrails do próprio agente)

- Senhas, dados bancários, KYC (dados pessoais/faturamento no cadastro Asaas).
- Qualquer ação que movimente dinheiro (transferências, estornos, antecipações).
- Criação de contas em serviços novos.

## Workflow que funcionou (sem secrets no chat)

1. Agente gera secrets localmente (`openssl rand -hex 32` → arquivo em `/tmp`).
2. Agente adiciona na Vercel via CLI (`printf ... | vercel env add`).
3. Usuário lê o secret com `! cat /tmp/...` e cola no painel financeiro ele mesmo.
4. Pra chaves vindas do painel (API key): usuário roda `! npx vercel env add NOME production` e cola interativamente — o valor nunca passa pelo agente.

> Fonte: raw/sessions/2026-06-10-sprint6-and-golive.md — duas negações consecutivas durante o go-live da Sprint 7.
