---
title: Claude no Chrome — extensão é por-perfil; confirme pela conta logada, não pelo nome
type: concept
created: 2026-06-26
updated: 2026-06-26
tags: [tooling, claude, chrome, automation, processo]
sources:
  - raw/sessions/2026-06-26-neon-cost-scale-to-zero.md
related:
  - pages/concepts/claude-chrome-sensitive-domains.md
status: stable
---

> A extensão Claude-in-Chrome é **por perfil do Chrome** — cada perfil/janela roda sua própria instância. O agente só alcança perfis onde a extensão está **instalada + conectada**. E os identificadores de browser (`deviceId`, nomes "Browser 1/2") **mudam e se embaralham entre sessões** — então NUNCA confie no nome; confirme o alvo pela **conta logada**.

## Por que isso dói

- O usuário tem múltiplos perfis (ex.: work, pessoal, WeCalc). O perfil correto deste projeto é o da conta **WeCalc** (`wcwecalc@gmail.com`); **nunca** o work (`@tecnofit`).
- Abrir uma janela num perfil **sem a extensão conectada** = ele nem aparece em `list_connected_browsers`. Não é teimosia da ferramenta — é inalcançável até a extensão ser instalada/ativada/conectada ali.
- `list_connected_browsers` retorna nomes genéricos ("Browser 1", "Browser 2") que **trocam de posição** a cada reconexão; `connectedAt` (mais recente = janela recém-aberta) ajuda, mas não é garantia.

## Protocolo (o que funciona)

1. Quando há >1 browser conectado, a própria tool obriga a `AskUserQuestion` listando todos + a opção de "tela de confirmação". Deixe o usuário escolher — não escolha sozinho.
2. Depois de `select_browser`, **confirme a conta** antes de qualquer ação sensível: abrir `https://myaccount.google.com` (ou checar uma aba de Gmail/serviço) e verificar se é **wcwecalc@gmail.com**. Se aparecer `@tecnofit` → é a work, pare e troque.
3. Se o perfil-alvo não aparece, peça pro usuário **instalar/conectar a extensão naquele perfil** (a extensão não é compartilhada entre perfis).
4. A conexão **cai sozinha** às vezes no meio da sessão ("No tab available" / "No tab group exists") → re-`list_connected_browsers` e re-`select_browser`.

## Login social nesses serviços

Vercel, Neon, Sentre, UptimeRobot usam "Continuar com Google" → seletor de contas mostra WeCalc no topo + a work abaixo. Sempre escolher **WeCalc**; parar se aparecer tela de **consentimento OAuth** ou seletor ambíguo. (Asaas é e-mail+senha, não-SSO → login fica com o usuário.) Para sites sensíveis e o protocolo de "Permission denied", ver [[claude-chrome-sensitive-domains]].

## Cross-refs

- [[claude-chrome-sensitive-domains]] — "Permission denied" é prompt da extensão, não bloqueio duro.

> Fonte: raw/sessions/2026-06-26-neon-cost-scale-to-zero.md — bati no problema de perfil ~5× numa sessão antes de fixar o protocolo.
