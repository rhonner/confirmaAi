---
title: Guard de resposta assíncrona obsoleta (ref-espelho do contexto ativo)
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [pattern, react, frontend, async, privacy]
sources:
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/nextauth-getserversession-noop-res.md
status: stable
---

> Quando um callback assíncrono (`mutation.onSuccess`, `fetch().then`, etc.) grava em **estado compartilhado** da UI, ele deve checar se o contexto que o disparou **ainda é o ativo** antes de aplicar o resultado. O callback captura o contexto do momento do disparo; se o usuário trocou/fechou aquele contexto enquanto a resposta viajava, aplicar o resultado **vaza dados de um contexto abandonado** para o atual.

## Contexto

Na agenda, clicar "Promover" num evento do Google dispara `signalsMutation.mutate(event.id)` (busca telefone/e-mail no Google) e o `onSuccess` grava em `newPatientDefaults` — um estado **compartilhado** que também alimenta o formulário de "Novo Agendamento" limpo.

Bug (achado no code-review): o usuário clica "Promover" no evento A → fecha o diálogo → clica "Novo Agendamento" (que zera `newPatientDefaults`). A resposta de sinais de A, ainda em voo, resolve e **repovoa** `newPatientDefaults` com o nome/telefone de A. O form de novo paciente abre pré-preenchido com dados de um evento **abandonado** (potencialmente de outra pessoa). O `onSuccess` não amarrava a resposta ao evento ainda ativo.

## Pontos-chave

- **Ref-espelho do contexto ativo**: mantenha um `ref` que espelha o estado do contexto atual (`promoteEventRef` ← `promoteEvent` via `useEffect`). No `onSuccess`, compare a chave capturada no disparo (`event.id`) com `ref.current?.id`; **bail** se divergirem.
  ```ts
  const promoteEventRef = useRef(null);
  useEffect(() => { promoteEventRef.current = promoteEvent; }, [promoteEvent]);
  // ...
  signalsMutation.mutate(event.id, {
    onSuccess: (res) => {
      if (promoteEventRef.current?.id !== event.id) return; // resposta obsoleta
      setNewPatientDefaults(/* ... */);
    },
  });
  ```
- **Por que ref e não a variável de estado**: o `onSuccess` fecha sobre o valor de `promoteEvent` **do momento do `mutate`** (stale closure). O `ref` sempre lê o valor **atual**.
- **Por que compartilhar estado piora**: se cada contexto tivesse seu próprio destino isolado, a resposta obsoleta escreveria num lugar já descartado — inofensivo. O vazamento só existe porque `newPatientDefaults` é compartilhado entre "promover" e "novo agendamento".
- Vale para qualquer `then/onSuccess` que persista efeito em estado de vida mais longa que o disparo: buscas de digitação (typeahead), navegação entre itens, wizards.

## Cross-refs

- `.context/features/google-calendar.md` — § Fase B (o `handleOpenPromote` e o guard).
- [[nextauth-getserversession-noop-res]] — outro caso "o callback roda mas o efeito se perde/vaza no lugar errado".
