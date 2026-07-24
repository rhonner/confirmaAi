---
title: Mover uma data entre dias — remontar por componentes locais, nunca somar 24h
type: concept
created: 2026-07-24
updated: 2026-07-24
tags: [datetime, timezone, dst, gotcha, frontend]
sources:
  - raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
  - .context/features/agenda-day-grid.md
related:
  - pages/concepts/timezone-on-vercel.md
  - pages/concepts/baked-deadline-needs-grace-floor.md
status: stable
---

# Mover entre dias: componentes locais, não aritmética de timestamp

> Para levar um compromisso das 15:00 de um dia para as 15:00 de outro, **remonte a data** a partir dos componentes locais (ano/mês/dia do destino + hora/minuto da origem). **Somar 24h** (ou `addDays` sobre o instante) é o mesmo resultado *quase sempre* — e erra exatamente nos dias de mudança de offset.

## Contexto

No modo Mês da agenda, arrastar um chip para outra célula reagenda **mantendo o horário original** (a célula do Mês é um dia inteiro, não tem eixo de tempo). A implementação natural — `new Date(t + dias * 86_400_000)` — está errada: 86.400.000 ms é a duração de um dia *só quando o offset não muda*.

No horário de verão, um dia local tem 23h ou 25h. Somar 24h desloca o compromisso em uma hora: "15:00" vira "14:00" ou "16:00". O bug é sazonal, silencioso, e some quando você tenta reproduzir fora da janela de transição.

## A regra

```ts
// src/components/agenda/month-view.tsx — helper puro, exportado e testado
export function moveKeepingTime(dateTimeIso: string, targetDay: Date): Date {
  const src = parseISO(dateTimeIso);
  return new Date(
    targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate(),
    src.getHours(), src.getMinutes(), 0, 0,
  );
}
```

O construtor com componentes locais resolve o offset **do dia de destino**, que é exatamente a semântica desejada: "mesmo horário de parede, outro dia". A duração é preservada à parte (não derive o fim somando ao novo início sem revalidar).

## Pontos-chave

- **"Mesmo instante" ≠ "mesmo horário de parede".** Aritmética de timestamp preserva o primeiro; arrastar num calendário quer o segundo. Escolha explicitamente qual dos dois você quer.
- **Isole num helper puro e teste-o.** `moveKeepingTime` é exportado e coberto por unit test justamente porque o bug não aparece em teste manual fora da transição de DST.
- **Vale para qualquer "repetir semanalmente", "adiar para amanhã", "mesma hora no mês que vem".** Toda operação de calendário expressa em *dias* deve passar por componentes, não por milissegundos.
- **O Brasil não observa DST desde 2019** — o que torna esse bug ainda mais perigoso aqui: ele não reproduz localmente, mas atinge qualquer usuário/servidor em fuso que observe, e volta se a política mudar.

## Quando NÃO se aplica

- Durações e prazos ("+2 horas", "expira em 15 min") são genuinamente sobre **instantes**: aritmética de timestamp é a forma correta ali. Ver [[baked-deadline-needs-grace-floor]].

## Cross-refs

- `.context/features/agenda-day-grid.md` § "Arraste entre dias no modo Mês".
- [[timezone-on-vercel]] — o outro lado: garantir que o servidor interprete o fuso certo.

## Fontes

- raw/sessions/2026-07-24-1526-agenda-drag-timeblocks.md
