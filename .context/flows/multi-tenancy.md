# Flow: Multi-tenancy (Isolamento entre clínicas)

> Cada `User` é um tenant. Não existe coluna `tenant_id` separada — tudo é via FK `userId`.

## Princípios

1. **Isolamento por `userId`**: nenhum recurso é compartilhado entre usuários. Patient, Appointment, Settings, MessageLog, instância Evolution — todos têm vínculo direto ou transitivo com `User`.
2. **Toda query de leitura/escrita deve filtrar `userId: session.user.id`**. Exceções devem ser justificadas no código (ex: `markNoShows` não filtra porque o critério é universal e não vaza dados).
3. **Sessão é fonte da identidade**: `session.user.id` vem de `getAuthSession()` que valida existência no DB. Nunca confiar em IDs vindos do client (ex: `userId` no body é ignorado).
4. **Cascade na deleção**: `User → Patient/Appointment/Settings` com `onDelete: Cascade`. Deletar usuário limpa tudo. Deletar Patient cascateia para Appointments → MessageLogs.

## Mapa de isolamento

| Recurso        | Como é isolado                                                                |
| -------------- | ----------------------------------------------------------------------------- |
| `User`         | Identidade. Email globalmente único.                                          |
| `Patient`      | FK `userId`. Unique `(userId, phone)` permite que tenants diferentes tenham o mesmo telefone. |
| `Appointment`  | FK `userId` direta + FK `patientId` (também isolado).                         |
| `Settings`     | FK `userId` única (1:1).                                                      |
| `MessageLog`   | FK `appointmentId` → herdada do appointment (transitivo).                     |
| Instância WhatsApp | `User.evolutionInstanceName` único globalmente, formato `clinic-<userId>`. |

## Pontos de atenção

### 1. Webhook Evolution
A URL `/api/webhook/evolution/<instance>` é o **único endpoint sem cookie de sessão**. Autenticação é por `instanceName` → `User.evolutionInstanceName`. **CRÍTICO** que o filtro `userId` esteja em todas as queries dentro do handler. Ver `features/webhook-evolution.md`.

### 2. Telefone duplicado entre tenants
Constraint `@@unique([userId, phone])` permite que dois usuários cadastrem o mesmo paciente. No webhook, o match scoped por `userId: user.id` evita confirmar agendamento errado.

### 3. Search/filtros
- `search` em pacientes faz `OR { name, phone, email }` mas o `where.userId` está no nível superior do AND — Prisma combina corretamente.
- Cuidado ao adicionar filtros: nunca substituir o `where` inteiro (preservar `userId`).

### 4. Frontend
Não confiar em filtros do cliente para isolamento. Toda response do servidor já vem filtrada. O frontend só renderiza.

### 5. Email
`User.email` é globalmente único. Ao adicionar campos pessoais (CPF, etc.), decidir conscientemente se são únicos por tenant ou globais.

### 6. JWT stale
`getAuthSession()` valida que `user.id` ainda existe (defesa contra usuário deletado mas com cookie ainda válido). Sempre usar este helper, não `getServerSession` cru.

## Quando NÃO filtrar por userId

| Operação                        | Justificativa                                                          |
| ------------------------------- | ---------------------------------------------------------------------- |
| `markNoShows` (cron)            | Critério `status=PENDING AND dateTime<now` é universal, não vaza dados |
| Login (`auth.ts`)               | Antes da sessão existir — por definição não há `userId` ainda          |
| Webhook (resolução do tenant)   | Resolve `userId` a partir do `instanceName` no path                    |

Toda outra rota/serviço **deve filtrar**. Quando em dúvida, filtre.

## Checklist ao adicionar feature nova

- [ ] Modelo Prisma tem FK `userId` (direta ou transitiva)?
- [ ] Rota chama `getAuthSession()` no início?
- [ ] Toda `prisma.<modelo>.findMany/findFirst/update/delete` inclui `userId: session.user.id`?
- [ ] Body recebido **não** confia em `userId`/`tenantId` enviado pelo cliente?
- [ ] Se a feature gera notificação WhatsApp, usa `user.evolutionInstanceName` do **mesmo** usuário?
- [ ] Se cria webhook externo, há mecanismo para mapear de volta ao tenant correto?
