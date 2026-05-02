# Feature: WhatsApp (Evolution API)

> Conexão por usuário a uma instância Evolution API dedicada. Cada usuário tem sua própria instância (multi-tenant), pareada via QR code lido do app.

## Arquivos que compõem a feature

| Camada              | Caminho                                                |
| ------------------- | ------------------------------------------------------ |
| Cliente Evolution   | `src/lib/services/evolution.ts`                        |
| Wrapper de envio    | `src/lib/services/whatsapp.ts`                         |
| Rota status         | `src/app/api/whatsapp/status/route.ts`                 |
| Rota conectar       | `src/app/api/whatsapp/connect/route.ts`                |
| Rota desconectar    | `src/app/api/whatsapp/disconnect/route.ts`             |
| Webhook (entrada)   | `src/app/api/webhook/evolution/[instance]/route.ts` (ver `features/webhook-evolution.md`) |
| Hook React Query    | `src/hooks/use-api.ts` → `useWhatsappStatus`, `useWhatsappConnect`, `useWhatsappDisconnect` |
| Componente UI       | `src/components/settings/whatsapp-connection.tsx`      |
| Página              | `src/app/(dashboard)/configuracoes/page.tsx`           |
| Helpers de telefone | `src/lib/phone.ts` (`digitsOnly`, etc.)                |
| Modelo Prisma       | Campos em `User`: `evolutionInstanceName`, `whatsappStatus`, `whatsappPhoneNumber`, `whatsappConnectedAt` |

## Regras de negócio

- **Uma instância por usuário**, nomeada `clinic-<userId>`. Persistida em `User.evolutionInstanceName` (único).
- **Status (enum `WhatsappStatus`)**: `DISCONNECTED | CONNECTING | CONNECTED | FAILED`. Default `DISCONNECTED`.
- **Estado autoritativo**: Evolution API é a **fonte de verdade**. Local DB é cache atualizado em duas situações:
  1. `GET /api/whatsapp/status` (poll) sincroniza com `getInstanceStatus` da Evolution.
  2. Webhook `connection.update` (push) — ver `features/webhook-evolution.md`.
- **Webhook URL** (registrado na Evolution na criação): `${EVOLUTION_WEBHOOK_BASE_URL || NEXT_PUBLIC_APP_URL}/api/webhook/evolution/<instanceName>`.
- **Eventos registrados**: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`. Integração: `WHATSAPP-BAILEYS`.

## Endpoints internos

| Método | Path                          | Resposta                                                                 |
| ------ | ----------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/whatsapp/status`        | `{ status, phoneNumber, connectedAt }` — sincroniza com Evolution antes  |
| POST   | `/api/whatsapp/connect`       | `{ instanceName, qrcodeBase64, status }` — cria ou reconecta             |
| POST   | `/api/whatsapp/disconnect`    | `{ ok: true }` — chama `deleteInstance` (logout + delete) e zera campos  |

### Comportamento do `connect`

- **Primeira conexão**: chama `createInstance(instanceName, webhookUrl)` da Evolution com `qrcode: true`. Retorna QR base64. Persiste `evolutionInstanceName` e `whatsappStatus = CONNECTING`.
- **Reconexão**:
  - Se `getInstanceStatus` retornar `state = "open"` → atualiza para `CONNECTED` e retorna `qrcodeBase64: null`.
  - Caso contrário → chama `connectInstance` para gerar novo QR.

### Comportamento do `status`

Lê estado local + chama Evolution. Faz upgrade/downgrade:
- `state=open` → `CONNECTED` (atualiza `phoneNumber` e seta `connectedAt` se for a primeira vez).
- `state=connecting` → `CONNECTING`.
- `state=close|unknown` → `DISCONNECTED` **só se** estávamos `CONNECTED`. Evita "rebaixar" prematuramente um `CONNECTING` recém-criado.

## Funções da Evolution (em `src/lib/services/evolution.ts`)

```ts
createInstance(instanceName, webhookUrl) → { instanceName, qrcodeBase64 }
connectInstance(instanceName)            → { qrcodeBase64 }
getInstanceStatus(instanceName)          → { state, phoneNumber }
deleteInstance(instanceName)             → void   // logout + delete, idempotente
sendText(instanceName, phone, message)   → boolean
```

- Headers: `apikey: EVOLUTION_API_KEY` (admin global, não é por instância).
- `phone` em `sendText` é normalizado com `digitsOnly` (Evolution exige só dígitos).
- `state="unknown"` quando instância não existe (404 da Evolution).
- `ownerJid` `"55XXX@s.whatsapp.net"` → convertido para `"+55XXX"` em `getInstanceStatus`.

## Wrapper `sendWhatsAppMessage`

```ts
sendWhatsAppMessage(instanceName: string | null | undefined, phone: string, message: string) → boolean
```
- Loga e retorna `false` se `instanceName` for null/undefined (usuário não configurou).
- Chamado pelo scheduler em `src/lib/services/scheduler.ts`.

## Pontos sensíveis

- **Variáveis de ambiente obrigatórias**: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`. Falta delas → `getConfig()` retorna `null` e `evoFetch` joga erro.
- **`EVOLUTION_WEBHOOK_BASE_URL`**: deve ser uma URL **acessível pela Evolution** (Evolution chama de fora). Em dev, use ngrok ou similar. Sem isso, webhooks não chegam e a UI fica eternamente em `CONNECTING` (a sincronização via `GET /status` ainda funciona, então estado eventualmente vai para `CONNECTED`).
- **Multi-tenancy**: o webhook autentica pelo `instanceName` na URL (mapeia para o `User.evolutionInstanceName`). Se a instância não existe no DB, request é silenciosamente ignorada (`return { received: true }`).
- **Race no QR scan**: usuário escaneia o QR enquanto estamos em `CONNECTING`. O webhook `connection.update` (state=open) chega e marca `CONNECTED`. UI tem polling em `useWhatsappStatus(refetchInterval)` para refletir.
- **Persistência do QR**: o QR é retornado uma vez (não armazenado). Se expirar, frontend deve chamar `connect` novamente.

## Como estender

- **Novo tipo de mensagem** (imagem, áudio): adicionar função em `evolution.ts` (`sendImage`, etc.) seguindo o padrão `sendText`. Wrapper em `whatsapp.ts` se quiser desacoplar.
- **Suporte a múltiplos números por usuário**: hoje `evolutionInstanceName` é único e singular. Migrar para tabela `WhatsappInstance` com FK `userId` e selecionar por padrão. Mexe em scheduler e webhook.
- **Logs detalhados**: persistir tentativas/erros de envio em `MessageLog.status = FAILED`. Atualmente o scheduler só cria log se sucesso.
