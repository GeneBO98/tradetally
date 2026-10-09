#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
mkdir -p "$SCRATCH/scripts" "$SCRATCH/backend/src/services/brokerSync"
cp "$SOURCE/scripts/check-public-clean.sh" "$SOURCE/scripts/public-cloud-boundaries.txt" "$SCRATCH/scripts/"
cd "$SCRATCH"
git init -q
git config user.name 'Boundary test'
git config user.email 'boundary-test@example.com'
commit() { git add -A; git commit -qm 'test fixture'; }
check() { bash scripts/check-public-clean.sh HEAD >/dev/null; }
blocked() {
  if check; then echo "[ERROR] Expected cloud content to be blocked"; exit 1; fi
}
printf 'module.exports = {};\n' > backend/src/services/brokerSync/webullService.js
printf 'module.exports = {};\n' > backend/src/services/brokerSync/tradovateService.js
printf "const nodemailer = require('nodemailer');\n" > backend/src/services/emailService.js
commit
check

mkdir -p documentation
printf 'Private hosting plan\n' > documentation/AZURE_HOSTING_BLUEPRINT.md
commit
blocked
git rm -q documentation/AZURE_HOSTING_BLUEPRINT.md
commit
check

printf 'module.exports = {};\n' > backend/src/services/trialFeedbackService.js
commit
blocked
git rm -q backend/src/services/trialFeedbackService.js
commit
check

printf "const provider = 'sequenzy';\n" > backend/src/services/newEmailProvider.js
commit
blocked
git rm -q backend/src/services/newEmailProvider.js
commit
check

printf 'APP_REPO=https://github.com/GeneBO98/tradetally-cloud.git\n' > .env.example
commit
blocked
git rm -q .env.example
commit
check
echo '[SUCCESS] Repository boundary regression checks passed.'
