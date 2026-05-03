#!/usr/bin/env bash
# session-checkpoint.sh — SessionEnd hook
#
# Cria um arquivo .wiki/raw/sessions/<timestamp>-PENDING.md com metadados
# mínimos (data, branch, arquivos modificados). O conteúdo será expandido na
# próxima ingestão (ver .wiki/AGENTS.md → Operação 1).
#
# Falhas são silenciosas — nunca bloqueia o fim da sessão.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIKI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$WIKI_DIR/.." && pwd)"

SESSIONS_DIR="$WIKI_DIR/raw/sessions"
mkdir -p "$SESSIONS_DIR" 2>/dev/null || exit 0

TS=$(date '+%Y-%m-%d-%H%M')
DATE_HUMAN=$(date '+%Y-%m-%d %H:%M')
OUT="$SESSIONS_DIR/${TS}-PENDING.md"

# Branch atual (se for um repo git)
BRANCH=""
if git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
fi

# Arquivos modificados desde o último commit (status simples)
CHANGED=""
if [[ -n "$BRANCH" ]]; then
  CHANGED=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null \
              | awk '{print "  - " $2}' \
              | head -30)
fi

# Não cria arquivo vazio se não houver nada — sessão sem mudanças não precisa
# virar pendência. Ajustável: comente o bloco abaixo se quiser sempre marcar.
if [[ -z "$CHANGED" ]]; then
  exit 0
fi

cat > "$OUT" <<EOF
---
type: session
date: ${DATE_HUMAN}
branch: ${BRANCH}
status: pending
files_touched:
$(printf '%s\n' "$CHANGED" | sed 's/^  - /  - /')
---

# Sessão ${TS} — (preencher na ingestão)

## Objetivo da sessão

(a preencher pelo LLM ao ingerir)

## Resultado

(a preencher pelo LLM ao ingerir)

## Decisões / aprendizados

(a preencher pelo LLM ao ingerir)

## Para ingerir na wiki

- [ ] (a preencher)

## Arquivos modificados (snapshot do hook)

${CHANGED}
EOF

exit 0
