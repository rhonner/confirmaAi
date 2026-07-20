---
title: Deadline "assado" no envio precisa de piso de GRACE
type: concept
created: 2026-07-19
updated: 2026-07-19
tags: [scheduler, deadline, cron, race, confirmation-link, code-review, gotcha]
sources:
  - raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
related:
  - .context/features/confirmation-link.md
  - pages/concepts/whatsapp-reply-fifo-match-and-ack.md
status: stable
---

# Deadline "assado" no envio precisa de piso de GRACE

> Quando o prazo de uma ação é calculado a partir do horário do evento (`dateTime − offset`), um envio **tardio** faz o prazo nascer **no passado** → o link já chega expirado e é auto-cancelado no mesmo run. O conserto é um **piso**: o prazo nunca é antes de `sentAt + GRACE`.

## Contexto

Confirmação por Link (2026-07-19): o link vale até um **deadline** (padrão `dateTime − reminderHoursBefore`, T‑6h). No deadline, quem recebeu o link e ainda está `PENDING` é **auto-cancelado** (`autoCancelUnconfirmed` no `scheduler.ts`, que substituiu o antigo lembrete). O `exp` do token é assado nesse deadline no momento do envio.

## O bug (achado crítico do code-review)

O offset presume que a confirmação sai **com folga** antes do horário. Mas o envio pode atrasar:

- **backlog do cron** (chunking / time-budget / muitos tenants);
- **WhatsApp do tenant reconectou tarde**;
- agendamento **criado em cima da hora** (last-minute), já dentro de `reminderHoursBefore` do horário.

Nesses casos `dateTime − reminderHoursBefore` já é **passado no instante do envio**. Sem proteção:

1. o token nasce com `exp` no passado → o paciente abre o link e vê **"expirado"**;
2. no MESMO run (ou no próximo), `now >= deadline` → o agendamento é **auto-cancelado** sem que o paciente tivesse chance.

Um envio de última hora vira cancelamento automático imediato. Silencioso e em escala (é o cron).

## O fix: piso `sentAt + GRACE`, teto `dateTime`

`effectiveDeadlineMs` (pura, exportada e testada) clampa o deadline nominal entre um **piso** e um **teto**:

```ts
const CONFIRM_GRACE_MS = 2 * 3_600_000; // 2h
export function effectiveDeadlineMs(dateTime, reminderHoursBefore, sentAtMs) {
  const nominal = dateTime.getTime() - reminderHoursBefore * 3_600_000;
  const floor   = sentAtMs + CONFIRM_GRACE_MS;           // envio tardio: ≥2h de janela
  return Math.min(dateTime.getTime(), Math.max(nominal, floor)); // teto = o próprio horário
}
```

- **Piso** `sentAt + GRACE`: o paciente sempre tem ≥2h para confirmar, por mais tarde que o link saia.
- **Teto** `dateTime`: o prazo nunca passa do horário do agendamento (confirmar depois não faz sentido).

## A invariante que faz tudo bater: mesma fórmula nos dois lados

O ponto sutil é que **o `exp` do token e o gatilho do auto-cancel usam a MESMA função**, variando só o `sentAt`:

- no envio (`sendConfirmations`), `sentAt = now`;
- no auto-cancel (`autoCancelUnconfirmed`), `sentAt = confirmationSentAt` (o instante gravado no envio).

Como `confirmationSentAt` ≈ o `now` do envio, os dois cálculos convergem para o mesmo epoch → **o link não expira antes de o agendamento ser cancelável, nem vice-versa**. Se cada lado calculasse o prazo do seu jeito, abriria janelas de inconsistência ("link diz expirado mas o agendamento ainda está aberto").

## Débito conhecido (deferido)

O `exp` é **assado** com o `reminderHoursBefore` do momento do envio; o auto-cancel relê o valor **vivo**. Se o dono **mudar** `reminderHoursBefore` com um link já enviado, os dois podem divergir. Fix definitivo = **gravar o deadline no `Appointment`** (coluna nova + migration) — não feito pra evitar migration na rodada. Edge raro.

## Lição reusável

- Todo prazo **derivado do evento** (não do envio) tem esse buraco quando o envio atrasa. Sempre pergunte: "e se isto for enviado **agora**, 1 minuto antes do fim?" → precisa de um piso relativo ao envio.
- Deadline que dispara **ação destrutiva automática** (cancelar) merece piso generoso — o custo de esperar 2h a mais é zero perto do custo de cancelar um agendamento válido.

## Cross-refs

- `.context/features/confirmation-link.md` — feature completa (§ Deadline + auto-cancelamento).
- [[link-action-must-not-mutate-on-get]] — o outro pilar da mesma feature.
- [[whatsapp-reply-fifo-match-and-ack]] — o fallback 1/2 do webhook segue vivo em paralelo ao link.

> Fonte: `src/lib/services/scheduler.ts` (`effectiveDeadlineMs`, `autoCancelUnconfirmed`), `tests/unit/scheduler-deadline.test.ts`, raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md
