# CSV import failure review — September 7, 2026

Source: [TradeTally analytics](https://analytics.tradetally.io/analytics), inspected September 7, 2026.

## Scope and evidence

Reviewed all 62 entries in the Unknown CSV Headers table dated within the dashboard's 30-day window, August 8–September 7, 2026. Expanded every entry to inspect its saved header, sample rows, and diagnostic JSON. The table itself is paginated across all dates; only the first 62 entries were in scope. There were 32 distinct header strings.

The dashboard's separate recovery summary reported 17 users with failures, nine later succeeding and eight not yet recovered. These user counts and the 62 diagnostic entries measure different things: retries and multiple reports can generate several flags for one user.

Samples generally contain only the first five rows. Full uploaded files, existing positions and execution history at import time were not available. No production database records were changed. Regression fixtures use synthetic examples reflecting the observed formats, without customer account identifiers.

## Implemented fixes

These patterns appeared in 28 of the 62 flagged entries. This is the scope of the fixes, **not a verified count of recovered uploads**. Complete files may contain additional unsupported rows.

| Pattern | Flags | Change |
| --- | ---: | --- |
| Webull `USD$` price prefix | 7 | Parse the price without treating `USD` as a number; preserve fractional precision. |
| Webull monthly statement title before the actual header | 4 | Start the flat report at the detected trade header. |
| Schwab transactions selected as E*TRADE | 3 | Recognize the specific conflicting signature and use the Schwab parser, with a diagnostic warning. |
| Schwab realized lot details selected as E*TRADE | 3 | Use Schwab parsing and skip report titles after extracting account metadata. |
| Generic executions selected as Webull | 2 | Recognize date/symbol/side/quantity/price fields and use generic parsing for this narrow mismatch. |
| Converted completed trades selected as ThinkorSwim | 1 | Recognize the explicit entry/exit field signature and use generic parsing. |
| Generic executions selected as Tradovate | 1 | Recognize the flat execution signature and use generic parsing. |
| Tradovate fills selected as TradingView | 1 | Use the Tradovate parser; retain the optional commission column rather than assuming zero cost. |
| TradingView trade history with entry/exit rows | 2 | Pair by account, symbol and trade number; preserve fractional size and reported net P&L; count repeated commission once. |
| Generic `Timestamp` or `Closing Time` execution date | 2 | Accept these aliases for the trade date as well as execution time. |
| IBKR compact timestamp with `EDT` suffix | 1 | Extract the calendar date from the compact timestamp while retaining the explicit timezone on execution time. |
| ThinkorSwim account trade-history table selected as ThinkorSwim cash activity | 1 | Route the distinctive `Exec Time`/`Spread`/`Pos Effect` signature to the existing paperMoney parser. |

Webull also stored some skip reasons as named properties on an array. JSON serialization discarded those properties, explaining empty reason breakdowns despite thousands of rejected rows. Reasons now use the diagnostic row-object array format.

TradingView history support requires one matching entry and exit per trade number, valid prices and timestamps, matching quantities and direction, and a currency-denominated Net PnL column. Incomplete or split groups are rejected with an explicit reason instead of inventing missing fills. Saved mappings remain authoritative for this newly recognized format.

## Remaining entries

| Category | Flags | Disposition |
| --- | ---: | --- |
| Sell-only semicolon-delimited executions | 5 | Diagnostics explicitly require manual review because no opening buy or existing position matched. Do not assume these are new shorts. The broad IBKR detection also deserves a separate format-specific review; execution fees must be handled when adding dedicated support. |
| Webull/Tradovate zero-result imports with no invalid rows | 4 | Samples contain valid fills, but diagnostics do not establish the cause. Duplicate filtering or prior position state may matter. Full files and import-time execution context are needed to reproduce. |
| TradingView activity/journal logs, including one headerless log | 5 | Logs mix executions, submissions, modifications, failures and cancellations. Execution messages can omit direction. Require a dedicated order-event reconstruction parser or export trade history. |
| TradingView balance history with action text | 2 | Contains exit information but lacks original entry timestamps. Prefer complete trade history; do not invent entry times. |
| Working orders only | 2 | Correctly excluded: neither order was filled. |
| Balance/account summaries and position snapshot | 5 | Two account-summary flags, one balance-only history, one Tradovate account balance and one open-position snapshot. These do not provide complete trade execution data. |
| Deals report with closing time, lot quantities and no entry time | 3 | Title recovery alone is insufficient. Needs explicit instrument/lot semantics and an entry-time policy; avoid fabricating a completed trade. |
| Schwab aggregate realized report without opened date | 3 | Export lot details instead; aggregate rows omit the opening date. |
| `effective_date`/`unit_price` account activity | 1 | Needs dedicated mapping, including options priced per contract, signed quantities, activity subtype and currency. A generic price alias could multiply option P&L by 100 incorrectly. |
| Quantower/CQG-style futures executions | 1 | Misclassified by broad IBKR header detection. Needs explicit futures symbol/multiplier handling (for example ENQ), plus a regression using a complete opening/closing sequence. |
| Prediction-market realized P&L report | 1 | Needs instrument support for yes/no contracts, zero settlement prices, fractional quantities and long market identifiers. Generic stock parsing is unsuitable. |
| DAS export with times but no date | 1 | Add a Date column or use a filename containing the actual single trade date. Do not substitute the upload date. |
| Synthetic IBKR fixture failing futures DB constraint | 1 | A synthetic future lacked required contract metadata. Separate from a CSV syntax failure; do not bypass the database constraint. |

## Verification

Regression cases are in `tests/fixtures/trading-calculation-contracts.json`, consumed by `backend/tests/utils/csvParser.recentFailures.test.js`. Assertions cover trade count, direction, quantity, prices, P&L, commissions, timestamp handling and relevant rejection behavior. Existing parser tests also verify account extraction remains intact.

Validation completed: all 1,504 backend tests across 202 suites and all 151 frontend tests across 34 files passed. The new regression file contains 22 passing tests. `git diff --check` also passed. Tests use mocked database access; the real-Postgres integration suite was not run.

Commands used:

```sh
pnpm --dir backend exec jest --runInBand
pnpm --dir frontend test:run
```

These changes are local and have not been deployed. Production recovery must be verified against full exports after release; existing failed imports are not automatically reprocessed.
