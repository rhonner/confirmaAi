---
title: Token de reset de senha stateless (single-use sem migration)
type: concept
created: 2026-06-14
updated: 2026-06-14
tags: [pattern, auth, security, password-reset, crypto]
sources:
  - raw/sessions/2026-06-14-migration-incident-sprint10.md
  - .context/features/auth.md
related:
  - pages/concepts/migrations-not-auto-applied.md
status: stable
---

> Como fazer reset de senha com token **single-use** sem criar coluna/tabela (sem migration): assinar o token com uma chave que **inclui o hash atual da senha**. Trocar a senha invalida o token automaticamente.

## Contexto

A verificação de email do projeto usa token em DB (`User.emailVerificationToken`, hash, expiry). Para o reset de senha (Sprint 10/fatia 2.1), evitamos uma coluna nova — ainda mais logo após o [[migrations-not-auto-applied|incidente de migration]]. Padrão clássico (Django `PasswordResetTokenGenerator`).

## Como funciona

```
token = base64url(`${userId}.${exp}`) + "." + HMAC_SHA256(body, NEXTAUTH_SECRET + passwordHash)
```

- **Chave do HMAC** = `NEXTAUTH_SECRET + hash atual da senha (bcrypt)`.
- **`makeResetToken(userId, passwordHash)`** e **`parseAndVerify(token, passwordHash, now)`** são PUROS (testáveis sem DB).
- **`verifyResetToken(token)`** decodifica o `userId`, busca o user (`select: { id, password }`) e chama `parseAndVerify` com o hash atual.

### Por que é single-use sem nada persistido

Ao concluir o reset, a senha muda → o `bcrypt` hash muda → a chave do HMAC muda → o token antigo **não valida mais**. Não precisa guardar nem invalidar token: o próprio uso (troca de senha) o mata. Expiração de 1h via o campo `exp` no corpo assinado.

### Garantias

- HMAC com `NEXTAUTH_SECRET` → não forjável sem o secret.
- Binding no hash da senha → single-use.
- `exp` → janela curta (1h).
- `timingSafeEqual` na comparação da assinatura.
- Anti-enumeration: `forgot-password` sempre responde 200 (não revela se o email existe).

## Quando NÃO usar

- Se você precisa **revogar** tokens explicitamente antes do uso (ex: "desconectar todos os links pendentes" sem trocar a senha) — aí precisa de storage.
- Se o hash da senha não estiver disponível no verify (ex: provider externo de senha) — o binding não funciona.

## Trade-off vs. token em DB

| | Stateless (este) | DB token (email-verify) |
| - | ---------------- | ----------------------- |
| Migration/coluna | ❌ não precisa | ✅ precisa |
| Single-use | via hash-binding | via apagar o token |
| Revogação manual | difícil | fácil |

## Cross-refs

- `.context/features/auth.md` — implementação (`src/lib/anti-fraud/password-reset.ts`).
- [[migrations-not-auto-applied]] — por que evitamos a coluna nova.

> Fonte: `src/lib/anti-fraud/password-reset.ts`, fatia 2.1 (validada em prod com Resend "Delivered").
