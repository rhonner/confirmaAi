---
title: Dependência opcional via import dinâmico gated por env
type: concept
created: 2026-06-13
updated: 2026-06-13
tags: [pattern, observability, dependencies, dev-experience, nextjs]
sources:
  - .context/features/observability.md
related:
  - pages/concepts/dev-fallback-without-secrets.md
status: stable
---

> Como oferecer uma integração pesada e **opcional** (ex: Sentry) sem arrastar o pacote npm pro projeto até o dia em que ela for ligada — mantendo `tsc` e `next build` verdes sem a dependência instalada.

## Problema

A Sprint 9 (observabilidade) queria Sentry, mas:
- O Sentry precisa de **conta + DSN externos** (igual UptimeRobot/Resend) — não dá pra "completar" só com código.
- `@sentry/nextjs` é uma dependência grande, com config files e wrapper de `next.config`. Instalar só pra ficar dormente é custo morto e risco de build.
- Mas o ponto de captura de erro (`captureError`) precisa existir **agora**, fiado nos lugares críticos (cron, webhook), pra ter valor desde já via `console.error`.

Conflito: quero o **seam** pronto e o **encaminhamento Sentry pronto**, sem instalar o pacote nem quebrar o build de quem não tem DSN.

## Solução

Gate duplo: **env decide se liga** + **import dinâmico com specifier em variável** evita que o bundler/TS resolvam o módulo em build-time.

```ts
function sentryEnabled() { return !!process.env.SENTRY_DSN; }

let sentry: any;                       // any: o pacote pode não existir
export async function initObservability() {
  if (!sentryEnabled()) return;        // sem DSN → no-op total
  try {
    const spec: string = "@sentry/nextjs";          // <- tipo `string`, NÃO literal
    const mod = await import(/* webpackIgnore: true */ spec);
    mod.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
    sentry = mod;
  } catch (err) {
    console.error("SENTRY_DSN setado mas pacote indisponível; usando console.", err);
  }
}
```

Os dois truques que fazem o build passar sem o pacote:

1. **Specifier em variável tipada `string`** (não string literal): `await import(spec)` com `spec: string` retorna `Promise<any>` e o TypeScript **não resolve o módulo** → sem erro `Cannot find module`. Um `import("@sentry/nextjs")` literal quebraria o `tsc`.
2. **`/* webpackIgnore: true */`**: diz ao bundler do Next pra não tentar empacotar/resolver o módulo — vira `require` em runtime. Sem isso, o webpack emite warning de "expression dependency".

Resultado: build verde com ou sem `@sentry/nextjs` instalado. Ligar de verdade = `npm i @sentry/nextjs` + setar `SENTRY_DSN`. Sem nenhum dos dois, `captureError` cai no `console.error` estruturado (capturado pelos logs Vercel/VPS).

## ⚠️ Gotcha: ao ADOTAR a dependência, troque pra string literal (senão falha mudo em prod)

> Aprendido na adoção real do Sentry (2026-06-13). O truque acima é ótimo **enquanto o pacote não está instalado**. No momento em que você instala e quer que ele rode em produção, ele vira uma **armadilha silenciosa**.

O `@vercel/nft` (que decide o que entra no bundle das serverless functions da Vercel/Next) faz **análise estática**. Ele **não consegue rastrear** um `import(spec)` com specifier em variável (`spec: string`) — ainda mais com `webpackIgnore: true`, que manda ignorar de propósito. Consequência: o `@sentry/nextjs` **não é incluído** no bundle da função → em runtime, `await import(spec)` lança `MODULE_NOT_FOUND` → o `catch` engole → **Sentry nunca inicializa em produção, sem nenhum erro visível**. O dev acha que ligou; nada chega.

**Fix ao adotar**: trocar pra **string literal**, sem `webpackIgnore`:
```ts
const mod = await import("@sentry/nextjs");   // literal → nft rastreia → entra no bundle
```
Continua **lazy** (o gate `if (!sentryEnabled()) return` antes do import garante que só carrega quando há DSN — em dev sem DSN, nem em teste, o módulo é tocado) e agora é **rastreável**. Como o pacote está instalado, o `tsc` resolve o literal normalmente (sem o `any` forçado).

Regra mental: **specifier variável = "pode não existir" (build sem o pacote); specifier literal = "existe, só carregue tarde" (lazy + bundled).** Migra de um pro outro no commit que instala a dependência.

## Relação com [[dev-fallback-without-secrets]]

É o **padrão irmão**. Aquele gateia uma integração por **secret ausente** com fallback funcional (`DEV_BYPASS`/log). Este gateia uma **dependência ausente** por env + import dinâmico. Ambos: zero-fricção sem setup externo, degradação graciosa em vez de quebra.

Diferença-chave: o `dev-fallback` falha **hard em produção** se a chave faltar (a integração é obrigatória lá). Aqui é o oposto — a ausência é **legítima em qualquer ambiente**, porque a integração é genuinamente opcional (o `console.error` já é um destino válido). Por isso não há branch `if (isProd) throw`.

## Quando NÃO aplicar

- Dependência **core** que o app precisa sempre — instale e importe normal. O custo do import dinâmico (perder type-safety, `any`) só se paga quando o opcional é real.
- Quando você quer source maps/release tracking do Sentry: aí precisa do `withSentryConfig` no `next.config` em build-time, o que exige o pacote instalado. Este padrão entrega só captura de exceção em runtime.

## Cross-refs

- `.context/features/observability.md` — onde o padrão está aplicado (seam `captureError`, `onRequestError`, checks de `/api/health`).
- [[dev-fallback-without-secrets]] — o padrão irmão (secret-gated).

> Fonte: `src/lib/observability/index.ts`, `instrumentation.ts`.
