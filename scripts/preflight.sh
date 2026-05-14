#!/usr/bin/env bash
#
# Pre-release preflight checks.
#
# Catches the kinds of issues that fail GitHub Actions on a release tag:
#   - Untracked source files referenced by committed code (today's failure)
#   - Backend test regressions
#   - Frontend build failures (broken imports, type errors, syntax errors)
#
# Run this before tagging a release:
#     ./scripts/preflight.sh
#
# Exits non-zero on the first failure.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "[PREFLIGHT] [ERROR] Not inside a git repository."
  exit 1
fi
cd "$REPO_ROOT"

say() { printf "\n[PREFLIGHT] %s\n" "$1"; }

# 1) Untracked files in source directories.
# Vite / node will happily resolve imports from disk locally, but GitHub
# Actions checks out only the committed tree — so an import that resolves
# locally can fail in CI. Block the release until everything is committed.
say "Checking for untracked files in backend/src and frontend/src..."
UNTRACKED=$(git status --porcelain | awk '$1 == "??" {print $2}' | grep -E '^(backend/src|frontend/src)/' || true)
if [ -n "$UNTRACKED" ]; then
  echo "[PREFLIGHT] [ERROR] Untracked files in source directories:"
  echo "$UNTRACKED" | sed 's/^/  /'
  echo "[PREFLIGHT] Either commit them, delete them, or add to .gitignore before releasing."
  exit 1
fi
echo "[PREFLIGHT] [OK] No untracked source files"

# 2) Backend tests.
say "Running backend tests..."
(
  cd backend
  npm test
)
echo "[PREFLIGHT] [OK] Backend tests passed"

# 3) Frontend build. Vite resolves every import; a broken or missing import
# fails the build the same way CI would.
say "Running frontend build..."
(
  cd frontend
  npm run build
)
echo "[PREFLIGHT] [OK] Frontend build succeeded"

say "[OK] All preflight checks passed — safe to tag a release"
