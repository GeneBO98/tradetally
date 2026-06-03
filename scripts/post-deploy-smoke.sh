#!/bin/bash
#
# Post-deploy smoke test. Fails (non-zero exit) if the deploy is not actually
# healthy, so deploy-native.sh aborts loudly instead of "succeeding" on a
# broken state. Catches the three incidents we hit:
#   - stale code running (commit mismatch)
#   - public page showing login instead of the marketing page
#   - API/backend down
#
# Usage: ./post-deploy-smoke.sh [expected_commit_sha]
# Env:   PUBLIC_URL (default https://tradetally.io)
#        BACKEND_URL (default http://localhost:3000)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_URL="${PUBLIC_URL:-https://tradetally.io}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
EXPECTED_SHA="${1:-$(git -C "$SCRIPT_DIR/.." rev-parse --short HEAD 2>/dev/null || echo '')}"

fails=0
pass() { echo "  [OK]   $1"; }
fail() { echo "  [FAIL] $1" >&2; fails=$((fails + 1)); }

echo "[SMOKE] PUBLIC_URL=$PUBLIC_URL BACKEND_URL=$BACKEND_URL expected_commit=${EXPECTED_SHA:-<unknown>}"

# 1. Backend health: 200, status not ERROR, and running the deployed commit
health="$(curl -fsS --max-time 15 "$BACKEND_URL/api/health" 2>/dev/null)"
if [ -z "$health" ]; then
  fail "backend /api/health did not respond"
else
  status="$(printf '%s' "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)"
  commit="$(printf '%s' "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('commit',''))" 2>/dev/null)"
  stale="$(printf '%s' "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('services',{}).get('finnhubMetrics',{}).get('stale',''))" 2>/dev/null)"
  [ "$status" = "ERROR" ] && fail "health status is ERROR" || pass "health status: ${status:-?}"
  if [ -n "$EXPECTED_SHA" ] && [ -n "$commit" ] && [ "$commit" != "unknown" ]; then
    [ "$commit" = "$EXPECTED_SHA" ] && pass "running deployed commit ($commit)" \
      || fail "STALE CODE: running $commit, deployed $EXPECTED_SHA"
  fi
  [ "$stale" = "True" ] && fail "finnhubMetrics.stale=true (metrics not flowing during market hours)" \
    || pass "finnhub metrics not stale"
fi

# 2. Public homepage is the marketing page, not the login screen
home="$(curl -fsS --max-time 20 "$PUBLIC_URL/" 2>/dev/null)"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$PUBLIC_URL/" 2>/dev/null)"
[ "$code" = "200" ] && pass "homepage HTTP 200" || fail "homepage HTTP $code"
if printf '%s' "$home" | grep -qiE "behavioral analytics|revenge trading|get started"; then
  pass "homepage shows marketing content"
else
  fail "homepage missing marketing markers (regressed to login page?)"
fi

# 3. API is alive (register validates -> 400 on empty body, not 5xx)
reg="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$PUBLIC_URL/api/auth/register" -H 'Content-Type: application/json' -d '{}' 2>/dev/null)"
[ "$reg" = "400" ] && pass "register endpoint validating (400)" || fail "register endpoint HTTP $reg (expected 400)"

if [ "$fails" -gt 0 ]; then
  echo "[SMOKE] FAILED with $fails problem(s)." >&2
  exit 1
fi
echo "[SMOKE] All checks passed."
