# Wiki — ConfirmaAí

Base de conhecimento pessoal do projeto, mantida pelo LLM, complementar ao `.context/`.

## O que é

Camada de **conhecimento sintetizado e acumulativo**. Diferente de:

- **`.context/`** → verdade operacional por feature (regras, arquivos, fluxos). Mantido sob demanda quando feature muda.
- **memória do usuário** (`~/.claude/.../memory`) → preferências do usuário (cross-projeto).
- **`.wiki/`** → conhecimento que **acumula a cada sessão**: decisões com seu “porquê”, padrões descobertos, sumários cruzados, comparações, lições, contradições resolvidas.

A cada sessão de trabalho, o LLM extrai aprendizados e os integra à wiki — atualizando páginas existentes, criando novas, registrando contradições. O conhecimento **compõe** ao invés de ser redescoberto em cada conversa.

## Estrutura

```
.wiki/
├── AGENTS.md           # Schema/manual operacional do LLM (LEIA ISTO)
├── index.md            # Catálogo de todas as páginas (atualizado a cada ingestão)
├── log.md              # Log cronológico append-only (ingest | query | lint)
├── _TEMPLATE_page.md   # Template para páginas da wiki
├── _TEMPLATE_session.md# Template para entradas raw de sessão
│
├── raw/                # Fontes imutáveis (entrada — LLM lê, não edita)
│   ├── sessions/       # Sumários de sessão (gerados pelo hook SessionEnd)
│   ├── articles/       # Web clips, papers, links externos
│   └── decisions/      # ADRs, decisões arquiteturais brutas
│
├── pages/              # Saída sintetizada (LLM escreve livremente)
│   ├── entities/       # Coisas concretas (libs, serviços, integrações, arquivos-chave)
│   ├── concepts/       # Padrões abstratos, princípios, gotchas
│   └── synthesis/      # Sumários cruzados, comparações, teses evolutivas
│
└── scripts/
    ├── wiki-status.sh  # Hook SessionStart — injeta status no contexto
    └── session-checkpoint.sh # Hook SessionEnd — marca sessão como pendente
```

## Fluxo automático (a cada sessão)

1. **SessionStart**: hook injeta no contexto: contagem de sessões pendentes, últimas entradas do log, índice resumido. Se houver pending, o LLM propõe ingerir antes de começar a tarefa.
2. **Durante a sessão**: LLM consulta `index.md` antes de responder perguntas conceituais e atualiza páginas quando aprende algo novo (regra em `AGENTS.md`).
3. **SessionEnd**: hook escreve `raw/sessions/<timestamp>-PENDING.md` como gatilho. A próxima `SessionStart` verá e proporá ingestão.

Para ingerir manualmente a qualquer momento: `/wiki-ingest`.

## Operações

- **Ingest**: integrar nova fonte (sessão, artigo, decisão) à wiki — atualizando páginas tocadas, índice e log.
- **Query**: responder pergunta consultando primeiro `index.md`, depois drilling em páginas relevantes; resposta valiosa pode virar nova página.
- **Lint**: health-check periódico — contradições, páginas órfãs, links quebrados, conceitos sem página própria.

Ver `AGENTS.md` para o protocolo detalhado.
