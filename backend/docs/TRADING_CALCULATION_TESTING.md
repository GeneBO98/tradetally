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
