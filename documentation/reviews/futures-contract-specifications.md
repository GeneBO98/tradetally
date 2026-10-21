# Futures point values and import repair — October 21, 2026

`backend/src/utils/futuresUtils.js` contains dollars per quoted price point per
contract, plus the minimum outright tick. Unknown roots return `null`. CSV
diagnostics reject unresolved futures, and the canonical P&L engine requires
a positive, finite multiplier. Broker-provided multipliers remain authoritative.

## Exchange sources

Verified against the exchange publications on October 21, 2026:

- [CME E-nano specifications](https://www.cmegroup.com/articles/faqs/faq-e-nano-equity-index-futures.html):
  NES 0.50, NNQ 0.20, N2K 0.50, NDOW 0.05 dollars per index point.
- [CME Micro Bitcoin specifications](https://www.cmegroup.com/content/dam/cmegroup/education/files/getting-started-with-micro-bitcoin-futures.pdf)
  and [Micro Ether FAQ](https://www.cmegroup.com/articles/2021/micro-ether-futures-frequently-asked-questions.html):
  MBT and MET each represent 0.1 underlying units; full-sized BTC and ETH
  represent 5 and 50 respectively.
- [CME Micro Metals table](https://www.cmegroup.com/markets/microsuite/metals.html):
  MHG 2,500 pounds, MGC 10 ounces, SIL 1,000 ounces, PAM 10 ounces.
  PL and PA use 50 and 100 ounces respectively;
  see the [CME metals product guide](https://www.cmegroup.com/trading/metals/files/metals-product-guide.pdf).
- [Cboe VX specifications](https://www.cboe.com/tradable-products/vix/vix-futures/specifications)
  and [VXM specifications](https://cdn.cboe.com/resources/futures/VXM_Contract_Specifications.pdf):
  1,000 and 100 dollars per index point respectively.
- [CME FX product guide](https://www.cmegroup.com/markets/fx/fx-product-guide):
  standard USD-quoted majors and micro FX contract sizes and outright ticks.
  Numeric-leading roots such as `6E` require futures symbol parsing too.
  Migration 912 widens tick-size storage in trades and instrument templates to
  ten decimal places so JPY ticks are not rounded by the database. It preserves
  the dependent health view and materialized aggregate, their actual definitions,
  owners, permissions, comments, options and indexes. Unexpected downstream
  dependencies abort the transaction without cascading drops.
- [CME agricultural contracts](https://www.cmegroup.com/markets/agriculture)
  and [Micro Ag specifications](https://www.cmegroup.com/markets/agriculture/micro-ag-futures):
  grain and soybean-oil prices use cents, so their point values divide physical
  contract size by 100. Soybean meal uses dollars per short ton. Micro Ag
  sizes are one tenth of the standard contracts, with different tick sizes.
  Livestock contracts quoted in cents use 400 (HE/LE) and 500 (GF).
- [CME 1-Ounce Gold](https://www.cmegroup.com/education/lessons/1-ounce-gold-futures-product-overview):
  `1OZ` uses one dollar per price point and a 0.25 tick.
- [CQG symbol metadata](https://help.cqg.com/apihelp/Documents/symbolbrowsingscenarios.htm)
  and [CQG Data Factory examples](https://www.cqgdatafactory.com/docs/CQGDataFactory_FAQ.pdf):
  `ENQ` maps to NQ and `EP` maps to ES, preserving their 20 and 50 point values.

Quote units are essential. An IBKR export may quote agricultural prices in
dollars and supply a multiplier such as 5,000 for ZC. Preserve that explicit
multiplier; do not overwrite it with the exchange-cent convention of 50.
The same caution applies to custom instruments, CFDs, native currencies,
manually edited records, and symbols that collide with stock tickers.

## Reproduced defects

Tradovate's Fills export lacked the Orders export's `Status` field and fell
back to generic parsing. Missing MBT metadata became a $50 multiplier. Generic
execution costs also copied commission into fees, doubling costs when the
canonical P&L engine persisted the trade. Custom mappings with only a fees
column had the same duplication. Target-analysis heuristics independently
assumed every micro was $5 and every E-mini was $50 per point.

Fills now use the Tradovate parser with fill IDs, partial fills, inactive-fill
filtering and reversal cost allocation. Recognized zero-result files do not
fall back to a parser that bypasses their filtering. Cash History receives
an explanation that executions are needed. Generic commissions and fees
remain separate through persistence. Financial previews require a multiplier
instead of substituting one dollar.

## Existing data

Run `backend/scripts/audit_futures_multipliers.js` for a read-only candidate report. A mismatch requires review of broker quote units, explicit multipliers and manual edits before any repair.

`backend/scripts/repair_futures_import.js` defaults to a database-enforced read-only dry run for one username and import ID. It requires verified Tradovate import provenance, retained executions and unedited USD economics. Commission repairs additionally require a verified generic fallback and a commission-only source; directly recognized imports preserve their allocated costs. Unknown contracts and unexplained multipliers are skipped.

Apply mode requires an absolute path for a private, durable backup. Each selected import is repaired in one serializable transaction. Repeated runs are idempotent. Multiplier changes clear invalid dollar excursions for recomputation. The script deletes the database analytics cache; operators must also invalidate the running application memory cache before showing repaired totals.

## Validation

Regression coverage includes contract metadata, unknown multipliers, Tradovate Fills and Orders imports, partial fills, reversals, inactive fills, legitimate fees, prorated commissions, repair idempotence and frontend dollar calculations. PostgreSQL integration tests check tick precision, dependent relation metadata preservation and rollback on unexpected dependencies.
