---
title: Claim novo no JWT coage tokens antigos ao default → gate errado
type: concept
created: 2026-07-19
updated: 2026-07-19
tags: [nextauth, jwt, session, migration, deploy, code-review, gotcha]
sources:
  - raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
related:
  - .context/features/onboarding.md
  - pages/concepts/nextauth-getserversession-noop-res.md
  - pages/concepts/migrations-not-auto-applied.md
status: stable
---

# Claim novo no JWT coage tokens antigos ao default → gate errado

> Adicionar um claim novo ao JWT do NextAuth **não reemite** os tokens já em circulação. Eles chegam **sem** o claim; o session callback aplica o default (`?? null`), e se algum gate depende desse valor, ele dispara **errado para toda a base já logada** após o deploy.

## Contexto

Feature de Onboarding (2026-07-19): novos campos `businessType`/`onboardingCompletedAt` no `User`, espelhados no **JWT/sessão**. Um `<OnboardingWizard/>` (Dialog **não-dispensável**) abre quando `session.user.onboardingCompletedAt == null`. A migration **backfillou** os usuários existentes (`onboardingCompletedAt = now`) justamente pra que **não** vissem o wizard.

## O bug (crítico, achado no code-review)

O backfill arrumou o **banco**. Mas quem já estava logado carrega um **JWT antigo**, emitido antes da feature existir — e esse token **não tem** o claim `onboardingCompletedAt`, por mais que a linha no banco tenha.

Fluxo do estrago, pós-deploy:

1. token antigo → `token.onboardingCompletedAt === undefined`;
2. session callback faz `(token.onboardingCompletedAt) ?? null` → `session.user.onboardingCompletedAt = null`;
3. o gate lê `== null` → **abre o wizard não-dispensável** → **toda a base já logada trava** numa tela de onboarding, apesar de já estar backfillada.

O JWT é **stateless e assinado** — o backfill no banco não o alcança. O default (`?? null`) é justamente o valor que significa "não onboardado", então o token vazio se disfarça de usuário novo.

## Por que `undefined` ≠ `null` importa aqui

- `undefined` = "**este token é antigo**, o claim nunca foi setado" → devemos **buscar a verdade no banco**.
- `null` = "usuário **novo**, de fato não-onboardado" → o default está correto, **não** relê.

Colapsar os dois em `?? null` (que é o que o session callback faz) apaga essa distinção. O conserto tem que agir **antes** do colapso, no `jwt` callback, testando `=== undefined`.

## O fix: lazy-load do banco quando o claim está AUSENTE

No `jwt` callback (`auth.ts`), quando o claim é `undefined` (≠ `null`), lê o banco **uma vez** e popula o token (persiste no próximo fetch do client):

```ts
// jwt callback — migração de claim novo
if (token.onboardingCompletedAt === undefined && token?.id) {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { businessType: true, onboardingCompletedAt: true },
    })
    token.businessType = dbUser?.businessType ?? null
    token.onboardingCompletedAt = dbUser?.onboardingCompletedAt
      ? dbUser.onboardingCompletedAt.toISOString()
      : null
  } catch { /* blip do banco: deixa como está; o próximo fetch tenta de novo */ }
}
```

Isso é uma **leitura única de migração** (só dispara enquanto o token não tiver o claim), diferente de reler o banco a cada request — que seria a regressão de custo descrita em [[nextauth-getserversession-noop-res]].

## Defesa em profundidade aplicada junto

- O wizard virou **dispensável** (`dismissed` local + `onOpenChange`): mesmo que o gate erre, ele vira nudge (reaparece no próximo load enquanto não concluído), não trava o dashboard.
- `finish()` fecha o wizard assim que o **POST** persiste; o `updateSession()` é best-effort (o próximo load reflete via o mesmo lazy-load).

## Lição reusável

- **Adicionar claim ao JWT é uma "migração" que os tokens vivos não recebem.** Toda vez que um novo claim gateia comportamento, trate o `undefined` (token pré-feature) explicitamente — via lazy-load único OU forçando reautenticação.
- Prefira que o **default de um claim ausente** seja o estado **inócuo** (não o que dispara ação). Aqui, se o default fosse "onboardado", o pior caso seria alguém não ver o wizard — reversível — em vez de travar a base inteira.
- Backfill de banco **não** conserta sessões já emitidas — é o análogo, na camada de sessão, do [[migrations-not-auto-applied]] (o deploy do código não alcança o estado que já está "em produção").

## Cross-refs

- `.context/features/onboarding.md` — feature completa (§ Correções de code-review).
- [[nextauth-getserversession-noop-res]] — por que NÃO reler o banco a cada request (o lazy-load único evita essa regressão).
- [[migrations-not-auto-applied]] — irmão na camada de banco: estado deployado ≠ estado aplicado.

> Fonte: `src/lib/auth.ts` (callback `jwt`, guarda `onboardingCompletedAt === undefined`), raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
