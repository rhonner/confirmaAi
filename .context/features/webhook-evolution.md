# Feature: Webhook Evolution

> Endpoint que recebe eventos da Evolution API: estado de conexão (`CONNECTION_UPDATE`) e mensagens recebidas (`MESSAGES_UPSERT`). Identifica o tenant pelo `instanceName` no path.

## Arquivos que compõem a feature

| Camada              | Caminho                                                          |
| ------------------- | ---------------------------------------------------------------- |
| Rota webhook        | `src/app/api/webhook/evolution/[instance]/route.ts`              |
| Parser de resposta  | `src/lib/services/webhook-parser.ts`                             |
| Match (FIFO) + ack  | `src/lib/services/webhook-confirmation.ts` (`findPendingAppointmentForResponse`, `buildConfirmationAck`) |
| Modelos relacionados | `User`, `Appointment`, `MessageLog` em `prisma/schema.prisma`   |

## Regras de negócio

- **Path identifica o tenant**: `/api/webhook/evolution/<instance>` → busca `User where { evolutionInstanceName: instance }`. Se não encontrar, retorna `200 { received: true }` silenciosamente (não vaza existência).
- **Shared secret opcional** (Sprint 1 hardening): se `EVOLUTION_WEBHOOK_SECRET` está setada, exige header `x-evolution-secret` ou `apikey` igual; caso contrário rejeita com 401 + audit `webhook.evolution.invalid_secret`. Sem a env var, mantém compat com Evolution (autenticação por `instanceName` secreto continua sendo o único guard). Configurar a env var no Evolution self-hosted no `webhook.headers`.
- **Sempre responde 200** (`{ received: true }`) — Evolution faz retry agressivo em não-200. Erros são logados, nunca propagados.

### Eventos tratados

#### `connection.update` (formato `connection_update` com underscore também aceito)

| `data.state`  | Ação                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `open`        | `whatsappStatus = CONNECTED`, `whatsappConnectedAt = now`, zera tracking de desconexão (`whatsappReconnectedPatch`). Atualiza `whatsappPhoneNumber` se `data.key.remoteJid` presente |
| `close`       | `whatsappStatus = DISCONNECTED`. **Sprint 8**: se status anterior era `CONNECTED` (transição real), chama `markWhatsappDisconnected(userId, "webhook")` → `whatsappDisconnectedAt`, audit `whatsapp.disconnected`, email imediato ao tenant. Eventos `close` repetidos/durante pareamento não alertam. |
| `connecting`  | `whatsappStatus = CONNECTING`                                                 |

#### `messages.upsert` (resposta do paciente)

1. Ignora `data.key.fromMe = true` (mensagem enviada por nós).
2. Extrai texto: `data.message.conversation` ou `data.message.extendedTextMessage.text`.
3. Extrai telefone: `data.key.remoteJid` (`"55XXX@s.whatsapp.net"`) → `"+55XXX"`.
4. **Parse via `parseResponse(text)`**:
   - `CONFIRMED`: `CONFIRM_KEYWORDS = ["1","sim","confirmo","ok","yes","s"]`
   - `CANCELED`: `CANCEL_KEYWORDS = ["2","não","nao","cancelo","cancelar","cancel","n"]`
   - Comparação: `text.toLowerCase().trim()` exato (não `includes`).
   - Outros valores → ignora silenciosamente.
   - **Fonte única dos códigos (2026-07-11)**: esses arrays são exportados e `CONFIRM_CODE`/`CANCEL_CODE` (1º item de cada = `1`/`2`) alimentam a instrução de resposta que o `message-template.ts` anexa às mensagens enviadas (`RESPONSE_INSTRUCTION`). Assim o template nunca instrui um número que o parser não aceita — corrige o bug "Responda 2 para CONFIRMAR ou 5 para CANCELAR" (paciente confirmava e era cancelado). Ver `features/settings.md`.
5. **Match do agendamento** (`findPendingAppointmentForResponse` em `webhook-confirmation.ts`): scoped por `userId` (multi-tenancy crítico — o mesmo telefone pode estar em pacientes de tenants diferentes):
   ```
   userId: user.id
   patient.phone: { in: brPhoneCandidates(<phone do JID>) }
   status: PENDING
   confirmationSentAt: { not: null }
   dateTime >= now
   orderBy confirmationSentAt asc, take 1   // FIFO
   ```
   **⚠️ FIFO, não LIFO (mudança 2026-06-27, rodada 2 do feedback da sócia)**: era `confirmationSentAt desc` (a resposta confirmava a mensagem **mais recente**). Quando o paciente tem vários agendamentos com confirmação enviada e responde "1"/"2" várias vezes (caso real: a sócia agendou várias consultas de teste e respondeu todas), o desc casava na ordem **inversa** à leitura. Agora `asc`: cada resposta afeta a confirmação **mais antiga** ainda pendente — batendo com a ordem em que o paciente lê as mensagens (topo→fim). Como o cron envia priorizando a data mais próxima primeiro (`scheduler.ts` `orderBy dateTime asc`), o primeiro "1" tende a confirmar a consulta mais próxima. Cobertura: check `12.1` em `test:sprints` (sequência `A→B→C→null`).
   **⚠️ Nono dígito (fix 2026-06-12, achado no smoke test de produção)**: o JID do WhatsApp pode vir **sem o nono dígito** (`554197974990@s.whatsapp.net`) mesmo quando o paciente foi cadastrado com ele (`+5541997974990`) — números registrados antes do rollout do 9. Match por igualdade exata descartava a resposta silenciosamente. `brPhoneCandidates` (em `src/lib/phone.ts`) gera as duas variantes (só para celular: 1º dígito 6-9; fixo não ganha 9).
6. **Aplica resultado**:
   - `CONFIRMED` → `appointment.update({ status: CONFIRMED, confirmedAt: now })`.
   - `CANCELED`  → `appointment.update({ status: CANCELED })`.
7. **Atualiza logs**: `messageLog.updateMany({ appointmentId }, { response: <text>, respondedAt: now })`.
8. **Ack de volta ao paciente (rodada 2, 2026-06-27)**: `buildConfirmationAck(responseType, dateTime)` gera "✅ Presença confirmada! Sua consulta de {data} às {hora}…" / "❌ …cancelada…" e o webhook envia via `sendWhatsAppMessage(instance, phone, ack)`. Dá transparência (com vários agendamentos juntos, o paciente vê qual foi tratado a cada resposta). **Não consome cota** (não chama `incrementMessagesSent` — é resposta a um inbound, não disparo de campanha). Best-effort: `sendWhatsAppMessage` retorna `false` sem lançar; o resultado vai pro audit (`ackSent`). `instance` (path param) é o `evolutionInstanceName` do tenant.

## Pontos sensíveis

- **Idempotência**: chamadas duplicadas com a mesma resposta são seguras — `update` reaplica o mesmo estado e logs ficam com `respondedAt` atualizado.
- **Race vs cron**: se a resposta chega após `markNoShows` (`dateTime < now` e ainda `PENDING`), o filtro `dateTime >= now` no match impede confirmar agendamento expirado. Comportamento intencional.
- **Cross-tenant**: o filtro `userId: user.id` evita matchar paciente de outro tenant que compartilhe o mesmo telefone.
- **Texto incomum**: respostas como "ok!!" ou "1." NÃO são reconhecidas (parse exige match exato após trim/lowercase). Se quiser tolerância maior, mexer em `webhook-parser.ts`.
- **Sem trace de instância em erro**: se o `instanceName` não bate, não logamos — para evitar enumeração. Em debug, adicionar log temporário.

## Como estender

- **Novo evento Evolution** (ex: `MESSAGE_UPDATE` para read-receipt): adicione `else if (eventName === "...")` no handler. Atualizar `MessageLog.status` (`SENT|DELIVERED|READ|FAILED`).
- **Novas palavras de confirmação**: editar arrays em `parseResponse` (`webhook-parser.ts`). Manter testes em `tests/unit/webhook-parser.test.ts`.
- **Resposta livre do paciente** (chat aberto): não suportado hoje. Exigiria persistir conversa e UI de inbox.
- **Casar a resposta com o agendamento exato (reply citado)**: considerado na rodada 2 e **descartado** — exigiria guardar o `key.id` da mensagem enviada (migration em `MessageLog`) e ler `contextInfo.stanzaId` do reply, mas depende de o paciente **responder citando** a mensagem (improvável: muitos não sabem). FIFO + ack resolvem o caso comum sem isso. Se um dia for necessário, é o caminho robusto.
- **Validação de assinatura**: se a Evolution adicionar HMAC, implementar verificação no início do handler antes de qualquer query.
