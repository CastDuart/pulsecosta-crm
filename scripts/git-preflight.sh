#!/usr/bin/env bash
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "${ROOT:-}" ]]; then
  echo "FATAL: no estás dentro de un repo Git"
  exit 2
fi

cd "$ROOT" || exit 2
GIT_DIR=$(git rev-parse --git-dir)
REMOTE=${1:-origin}
REMOTE_URL=$(git remote get-url "$REMOTE" 2>/dev/null || true)
FAILED=0

ok() { echo "OK  $1"; }
warn() { echo "WARN $1"; }
fail() { echo "FAIL $1"; FAILED=1; }

echo "== Git preflight =="
echo "Repo:   $ROOT"
echo "Remote: $REMOTE ${REMOTE_URL:+($REMOTE_URL)}"
echo

if [[ -z "$REMOTE_URL" ]]; then
  fail "No existe el remoto '$REMOTE'"
else
  ok "Remoto configurado"
fi

if [[ -w "$GIT_DIR" ]]; then
  tmp="$GIT_DIR/.codex-write-test.$$"
  if : > "$tmp" 2>/dev/null; then
    rm "$tmp"
    ok ".git es escribible"
  else
    fail ".git parece escribible, pero no permite crear ficheros temporales"
  fi
else
  fail ".git no es escribible; git add/commit/fetch/push puede quedarse a medias"
fi

LOCKS=$(find "$GIT_DIR" -type f -name '*.lock' 2>/dev/null | sort)
if [[ -n "$LOCKS" ]]; then
  fail "Hay locks residuales en .git:"
  echo "$LOCKS"
else
  ok "Sin locks residuales en .git"
fi

if command -v dscacheutil >/dev/null 2>&1; then
  DNS=$(dscacheutil -q host -a name github.com 2>/dev/null | awk '/ip_address:/ {print $2; exit}')
else
  DNS=$(getent hosts github.com 2>/dev/null | awk '{print $1; exit}')
fi

if [[ -n "$DNS" ]]; then
  ok "github.com resuelve ($DNS)"
else
  fail "github.com no resuelve; no hagas push/sync todavía"
fi

if command -v scutil >/dev/null 2>&1; then
  if scutil --dns 2>/dev/null | grep -q 'nameserver'; then
    ok "macOS tiene resolvers DNS activos"
  else
    fail "macOS no expone resolvers DNS activos para esta sesión"
  fi
fi

SSH_OUTPUT=$(ssh -T -o BatchMode=yes -o ConnectTimeout=10 git@github.com 2>&1)
SSH_CODE=$?
if [[ $SSH_CODE -eq 1 && "$SSH_OUTPUT" == Hi\ *successfully\ authenticated* ]]; then
  ok "SSH GitHub autentica (${SSH_OUTPUT})"
elif [[ $SSH_CODE -eq 0 ]]; then
  ok "SSH GitHub respondió"
else
  fail "SSH GitHub falla:"
  echo "$SSH_OUTPUT"
fi

if git ls-remote "$REMOTE" HEAD >/dev/null 2>&1; then
  ok "git ls-remote $REMOTE funciona"
else
  fail "git ls-remote $REMOTE falla"
fi

LOCAL=$(git rev-parse --short HEAD 2>/dev/null || echo '?')
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
echo
echo "HEAD local: $LOCAL"
if [[ -n "$UPSTREAM" ]]; then
  COUNTS=$(git rev-list --left-right --count "$UPSTREAM"...HEAD 2>/dev/null || echo '0 0')
  BEHIND=$(awk '{print $1}' <<< "$COUNTS")
  AHEAD=$(awk '{print $2}' <<< "$COUNTS")
  echo "Upstream:   $UPSTREAM (ahead $AHEAD, behind $BEHIND)"
else
  warn "La rama actual no tiene upstream configurado"
fi

echo
if [[ $FAILED -eq 0 ]]; then
  ok "Preflight verde: puedes hacer fetch/push/sync"
else
  fail "Preflight rojo: corrige lo anterior antes de push/sync"
fi

exit "$FAILED"
