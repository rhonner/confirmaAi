---
title: Claude no Chrome — extensão é por-perfil; confirme pela conta logada, não pelo nome
type: concept
created: 2026-06-26
updated: 2026-07-25
tags: [tooling, claude, chrome, automation, processo]
sources:
  - raw/sessions/2026-06-26-neon-cost-scale-to-zero.md
  - raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md
related:
  - pages/concepts/claude-chrome-sensitive-domains.md
  - pages/concepts/chrome-mcp-drive-and-assert-via-js.md
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

## Atualização 2026-07-25 — a conta "certa" pode não existir em perfil nenhum

Os 2 browsers conectados eram **Browser 1 = pessoal** (`rhonner.matheus@gmail.com` em `u/0`,
`ifwehadmoretime@gmail.com` em `u/1`, **sem** `wcwecalc`) e **Browser 2 = work `@tecnofit`**
(abandonado no ato). Ou seja: a premissa "existe um perfil WeCalc conectado" **não se sustenta
sempre** — a regra dura que sobra é **jamais o work**.

Consequências práticas:

- **Enumerar contas é barato e definitivo**: `calendar.google.com/calendar/u/0|1|2/...` e ler o
  `aria-label` do avatar (`[aria-label*="Conta do Google"]`). Quando `u/N` **redireciona para
  `u/0`**, é porque só existem N contas — melhor sinal de "acabou" do que tentar adivinhar.
- **Sessão do app ≠ conta Google do perfil.** Para tarefas no `clinicaorganizada.com` o que
  importa é a sessão do app (estava logada como `clinicazeroum` no Browser 1). Confundir os dois
  faz procurar perfil errado.
- ⚠️ **A integração Google Calendar de PROD aponta para `wcwecalc@gmail.com`** (ver
  `/api/integrations/google-calendar/status`). Se essa conta não estiver logada, **qualquer teste
  que exija criar/editar evento naquela agenda é inalcançável pelo browser** — planeje o caminho
  alternativo (injetar leitura no cliente, ver [[chrome-mcp-drive-and-assert-via-js]] §6) em vez
  de travar. Foi exatamente o que aconteceu no walk-through de produção do commit `812289e`.
- **Login é do dono**: o agente não digita senha nem autentica; a saída é pedir, não contornar.

## Cross-refs

- [[claude-chrome-sensitive-domains]] — "Permission denied" é prompt da extensão, não bloqueio duro.
- [[chrome-mcp-drive-and-assert-via-js]] — como testar caminho que dependia da conta inalcançável.

> Fonte: raw/sessions/2026-06-26-neon-cost-scale-to-zero.md — bati no problema de perfil ~5× numa sessão antes de fixar o protocolo.
