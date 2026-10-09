# v2.10.0 release review — September 8, 2026

Reviewed all four open GitHub issues against their descriptions, owner scope comments, implementation, and regression coverage. Combined origin/main (3076b214) with origin/develop (69873886) in an isolated checkout. Existing uncommitted news-notification and portfolio-preference work was excluded.

| Issue | Finding |
| --- | --- |
| #401 REST retry duplicates | Implemented. Transaction-scoped advisory locks and persisted trade identity protect concurrent retries. Real HTTP/PostgreSQL tests cover changed idempotency keys, overlapping batches, normalization, open trades, zero-price exits, and distinct accounts/contracts. Existing duplicate history is not cleaned up. |
| #384 Futures MAE/MFE and Databento | Implemented. Regression tests cover ESU6/MESU6, Databento request encoding/scaling and priority, provider errors, Yahoo-disabled behavior, and futures excursion fallbacks. Compose and environment templates expose both settings. Live provider credentials were not tested. |
| #390 Portfolio allocations | Proportional v1 is implemented, consistent with the owner's scope comment. Quantity inputs become ratios; fixed per-exit/FIFO allocation and cost-basis/unrealized-P&L reports are not implemented. Keep the broader request open. |
| #403 Account archiving | Not implemented. Account models, APIs, and reports do not expose account archival/report-exclusion controls. Keep open; excluded from release scope. |

## Bugs found and corrected

- The combined dashboard referenced `currencyCode` without obtaining it from the currency composable. The existing mounted-dashboard regression test caught a render exception. Added the missing binding.
- Two simultaneous allocations of a previously unallocated trade could each insert a valid 100% split and leave a combined 200% allocation. Reproduced against PostgreSQL with a delayed-insert test. Single replacements and clears now lock the parent trade in their transactions; bulk replacements use a consistent lock order. Added database coverage for concurrency, edits, account-filtered reports, archive history, and clearing.
- Resolved merge conflicts by preserving widget article URLs and both trade-allocation and symbol-metadata functionality.

## Validation

- Backend: 207 suites, 1,592 tests passed.
- Frontend: 39 files, 216 tests passed.
- PostgreSQL 16: all migrations and 8 integration suites / 23 tests passed against an isolated scratch database.
- Frontend production build passed with version 2.10.0.
- No Sequenzy references found in backend/src or environment templates.
- Unmerged pull requests #399 and #365 were not included.

The existing dashboard test failed before the currency binding fix, and the new allocation concurrency test failed before locking was added (four saved allocation rows instead of two).
