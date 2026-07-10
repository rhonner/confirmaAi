---
title: Form de edição sobrescreve escrita concorrente do servidor
type: concept
created: 2026-07-10
updated: 2026-07-10
tags: [gotcha, forms, concurrency, data-loss, react-hook-form, appointments]
sources:
  - raw/sessions/2026-07-10-2200-agenda-month-view.md
related:
  - .context/features/appointments.md
  - pages/concepts/stale-async-response-guard.md
status: stable
---

> Um formulário de edição que **sempre** reenvia um campo capturado ao abrir sobrescreve, ao salvar, qualquer mudança que o servidor tenha feito naquele campo enquanto a janela estava aberta.

## O padrão da falha

1. O usuário abre a janela de edição de um registro. O form é populado com um **snapshot** dos valores do momento (ex.: `reset({ status: appointment.status, ... })`).
2. Enquanto a janela está aberta, **outro ator muda o mesmo campo no servidor**: um webhook (paciente confirma no WhatsApp → `CONFIRMED`), um cron (no-show → `NO_SHOW`), outra aba, outro usuário.
3. O usuário edita um campo **não relacionado** (observações, horário) e salva.
4. O PUT carrega o `status` **stale** do snapshot → reverte a mudança do servidor. Silenciosamente. Sem conflito, sem aviso.

No ConfirmaAí isso apareceu quando a janela de edição da agenda passou a ter um `<select>` de Status e o `onSubmit` mandava `status: data.status` sempre. Antes, status só era mutado pelo menu "⋮" dedicado, então uma edição de observações **nunca** tocava o status — a regressão nasceu ao unificar as ações na janela.

## O fix: só envie o que mudou

Envie o campo apenas quando ele **de fato** divergir do valor carregado:

```ts
const statusChanged =
  data.status !== undefined && data.status !== selectedAppointment.status;
await update({
  id, patientId, dateTime, durationMinutes, notes,
  ...(statusChanged ? { status: data.status } : {}),
});
```

- A rota PUT já monta `updateData` **explicitamente** (`if (status !== undefined) updateData.status = status`), então **omitir** o campo = "não mexa nele". Isso é pré-requisito: um PUT que faz `...spread` do body inteiro não te dá essa saída.
- Bônus: protege também contra **staleness de display** — reabrir a janela logo após uma mudança (antes do refetch do React Query) mostra o valor antigo; como o usuário não mexeu no seletor, `statusChanged=false` e o valor stale não é reenviado.

## Regra geral

- **Diffe contra o valor carregado, não contra vazio.** "Mandar tudo que está no form" só é seguro se o form for a única fonte de escrita daquele campo.
- Para o caso forte (multiusuário, dinheiro), use **optimistic concurrency** (version/`updatedAt` no PUT → 409 se mudou). O diff-de-campo resolve o caso comum (edição de campo A não pode reverter campo B) sem isso.
- Parente próximo: [[stale-async-response-guard]] (descartar resposta assíncrona obsoleta) — ali o problema é a resposta que chega tarde; aqui é o **request** que sai com dado velho.

## Wikilinks

- [[stale-async-response-guard]]
- Operacional: `.context/features/appointments.md` (§ ações unificadas)

> Fonte: raw/sessions/2026-07-10-2200-agenda-month-view.md
