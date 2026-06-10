---
title: Vercel Hobby limita cron a 1×/dia — workaround via crontab da VPS
type: concept
created: 2026-06-10
updated: 2026-06-10
tags: [vercel, cron, scheduler, hobby, infra]
sources:
  - raw/sessions/2026-06-10-sprint6-and-golive.md
related:
  - pages/concepts/defense-in-depth-cron.md
  - .context/features/scheduler.md
status: stable
---

> O plano Hobby da Vercel só permite cron jobs **diários**. O scheduler do ConfirmaAí precisa rodar a cada 30 min (confirmações 24h antes, lembretes com janela de 2h). Solução em produção: **a VPS Hetzner (que já roda 24/7 pra Evolution) dispara o endpoint**.

## Arquitetura

```
VPS Hetzner (root crontab)
  */30 * * * * /usr/local/bin/clinica-cron.sh
      └─ curl -H "Authorization: Bearer $CRON_SECRET" https://clinicaorganizada.com/api/cron/run
              └─ runSchedulerJobs() (mesmo código, mesma auth do Vercel Cron)

Vercel Cron (vercel.json: "0 3 * * *")
  └─ mesma rota — fica como REDUNDÂNCIA diária (se a VPS morrer, o pior caso é 1 envio/dia)
```

- Log: `/var/log/clinica-cron.log` na VPS (respostas JSON `{"ok":true,...}` + timestamp).
- A rota valida `Bearer CRON_SECRET` — chamadas externas sem o secret levam 401, então expor o endpoint é seguro.

## Por que esse desenho é bom

1. **Zero custo novo** — a VPS já existe pra Evolution.
2. **Muda quem chama, não o código** — é o "botão de escala" do scheduler descrito em `monetization-v2.md` §9.4. Migrar pra Vercel Pro ou QStash no futuro = trocar o disparador, nada mais.
3. **Dupla via** — VPS (30min) + Vercel (diário) se cobrem mutuamente. Complementa o [[defense-in-depth-cron]] (que é sobre *conteúdo* do job, este é sobre *disparo*).

## Vigilância (Sprint 9)

O run audita `cron.run` com stats — o futuro `/api/health` alerta se o último run tem >90 min, cobrindo "crontab da VPS morreu e ninguém viu".

> Fonte: raw/sessions/2026-06-10-sprint6-and-golive.md — crontab descoberto em auditoria SSH; já estava em produção desde ~maio (commits "fixed cron", "added manual route to cron").
