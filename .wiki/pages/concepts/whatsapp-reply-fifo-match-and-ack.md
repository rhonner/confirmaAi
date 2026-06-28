---
title: Casar respostas do WhatsApp em FIFO + ack de volta (e o gap de idempotência)
type: concept
created: 2026-06-27
updated: 2026-06-27
tags: [whatsapp, evolution, webhook, fifo, idempotencia, gotcha]
sources:
  - raw/sessions/2026-06-27-2252-paonetone-round2.md
related:
  - .context/features/webhook-evolution.md
  - .context/flows/confirmation-flow.md
  - pages/concepts/whatsapp-ninth-digit-jid.md
  - pages/concepts/webhook-idempotency-via-unique-constraint.md
status: stable
---

# Casar respostas do WhatsApp em FIFO + ack de volta

> Quando o paciente tem **vários agendamentos pendentes** e responde "1"/"2" várias vezes, qual confirmação cada resposta afeta? E como ele sabe que "pegou"?

## Contexto

Cenário real do teste de uso (rodada 2 da sócia): ela agendou várias consultas e respondeu "1" em todas. O webhook casa cada resposta com **um** agendamento PENDING via `findPendingAppointmentForResponse`. A pergunta que surgiu: "como vai se comportar com o tanto de agendamento que chegou junto?"

## Pontos-chave

- **FIFO, não LIFO.** Antes era `orderBy confirmationSentAt desc` (a resposta confirmava a confirmação **mais recente**). O paciente lê o chat de **cima para baixo** (a mais antiga primeiro), então `desc` casava na ordem **inversa** à leitura. Mudou para `asc` → cada "1"/"2" afeta a confirmação **mais antiga ainda em aberto**. Como o cron envia priorizando a data mais próxima (`scheduler.ts` `orderBy dateTime asc`), o 1º "1" tende a confirmar a consulta mais próxima — o mais intuitivo.
- **Desempate determinístico.** `confirmationSentAt` empata quando duas confirmações saem no mesmo lote do cron; sem desempate o Postgres escolhe à toa. `orderBy: [confirmationSentAt asc, dateTime asc, id asc]`.
- **Ack de volta dá transparência.** Em vez de mudar o status em silêncio, o sistema responde nomeando o agendamento ("✅ Presença confirmada! Sua consulta de sábado, 27/06 às 23:30…"). Com vários juntos, o paciente vê qual foi tratado a cada resposta. Não consome cota (não chama `incrementMessagesSent` — é resposta a um inbound) e tem **timeout** (ver abaixo).
- **Casar por reply citado foi descartado.** Ler `contextInfo.stanzaId` (a mensagem que o paciente citou) resolveria o "qual" com exatidão, mas depende de o paciente **responder citando** — improvável. FIFO + ack cobrem o caso comum sem migration.

## Higiene de webhook na rota crítica

O ack é uma chamada de saída (Evolution `sendText`). Regras aprendidas no code-review:
- **Audit ANTES do envio.** A trilha de auditoria não pode ser perdida se a Evolution travar no ack.
- **Timeout no envio.** `sendText`/`sendWhatsAppMessage` aceitam `timeoutMs` (gate por `!= null`, então `0` = aborta já); o ack passa 8s. Sem isso, uma Evolution lenta segura a resposta do webhook → a Evolution **reentrega** o evento.

## ⚠️ Gap de idempotência (pré-existente, em aberto)

O webhook de resposta do paciente **não é idempotente** (contraste com [[webhook-idempotency-via-unique-constraint]], que é dos webhooks de billing). Se a Evolution reentregar o **mesmo** `MESSAGES_UPSERT` e o paciente tiver **≥2** pendentes, a reentrega não encontra o 1º (já CONFIRMED) e confirma o **2º** — duplo-confirma a partir de uma resposta. Para paciente com 1 pendente, o retry é no-op seguro.

- Mitigado (janela reduzida) por audit-first + timeout no ack.
- Fechar de vez exige **dedup por `data.key.id`** (id da mensagem inbound) → precisa persistir o id ⇒ **migration**. Não feito (Neon Free com cota de compute estourada bloqueia migration em prod; ver [[neon-postgres]]). Decisão do dono p/ próxima rodada.

## Cross-refs

- `.context/features/webhook-evolution.md` — operacional (match, parser, eventos).
- [[whatsapp-ninth-digit-jid]] — mesma query de match; nono dígito do JID.
- [[webhook-idempotency-via-unique-constraint]] — o padrão que ESTE webhook ainda não tem.

## Fontes

- raw/sessions/2026-06-27-2252-paonetone-round2.md
