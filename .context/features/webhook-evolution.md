# Feature: Webhook Evolution

> Endpoint que recebe eventos da Evolution API: estado de conexão (`CONNECTION_UPDATE`) e mensagens recebidas (`MESSAGES_UPSERT`). Identifica o tenant pelo `instanceName` no path.

## Arquivos que compõem a feature

| Camada              | Caminho                                                          |
| ------------------- | ---------------------------------------------------------------- |
| Rota webhook        | `src/app/api/webhook/evolution/[instance]/route.ts`              |
| Parser de resposta  | `src/lib/services/webhook-parser.ts`                             |
| Modelos relacionados | `User`, `Appointment`, `MessageLog` em `prisma/schema.prisma`   |

## Regras de negócio

- **Path identifica o tenant**: `/api/webhook/evolution/<instance>` → busca `User where { evolutionInstanceName: instance }`. Se não encontrar, retorna `200 { received: true }` silenciosamente (não vaza existência).
- **Shared secret opcional** (Sprint 1 hardening): se `EVOLUTION_WEBHOOK_SECRET` está setada, exige header `x-evolution-secret` ou `apikey` igual; caso contrário rejeita com 401 + audit `webhook.evolution.invalid_secret`. Sem a env var, mantém compat com Evolution (autenticação por `instanceName` secreto continua sendo o único guard). Configurar a env var no Evolution self-hosted no `webhook.headers`.
- **Sempre responde 200** (`{ received: true }`) — Evolution faz retry agressivo em não-200. Erros são logados, nunca propagados.

### Eventos tratados

#### `connection.update` (formato `connection_update` com underscore também aceito)

| `data.state`  | Ação                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `open`        | `whatsappStatus = CONNECTED`, `whatsappConnectedAt = now`. Atualiza `whatsappPhoneNumber` se `data.key.remoteJid` presente |
| `close`       | `whatsappStatus = DISCONNECTED`                                               |
| `connecting`  | `whatsappStatus = CONNECTING`                                                 |

#### `messages.upsert` (resposta do paciente)

1. Ignora `data.key.fromMe = true` (mensagem enviada por nós).
2. Extrai texto: `data.message.conversation` ou `data.message.extendedTextMessage.text`.
3. Extrai telefone: `data.key.remoteJid` (`"55XXX@s.whatsapp.net"`) → `"+55XXX"`.
4. **Parse via `parseResponse(text)`**:
   - `CONFIRMED`: `["1","sim","confirmo","ok","yes","s"]`
   - `CANCELED`: `["2","não","nao","cancelo","cancelar","cancel","n"]`
   - Comparação: `text.toLowerCase().trim()` exato (não `includes`).
   - Outros valores → ignora silenciosamente.
5. **Match do agendamento**: scoped por `userId` (multi-tenancy crítico — o mesmo telefone pode estar em pacientes de tenants diferentes):
   ```
   userId: user.id
   patient.phone: { in: brPhoneCandidates(<phone do JID>) }
   status: PENDING
   confirmationSentAt: { not: null }
   dateTime >= now
   orderBy confirmationSentAt desc, take 1
   ```
   **⚠️ Nono dígito (fix 2026-06-12, achado no smoke test de produção)**: o JID do WhatsApp pode vir **sem o nono dígito** (`554197974990@s.whatsapp.net`) mesmo quando o paciente foi cadastrado com ele (`+5541997974990`) — números registrados antes do rollout do 9. Match por igualdade exata descartava a resposta silenciosamente. `brPhoneCandidates` (em `src/lib/phone.ts`) gera as duas variantes (só para celular: 1º dígito 6-9; fixo não ganha 9).
6. **Aplica resultado**:
   - `CONFIRMED` → `appointment.update({ status: CONFIRMED, confirmedAt: now })`.
   - `CANCELED`  → `appointment.update({ status: CANCELED })`.
7. **Atualiza logs**: `messageLog.updateMany({ appointmentId }, { response: <text>, respondedAt: now })`.

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
- **Validação de assinatura**: se a Evolution adicionar HMAC, implementar verificação no início do handler antes de qualquer query.
