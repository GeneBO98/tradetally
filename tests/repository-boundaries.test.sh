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
# Apple's public trust anchor and shared verification tests are safe to ship.
mkdir -p backend/src/certs backend/tests/utils
printf 'Public Apple root certificate fixture\n' > backend/src/certs/apple-root-ca-g3.pem
printf 'Shared Apple verification test fixture\n' > backend/tests/utils/appleIapVerification.test.js
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
# Known cloud paths and providers hidden in shared files must both be blocked.
for cloud_path in backend/src/services/newsClassificationService.js backend/src/services/positionNewsService.js backend/migrations/914_create_news_classification_cache.sql; do
  mkdir -p "$(dirname "$cloud_path")"
  printf 'Private news classification\n' > "$cloud_path"
  commit
  blocked
  git rm -q "$cloud_path"
  commit
  check
done

printf "const endpoint = 'https://api.typesafe.ai/v1/systemone';\n" > backend/src/services/anotherProvider.js
commit
blocked
git rm -q backend/src/services/anotherProvider.js
commit
check

printf "const sdk = require('@typesafe-ai/sdk');\n" > backend/src/services/anotherSdk.js
commit
blocked
git rm -q backend/src/services/anotherSdk.js
commit
check

printf 'TYPESAFE_API_KEY=\n' > .env.example.native
commit
blocked
git rm -q .env.example.native
commit
check

mkdir -p backend/migrations
printf 'CREATE TABLE news_classification_cache (cache_key text);\n' > backend/migrations/999_other_name.sql
commit
blocked
git rm -q backend/migrations/999_other_name.sql
commit
check
echo '[SUCCESS] Repository boundary regression checks passed.'
