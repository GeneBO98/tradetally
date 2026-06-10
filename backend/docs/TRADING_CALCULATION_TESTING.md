# Trading Calculation Regression Tests

Trading-core calculations are release-blocking. Any change that touches P&L,
commissions, fees, import mapping, broker sync, analytics SQL, trade filters, or
R-value logic must add or update a fixture in:

`tests/fixtures/trading-calculation-contracts.json`

The fixture is shared by backend Jest tests and frontend Vitest tests so stored
trade values, analytics totals, and displayed gross/net P&L stay aligned.

Before merging calculation changes, run:

```bash
pnpm --dir backend test
pnpm --dir frontend test:run
```

These commands also run in GitHub Actions on pull requests and on `develop` /
`main` pushes before Docker images are built.

## Real-Postgres integration suite

The unit suites mock the database, so SQL semantics are only verified by the
opt-in integration suite in `backend/tests/integration/`. It runs the real
Express app and real migrations against a scratch database and covers the CSV
import pipeline end to end plus `TradeQueries.getAnalytics` (including the
whole-trade position grouping mode).

```bash
docker run -d --name tradetally-test-pg -p 5440:5432 \
  -e POSTGRES_USER=tradetally -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=tradetally_test postgres:16-alpine

TEST_DATABASE_URL=postgres://tradetally:testpass@localhost:5440/tradetally_test \
  pnpm --dir backend test:integration
```

CI runs this automatically with a Postgres service container. Never point
`TEST_DATABASE_URL` at a real database.
