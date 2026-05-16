# Deployment Post-Check

Run this after a staging or production deploy:

```bash
cd backend
POST_CHECK_BASE_URL="https://app.example.com" \
POST_CHECK_TOKEN="$DEPLOYMENT_SMOKE_TOKEN" \
npm run deployment:post-check
```

The command validates:

- migration filenames and checksums, including strict-prefix mode
- fresh database rebuild unless `POST_CHECK_SKIP_FRESH_REBUILD=true`
- live API health
- execution-run creation through the smoke token, or local test-support fixtures when no token is supplied
- PDF report export
- scoped shared-link JSON access
- scoped PDF denial when the share scope excludes PDF
- performance-budget rollups unless `POST_CHECK_SKIP_PERFORMANCE=true`

Optional alert delivery probe:

```bash
POST_CHECK_RUN_ALERT_SMOKE=true \
ALERT_ESCALATION_DELIVERY_ENABLED=true \
ALERT_SMOKE_REQUIRE_TYPES=email,slack,webhook \
npm run deployment:post-check
```
