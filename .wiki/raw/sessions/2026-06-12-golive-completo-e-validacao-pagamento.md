# Sessão 2026-06-12 — Go-live concluído, smoke test E2E, validação de pagamento real, unificação de marca

> Branch: `main` (v2 mergeada). Sessão de fechamento do go-live: do "~90% pronto" até **v2 vendendo em produção** com fluxo validado fim-a-fim com dinheiro real.

## Arco da sessão

1. **Conclusão do go-live** (continuação do dia 10): KYC Asaas → `ASAAS_API_KEY` prod na Vercel via clipboard relay → 16/16 envs → merge `v2.0.0`→`main` → deploy Ready.
2. **Smoke test E2E (WhatsApp)**: login → QR escaneado (webhook `connection.update` confirma) → paciente Teste Smoke + agendamento → cron disparado da VPS (`confirmationsSent: 1`) → mensagem no WhatsApp da esposa → respondeu "1".
3. **Bug #1 achado**: resposta "1" ignorada. JID veio sem o 9º dígito (`554197974990` vs `+5541997974990` cadastrado). Fix `brPhoneCandidates`. Reteste → CONFIRMED.
4. **Teste de pagamento real**:
   - Bug #2: chave Pix ausente na conta Asaas → QR `invalid_action`. Resolvido cadastrando chave aleatória.
   - Bug #3: retry de checkout cria assinatura duplicada/órfã no gateway → pagamos a órfã sem querer.
   - Bug #4 (crítico): cliente paga e fica FREE. `externalReference` (`userId:PRO`) vem em `payload.payment.externalReference`, handler só olhava `subscription`/topo. Fix `planTierFromPayload`. Diagnóstico veio da tabela `BillingEvent` de prod.
   - Bug #5: checkout com `User.cpf` null (grandfathered) rejeita assinatura no Asaas. → backlog.
5. **Validação limpa do fix**: criada conta teste 2, signup v2 completo, Pix R$ 3 real pago → **plano virou PRO automaticamente** → redirect `/billing/sucesso` + badge Pro. Fim-a-fim sem intervenção manual.
6. **Unificação de marca**: ConfirmaAí → Clínica Organizada (11 ocorrências, 5 arquivos de src/). Concordância de gênero corrigida (feminino). Reduz combustível do flag Safe Browsing.

## Decisões / descobertas-chave

- **Safe Browsing flag** (tela vermelha de phishing no Chrome) é o bloqueador nº 1 de marketing. Search Console verificado, sem issue central → heurística de tempo real em perfis com Enhanced Safe Browsing. Marca dupla era combustível; unificada.
- **Email de verificação via curl**: o link `GET /api/auth/verify-email?token=` é idempotente-ish e consumível por curl — contorna a tela vermelha do browser pra ativar conta de teste.
- **Lição transversal**: Mock/sandbox passavam em tudo; o teste com Pix de R$ 3 real pagou 5 bugs que só aparecem com tráfego real (shapes de payload, edges de número, estado de conta).

## Patterns documentados (páginas novas/atualizadas)

- `concepts/whatsapp-ninth-digit-jid` (novo)
- `concepts/asaas-external-reference-in-payment` (novo)
- `concepts/claude-chrome-sensitive-domains` (corrigido: prompt aprovável, não bloqueio duro)
- `entities/asaas-integration` (sandbox, PF sem CNPJ, chave Pix no onboarding)

## Estado final

V2 em produção e vendendo. 164/164 vitest, build limpo. Pendências de descanso → ver `synthesis/monetization-v2-state` § snapshot de descanso e `deployment-status.md` § limpeza.

## Pendências (próxima sessão)

1. Cancelar 3 assinaturas de teste no Asaas.
2. Monitorar Safe Browsing pós-unificação.
3. Sprint 8 (resiliência WhatsApp) — recomendado antes de marketing.
4. Backlog Sprint 10: checkout retry duplica assinatura; checkout `User.cpf` null.
