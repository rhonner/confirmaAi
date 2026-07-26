---
title: Trilha de auditoria como prova de AUSÊNCIA de efeito colateral
type: concept
created: 2026-07-25
updated: 2026-07-25
tags: [audit, testing, observability, whatsapp, google-calendar, prod]
sources:
  - raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md
  - .context/features/audit.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/append-only-via-pg-trigger.md
  - pages/concepts/defense-in-depth-cron.md
status: stable
---

> Depois de um teste arriscado em produção, a pergunta "o sistema mandou mensagem para um
> paciente real?" **não** se responde na UI — o registro foi excluído. Uma trilha append-only
> que loga **tentativas** responde: nenhum `message.sent` **e** nenhum `message.send_failed` na
> janela = o job nunca pegou a linha. Isso é mais forte do que olhar o celular (ausência de
> mensagem também poderia ser falha de entrega).

## O caso

Para ver o toast de transição do retroativo, um agendamento precisou existir **hoje mais tarde**
— dentro da janela de 24h, ou seja, elegível a WhatsApp real no próximo cron. Depois do teste, a
pergunta ficou. A auditoria (`/api/account/activity`) reconstruiu a janela exata (UTC):

| Hora | Evento | Estado |
| --- | --- | --- |
| 14:00:57 | `appointment.create` | futuro + `PENDING` → **elegível** |
| 14:01:33 | `appointment.update` | arrastado p/ o passado → `retroactive` → fora da fila |
| 14:03:38 | `appointment.update` | de volta ao futuro → elegível |
| 14:04:27 | `appointment.delete` (+ `gcal.pushed`) | fim |

≈ **36s + 49s** de exposição, contra um cron de **30 em 30 min** → matematicamente improvável, e
a ausência de qualquer `message.*` confirma. Nada saiu.

## As duas propriedades que fazem isso funcionar

1. **Logar o caminho de falha também.** `processSends` escreve `message.sent` no sucesso **e**
   `message.send_failed` no erro (`src/lib/services/scheduler.ts`). Sem o segundo, a ausência
   seria ambígua: "não tentou" e "tentou e falhou" seriam o mesmo silêncio.
2. **Logar mutação de terceiro só quando confirmada.** `auditPushed(..., "deleted", ...)` em
   `mirror.ts` só roda quando `del.ok` — então a **presença** de `gcal.pushed` prova que o
   evento espelho realmente saiu da Google Agenda. Isso fechou uma verificação que era
   impossível por qualquer outro caminho: o overlay **nunca** mostraria o espelho, porque evento
   com a tag de origem-app é dropado ([[external-event-firewall]]). Se a auditoria fosse
   "tentativa de push", ela não provaria nada.

## Regra de design

Ao instrumentar um efeito colateral externo, escolha **de propósito** o que o evento significa:

- **"Tentei"** (logar antes) → serve para diagnosticar, **não** para provar resultado.
- **"Consegui"** (logar depois do ok) → serve como prova de que o mundo mudou, mas silencia
  falhas — por isso precisa de um par explícito para o erro.

O par (`*.sent` / `*.send_failed`) dá as duas leituras. Um evento só não dá.

## Corolário para teste em produção

Quando um teste precisa de uma janela de risco, **encurtá-la é a mitigação** — e a auditoria é
o que permite afirmar depois, sem hesitar, que o risco não se materializou. Vale planejar o
teste já sabendo **qual evento de auditoria** vai servir de prova; se não existir nenhum, a
resposta ao dono vai ser "provavelmente não", que é ruim.

## Wikilinks

- [[external-event-firewall]] — por que o espelho é invisível ao overlay.
- [[append-only-via-pg-trigger]] — o que garante que a trilha não pode ser reescrita.
- `.context/features/audit.md` — ações registradas e onde ler.

> Fonte: raw/sessions/2026-07-25-1100-prod-walkthrough-812289e.md
