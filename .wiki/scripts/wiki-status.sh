#!/usr/bin/env bash
# wiki-status.sh — SessionStart hook
#
# Emite JSON com hookSpecificOutput.additionalContext informando o LLM sobre:
#   - quantas sessões estão pendentes para ingestão (raw/sessions/*-PENDING.md)
#   - últimas 3 entradas de log.md
#   - contagem de páginas por bucket
#
# Saída: stdout = JSON consumido pelo Claude Code; stderr = ignorado.
# Falhas são silenciosas (exit 0) para nunca bloquear a sessão.

set -uo pipefail

# Localiza a raiz do projeto (assume o script vive em <root>/.wiki/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIKI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Se a wiki não existir ainda, não emitimos contexto.
if [[ ! -d "$WIKI_DIR" ]]; then
  exit 0
fi

# 1. Sessões pendentes
PENDING_DIR="$WIKI_DIR/raw/sessions"
PENDING_COUNT=0
PENDING_LIST=""
if [[ -d "$PENDING_DIR" ]]; then
  while IFS= read -r f; do
    PENDING_COUNT=$((PENDING_COUNT + 1))
    PENDING_LIST="${PENDING_LIST}  - $(basename "$f")\n"
  done < <(find "$PENDING_DIR" -maxdepth 1 -type f -name '*-PENDING.md' 2>/dev/null | sort)
fi

# 2. Últimas 3 entradas do log
LOG_FILE="$WIKI_DIR/log.md"
LAST_LOG=""
if [[ -f "$LOG_FILE" ]]; then
  LAST_LOG=$(grep -E '^## \[' "$LOG_FILE" 2>/dev/null | tail -3 | sed 's/^/  /')
fi

# 3. Contagem por bucket
count_md() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    find "$dir" -maxdepth 1 -type f -name '*.md' ! -name '_*' 2>/dev/null | wc -l | tr -d ' '
  else
    echo 0
  fi
}

ENT=$(count_md "$WIKI_DIR/pages/entities")
CON=$(count_md "$WIKI_DIR/pages/concepts")
SYN=$(count_md "$WIKI_DIR/pages/synthesis")

# Monta o texto que o LLM verá
ACTION_LINE=""
if [[ "$PENDING_COUNT" -gt 0 ]]; then
  ACTION_LINE="ATENÇÃO: há ${PENDING_COUNT} sessão(ões) pendente(s) na wiki. Antes de iniciar a tarefa do usuário, proponha ingestão (passos em .wiki/AGENTS.md → Operação 1)."
fi

CONTEXT=$(cat <<EOF
[WIKI STATUS — .wiki/]
- Pendentes para ingestão: ${PENDING_COUNT}
$(printf "%b" "$PENDING_LIST")
- Páginas: entities=${ENT}, concepts=${CON}, synthesis=${SYN}
- Últimas entradas do log:
${LAST_LOG:-  (log vazio)}

${ACTION_LINE}
Sempre que aprender algo não-óbvio, atualize a wiki conforme .wiki/AGENTS.md.
EOF
)

# Emite JSON via stdout (hook protocol)
# Escapa newlines e aspas para JSON
ESCAPED=$(printf '%s' "$CONTEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":${ESCAPED}}}
EOF

exit 0
