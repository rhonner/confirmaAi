---
title: NextAuth v4 CredentialsProvider — authorize fica em .options.authorize
type: concept
created: 2026-06-24
updated: 2026-06-24
tags: [nextauth, auth, gotcha, testing]
sources:
  - raw/sessions/2026-06-24-bugfix-cadastro-login.md
related:
  - .context/features/auth.md
status: draft
---

# NextAuth v4 CredentialsProvider — a `authorize` real fica em `.options.authorize`

> Pegadinha que custou um debug inteiro: `CredentialsProvider(opts)` **não** expõe a sua `authorize` no topo do objeto do provider. Ela fica aninhada em `.options`, e o merge (suas opções vencem) só acontece quando o NextAuth normaliza os providers em runtime.

## O que acontece

`node_modules/next-auth/providers/credentials.js` é literalmente:

```js
function Credentials(options) {
  return {
    id: "credentials",
    name: "Credentials",
    type: "credentials",
    credentials: {},
    authorize: () => null,   // <-- STUB no topo
    options,                 // <-- suas opções (incl. a authorize REAL) aqui
  };
}
```

Então `authOptions.providers[0].authorize` é o **stub `() => null`**. A função que você escreveu está em `authOptions.providers[0].options.authorize`. Em produção isso é transparente: o core do NextAuth faz `{ ...provider, ...provider.options }` ao inicializar, e a sua `authorize` vence. Mas **fora do runtime do NextAuth** (ex.: um unit test que importa `authOptions` e chama a authorize direto) você pega o stub e tudo retorna `null` silenciosamente.

## Sintoma

Teste que chama `authOptions.providers[0].authorize(creds, req)` retorna `null` para **todos** os casos (senha certa, senha errada, e-mail não verificado), **sem** escrever nenhum `AuditLog` e sem logar erro — porque o stub nunca executa o seu código.

## Fix (para testar a authorize de verdade)

```ts
const authorize = (authOptions.providers[0] as any).options.authorize;
await authorize({ email, password }, { headers: {} });
```

`req` pode ser `{ headers: {} }` — sem `x-forwarded-for`/`x-real-ip` o `extractIp` devolve `null` e o rate-limit por IP é pulado. Validado em `scripts/test-sprints.ts` (checks 11.30/11.31/11.35).

## Bônus confirmado: throw em `authorize` chega ao client em v4

Lançar um `Error` dentro de `authorize` **propaga a `message` até `signIn(..., { redirect: false }).error`** no client em NextAuth v4 (validado no browser). É assim que sinalizamos "e-mail não verificado" sem retornar `null` genérico:

```ts
// auth.ts
export class EmailNotVerifiedError extends Error {
  constructor() { super("EMAIL_NOT_VERIFIED"); this.name = "EmailNotVerifiedError"; }
}
// ...no authorize, após validar a senha:
if (!user.emailVerifiedAt) throw new EmailNotVerifiedError();
// ...no catch do authorize, re-propaga só essa classe (resto → null):
if (error instanceof EmailNotVerifiedError) throw error;
```

```ts
// login/page.tsx
if (result?.error?.includes("EMAIL_NOT_VERIFIED")) { /* mostra painel de reenvio */ }
```

`return null` em `authorize` sempre vira o erro genérico `"CredentialsSignin"` no client; só **throw** carrega uma mensagem distinguível.

## Cross-refs

- `.context/features/auth.md` — fluxo de login/verificação operacional (gate de e-mail, reenvio).
- [[rate-limit-via-audit]] — o `req?.headers` consumido pela authorize alimenta o rate-limit.

> Fonte: `src/lib/auth.ts`, `node_modules/next-auth/providers/credentials.js`, `raw/sessions/2026-06-24-bugfix-cadastro-login.md`.
