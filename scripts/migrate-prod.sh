#!/usr/bin/env bash
#
# Aplica migrations pendentes em PRODUÇÃO de forma segura.
#
# Quando usar:
#   - Emergência: deploy foi pra prod com migration pendente (o vercel-build
#     normalmente cobre isso, mas se algo escapou, este é o resgate).
#   - Manual: quando quiser aplicar fora do ciclo de deploy.
#
# Pré-requisito: Vercel CLI logado (`vercel login`) com acesso ao projeto.
#
# O que faz:
#   1. Puxa o env de produção pra um arquivo temporário (no SEU terminal —
#      você tem acesso legítimo; fora do sandbox do agente).
#   2. Resolve a URL de migration: usa DIRECT_URL se existir (recomendado p/
#      Neon — DDL não funciona bem via pooler), senão DATABASE_URL.
#   3. `prisma migrate status` (mostra pendentes) e pede confirmação.
#   4. `prisma migrate deploy` (idempotente — só aplica as pendentes).
#   5. Apaga o env temporário (não deixa segredo no disco).
#
# Uso:
#   ./scripts/migrate-prod.sh
#
set -euo pipefail

TMP_ENV="$(mktemp -t prod-migrate.XXXXXX.env)"
cleanup() { rm -f "$TMP_ENV"; }
trap cleanup EXIT

echo "→ Puxando env de produção (temporário)..."
vercel env pull "$TMP_ENV" --environment=production >/dev/null

# DIRECT_URL é preferível pra DDL (sem pgbouncer). Fallback p/ DATABASE_URL.
MIGRATE_URL="$(grep -oE 'DIRECT_URL="[^"]+"' "$TMP_ENV" | head -1 | sed -E 's/DIRECT_URL="(.*)"/\1/')"
if [ -z "$MIGRATE_URL" ]; then
  MIGRATE_URL="$(grep -oE 'DATABASE_URL="[^"]+"' "$TMP_ENV" | head -1 | sed -E 's/DATABASE_URL="(.*)"/\1/')"
  echo "⚠️  DIRECT_URL não setado no Vercel — usando DATABASE_URL (pooled)."
  echo "    Pra robustez, cadastre DIRECT_URL (conexão direta Neon, sem '-pooler')."
fi
if [ -z "$MIGRATE_URL" ]; then
  echo "❌ Não achei DIRECT_URL nem DATABASE_URL no env de produção. Abortando." >&2
  exit 1
fi

# Mascara host pra log (não vaza credencial)
echo "→ Alvo: $(echo "$MIGRATE_URL" | sed -E 's#//[^@]+@#//<cred>@#' | cut -c1-60)..."

echo
echo "=== STATUS (migrations pendentes) ==="
DATABASE_URL="$MIGRATE_URL" npx prisma migrate status || true

echo
read -r -p "Aplicar as migrations pendentes em PRODUÇÃO? (digite 'sim'): " ans
if [ "$ans" != "sim" ]; then
  echo "Abortado."
  exit 0
fi

echo
echo "=== APLICANDO (prisma migrate deploy) ==="
DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy

echo
echo "✅ Concluído. Verifique login/signup em produção."
