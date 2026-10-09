#!/usr/bin/env bash
set -euo pipefail
REF="${1:-HEAD}"
ROOT="$(git rev-parse --show-toplevel)"
POLICY="$ROOT/scripts/public-cloud-boundaries.txt"
found=0
specs=()
while IFS= read -r spec || [ -n "$spec" ]; do
  case "$spec" in ""|\#*) continue ;; esac
  specs+=("$spec")
done < "$POLICY"
cloud_paths="$(git ls-tree -r --name-only "$REF" -- "${specs[@]}")"
if [ -n "$cloud_paths" ]; then
  printf "[BLOCKED] Cloud-only paths present in %s:\n%s\n" "$REF" "$cloud_paths"
  found=1
fi
# Paths are not enough: catch an embedded provider or private repository reference
# in shared runtime/configuration files before a new filename bypasses the list.
if git grep -n -i -E 'sequenzy|tradetally-cloud' "$REF" -- backend/src frontend/src backend/package.json frontend/package.json .env.example backend/.env.example > /dev/null; then
  echo "[BLOCKED] cloud provider/private-repository reference found in public runtime/configuration"
  found=1
fi
if [ "$found" -ne 0 ]; then
  echo "[ERROR] Cloud-only content cannot be pushed to the public repo."
  exit 1
fi
echo "[OK] Public repository boundary check passed for $REF."
