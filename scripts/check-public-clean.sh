#!/usr/bin/env bash
#
# check-public-clean.sh — fail if any cloud-only path exists in a git tree.
#
# The PUBLIC repo (origin = github.com/GeneBO98/tradetally) must never contain
# cloud-exclusive code. This script is the single source of truth for "what is
# forbidden on public" and is used by:
#   - githooks/pre-push       (blocks a push to the public remote)
#   - .github/workflows/guard-public-no-cloud.yml (CI alarm on main/develop)
#
# Usage: scripts/check-public-clean.sh [<tree-ish>]   (default: HEAD)
# Exit:  0 = clean, 1 = cloud-only content present.
#
# NOTE: review/trim FORBIDDEN below if a path is legitimately public. The first
# two blocks (Sequenzy, verified-trades) are hard rules per CLAUDE.md and must
# stay.
set -euo pipefail
REF="${1:-HEAD}"

FORBIDDEN=(
  # --- Sequenzy email/marketing (CLAUDE.md: must NOT exist in the public repo) ---
  'backend/src/sequenzy-templates'
  'backend/src/constants/sequenzyTemplates.js'
  'backend/src/services/emailDeliveryService.js'
  'backend/src/services/sequenzyMarketingService.js'
  'backend/src/services/sequenzySubscriberSyncService.js'
  'backend/scripts/send_sequenzy_template_previews.js'
  'backend/scripts/sync_sequenzy_marketing_sequences.js'
  'backend/scripts/sync_sequenzy_subscribers.js'

  # --- Verified trades (tradetally.io exclusive — do not upstream) ---
  'frontend/src/views/VerifyTradeView.vue'
  'backend/src/services/tradeVerificationService.js'
  'backend/src/routes/tradeVerification.routes.js'
  'backend/migrations/900_create_trade_verifications.sql'

  # --- Billing / Stripe (cloud only) ---
  'backend/migrations/203_update_stripe_price_ids.sql'

  # --- Trial-conversion feedback (cloud only) ---
  'backend/src/controllers/trialFeedback.controller.js'
  'backend/src/services/trialFeedbackTokenService.js'
  'backend/src/constants/trialFeedbackOptions.js'
  'backend/migrations/185_preserve_trial_history.sql'

  # --- Demo automation / metering / experiments (cloud only) ---
  'backend/src/services/demoTradeActivityScheduler.js'
  'backend/src/services/finnhubUsageMetricsService.js'
  'backend/migrations/187_create_active_user_requests.sql'
  'backend/migrations/190_create_experiment_exposures.sql'
  'backend/src/routes/experiments.routes.js'
  'backend/migrations/204_create_finnhub_usage_minute_metrics.sql'
  'backend/migrations/205_reconcile_finnhub_usage_minute_metrics.sql'

  # --- Cloud marketing / SEO surface (deliberately removed from self-host) ---
  'frontend/src/views/HomeView.vue'
  'frontend/src/views/PricingView.vue'
  'frontend/src/views/FeaturesView.vue'
  'frontend/src/views/FAQView.vue'
  'frontend/src/views/ComparisonView.vue'
  'frontend/src/views/CompareTradeZellaView.vue'
  'frontend/src/views/CompareTraderVueView.vue'
  'frontend/src/views/RevengeTradingView.vue'
  'frontend/src/views/TradingPsychologyJournalView.vue'
  'frontend/src/views/tools'
  'frontend/src/components/tools'
)

found=0
for p in "${FORBIDDEN[@]}"; do
  if [ -n "$(git ls-tree -r --name-only "$REF" -- "$p" 2>/dev/null)" ]; then
    echo "[BLOCKED] cloud-only path present on public tree ($REF): $p"
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo ""
  echo "ERROR: refusing — cloud-only content must not be on the public repo (origin)."
  echo "If a path above is legitimately public, remove it from FORBIDDEN in this script."
  exit 1
fi

echo "[OK] no cloud-only paths present in $REF."
