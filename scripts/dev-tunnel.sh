#!/usr/bin/env bash
#
# dev-tunnel.sh — túnel público para o dev server + webhook sandbox Asaas.
#
# O que faz:
#   1. Sobe `cloudflared tunnel --url http://localhost:3000` (URL aleatória trycloudflare.com).
#   2. Registra/atualiza o webhook "confirmaai-dev-tunnel" na SANDBOX Asaas apontando
#      para https://<tunel>/api/billing/webhook, com authToken = ASAAS_WEBHOOK_SECRET do .env.
#   3. Ao sair (Ctrl+C), desabilita o webhook na sandbox (evita fila pausada por entregas
#      falhando contra um túnel morto) e derruba o cloudflared.
#
# Uso:
#   ./scripts/dev-tunnel.sh           # porta 3000 (default)
#   PORT=3001 ./scripts/dev-tunnel.sh
#
# Pré-requisitos: cloudflared, jq, .env com ASAAS_API_URL (sandbox), ASAAS_API_KEY,
# ASAAS_WEBHOOK_SECRET. O dev server (npm run dev) roda separado.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
PORT="${PORT:-3000}"
WEBHOOK_NAME="confirmaai-dev-tunnel"
WEBHOOK_EMAIL="rhonner.matheus@gmail.com"

for bin in cloudflared jq curl; do
  command -v "$bin" >/dev/null || { echo "ERRO: '$bin' não encontrado no PATH." >&2; exit 1; }
done
[ -f "$ENV_FILE" ] || { echo "ERRO: $ENV_FILE não existe." >&2; exit 1; }

# Lê var do .env sem expandir nada (chaves Asaas têm '$' no valor).
# Remove aspas e o escape "\$" exigido pelo loader do Next (ver comentário no .env).
env_var() {
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//" -e 's/^\\\$/$/'
}

ASAAS_API_URL="$(env_var ASAAS_API_URL)"
ASAAS_API_KEY="$(env_var ASAAS_API_KEY)"
ASAAS_WEBHOOK_SECRET="$(env_var ASAAS_WEBHOOK_SECRET)"

[ -n "$ASAAS_API_KEY" ] || { echo "ERRO: ASAAS_API_KEY ausente no .env." >&2; exit 1; }
[ -n "$ASAAS_WEBHOOK_SECRET" ] || { echo "ERRO: ASAAS_WEBHOOK_SECRET ausente no .env." >&2; exit 1; }

# Trava de segurança: este script só fala com a SANDBOX. Nunca tocar webhook de produção.
case "$ASAAS_API_URL" in
  *sandbox.asaas.com*) ;;
  *) echo "ERRO: ASAAS_API_URL não é sandbox ($ASAAS_API_URL). Abortando." >&2; exit 1 ;;
esac

asaas() { # asaas <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  curl -sS -X "$method" "${ASAAS_API_URL}${path}" \
    -H "access_token: ${ASAAS_API_KEY}" \
    -H "Content-Type: application/json" \
    ${body:+-d "$body"}
}

CLOUDFLARED_LOG="$(mktemp -t dev-tunnel-cloudflared)"
WEBHOOK_ID=""

cleanup() {
  echo
  if [ -n "$WEBHOOK_ID" ]; then
    echo "→ Desabilitando webhook sandbox ($WEBHOOK_ID)..."
    asaas PUT "/webhooks/${WEBHOOK_ID}" '{"enabled": false}' >/dev/null || true
  fi
  if [ -n "${CLOUDFLARED_PID:-}" ] && kill -0 "$CLOUDFLARED_PID" 2>/dev/null; then
    kill "$CLOUDFLARED_PID" 2>/dev/null || true
  fi
  echo "✓ Túnel encerrado."
}
trap cleanup EXIT INT TERM

echo "→ Subindo cloudflared (localhost:${PORT})..."
cloudflared tunnel --url "http://localhost:${PORT}" >"$CLOUDFLARED_LOG" 2>&1 &
CLOUDFLARED_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | head -1 || true)"
  [ -n "$TUNNEL_URL" ] && break
  kill -0 "$CLOUDFLARED_PID" 2>/dev/null || { echo "ERRO: cloudflared morreu. Log:" >&2; cat "$CLOUDFLARED_LOG" >&2; exit 1; }
  sleep 1
done
[ -n "$TUNNEL_URL" ] || { echo "ERRO: URL do túnel não apareceu em 30s. Log:" >&2; cat "$CLOUDFLARED_LOG" >&2; exit 1; }

WEBHOOK_URL="${TUNNEL_URL}/api/billing/webhook"
echo "✓ Túnel: $TUNNEL_URL"

# Upsert do webhook: reusa o registro por nome, senão cria.
EXISTING_ID="$(asaas GET "/webhooks" | jq -r --arg n "$WEBHOOK_NAME" '.data[]? | select(.name == $n) | .id' | head -1)"

WEBHOOK_BODY="$(jq -n \
  --arg name "$WEBHOOK_NAME" \
  --arg url "$WEBHOOK_URL" \
  --arg email "$WEBHOOK_EMAIL" \
  --arg token "$ASAAS_WEBHOOK_SECRET" \
  '{
    name: $name,
    url: $url,
    email: $email,
    enabled: true,
    interrupted: false,
    authToken: $token,
    sendType: "SEQUENTIALLY",
    events: [
      "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED", "PAYMENT_REFUNDED",
      "PAYMENT_ANTICIPATED", "PAYMENT_AUTHORIZED",
      "PAYMENT_AWAITING_RISK_ANALYSIS", "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
      "PAYMENT_REPROVED_BY_RISK_ANALYSIS", "PAYMENT_RECEIVED_IN_CASH_UNDONE",
      "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE",
      "PAYMENT_AWAITING_CHARGEBACK_REVERSAL", "PAYMENT_DUNNING_RECEIVED",
      "PAYMENT_DUNNING_REQUESTED", "PAYMENT_BANK_SLIP_VIEWED", "PAYMENT_CHECKOUT_VIEWED"
    ]
  }')"

if [ -n "$EXISTING_ID" ]; then
  echo "→ Atualizando webhook existente ($EXISTING_ID)..."
  RESPONSE="$(asaas PUT "/webhooks/${EXISTING_ID}" "$WEBHOOK_BODY")"
else
  echo "→ Criando webhook na sandbox..."
  RESPONSE="$(asaas POST "/webhooks" "$WEBHOOK_BODY")"
fi

WEBHOOK_ID="$(echo "$RESPONSE" | jq -r '.id // empty')"
if [ -z "$WEBHOOK_ID" ]; then
  echo "ERRO: falha ao registrar webhook. Resposta:" >&2
  echo "$RESPONSE" | jq . >&2 || echo "$RESPONSE" >&2
  exit 1
fi

echo "✓ Webhook sandbox ativo: $WEBHOOK_URL (id: $WEBHOOK_ID)"
echo
echo "Pronto. Fluxo: checkout local → pagar/confirmar na sandbox → webhook chega aqui."
echo "Ctrl+C encerra o túnel e desabilita o webhook na sandbox."
echo

wait "$CLOUDFLARED_PID"
