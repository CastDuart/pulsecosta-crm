#!/usr/bin/env bash
# Deploy del frontend CRM (pulsecosta-crm) al VPS.
#
# Corre en local (Mac). Nginx en el VPS sirve desde /opt/pulsecosta/crm/ (raíz),
# NO desde /opt/pulsecosta/crm/dist/. El error del 08/08 fue rsyncar a /crm/dist/
# y que nginx siguiera sirviendo el HTML viejo del /crm/ raíz. Este script hace
# el rsync correcto (contenido de dist/ → /crm/ raíz, preservando dist/ excluida).
#
# Uso:
#   ./scripts/deploy.sh              # git pull, install si hace falta, build, rsync
#   ./scripts/deploy.sh --no-pull    # sin git pull (usar working tree actual)
#   ./scripts/deploy.sh --no-build   # sin build (rsync del dist/ existente)
#   ./scripts/deploy.sh --dry        # solo muestra qué haría rsync

set -euo pipefail

REPO="$HOME/GitHub/pulsecosta-crm"
VPS_HOST="vps-pulse"
VPS_ROOT="/opt/pulsecosta/crm"
DOMAIN="https://crm.pulsecosta.es"

NO_PULL=0; NO_BUILD=0; DRY=0
for arg in "$@"; do
  case "$arg" in
    --no-pull)  NO_PULL=1 ;;
    --no-build) NO_BUILD=1 ;;
    --dry)      DRY=1 ;;
    *) echo "Uso: $0 [--no-pull] [--no-build] [--dry]"; exit 1 ;;
  esac
done

cd "$REPO"

if [[ $NO_PULL -eq 0 ]]; then
  echo "[1/6] git pull en $REPO"
  git pull --ff-only
fi

if [[ $NO_BUILD -eq 0 ]]; then
  # Solo npm install si package.json cambió (más nuevo que node_modules)
  if [[ ! -d node_modules ]] || [[ package.json -nt node_modules/.package-lock.json ]]; then
    echo "[2/6] npm install"
    npm install
  else
    echo "[2/6] node_modules ok — skip npm install"
  fi

  echo "[3/6] npm run build"
  npm run build
else
  echo "[2-3/6] --no-build → uso dist/ existente"
  [[ -f dist/index.html ]] || { echo "FATAL: no hay dist/index.html"; exit 1; }
fi

HASH=$(grep -oE 'index-[a-zA-Z0-9_]+\.js' dist/index.html | head -1)
echo "[4/6] Build hash: $HASH"

STAMP=$(date +%Y%m%d-%H%M%S)
echo "[5/6] Backup remoto pre-deploy → /root/backups/crm-root-$STAMP.tar.gz"
if [[ $DRY -eq 0 ]]; then
  ssh "$VPS_HOST" "tar --exclude='crm/dist' -czf /root/backups/crm-root-$STAMP.tar.gz -C /opt/pulsecosta crm && ls -la /root/backups/crm-root-$STAMP.tar.gz"
fi

echo "[6/6] rsync dist/ → $VPS_HOST:$VPS_ROOT/ (excluyendo dist/)"
if [[ $DRY -eq 1 ]]; then
  rsync -avn --delete --exclude='dist' "$REPO/dist/" "$VPS_HOST:$VPS_ROOT/"
else
  rsync -a --delete --exclude='dist' "$REPO/dist/" "$VPS_HOST:$VPS_ROOT/"
fi

if [[ $DRY -eq 0 ]]; then
  echo
  echo "=== Verificación ==="
  REMOTE_HASH=$(ssh "$VPS_HOST" "grep -oE 'index-[a-zA-Z0-9_]+\\.js' $VPS_ROOT/index.html | head -1")
  echo "Hash en producción: $REMOTE_HASH"

  # No estrictamente necesario para estáticos (nginx los sirve directo),
  # pero garantiza que si el rsync tocó estructura, nginx lo ve al momento.
  ssh "$VPS_HOST" "docker exec nginx nginx -s reload 2>&1 | tail -1"
  if [[ "$REMOTE_HASH" != "$HASH" ]]; then
    echo "⚠️  HASH MISMATCH — algo se sirve desde otro sitio"
    exit 1
  fi
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' "$DOMAIN")
  echo "$DOMAIN → HTTP $CODE"
  [[ "$CODE" == "200" ]] || { echo "⚠️  HTTP no-200"; exit 1; }
  echo "✅ Deploy OK"
  echo
  echo "Rollback: ssh $VPS_HOST 'tar xzf /root/backups/crm-root-$STAMP.tar.gz -C /opt/pulsecosta'"
fi
