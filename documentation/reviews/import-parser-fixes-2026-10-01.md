# Import parser review — October 1, 2026

## Evidence

Reviewed 27 saved diagnostic entries from September 23 through October 1,
including retained headers, five-row samples, rejection reasons, and import
logs. Customer data was accessed with read-only transactions. Fixtures use
synthetic identifiers; full original uploads were unavailable.

## Parser fixes

- TradingView order exports now recognize `Status time` and use `Fill quantity`
  ahead of requested quantity. Zero executed quantity and unfilled orders are
  excluded. `F.US.MNQZ26` retains futures metadata and its $2 point value.
- The edited transaction layout containing `Ticker Action`, `Companu`, `Comm`,
  and `Total Amt` is normalized only when its full signature matches. It uses
  US calendar dates and converts readable option contracts to OCC symbols.
  Saved custom column mappings retain priority for this layout.
- Generic execution matching applies option contract sizes to net P&L and
  attaches option metadata before trade grouping can recalculate values.
- TradingView index CFD symbols such as `BLACKBULL:NAS100` and
  `BLACKBULL:SPX500` no longer acquire futures metadata or a default futures
  multiplier merely because their symbols contain digits.
- Already-imported TradingView executions are counted in diagnostics and
  receive an explanatory summary. The newest zero-result TradingView sample
  matched an execution already stored in the account.
- Delta order history recognizes its full header signature, removes descriptive
  timezone suffixes while preserving numeric offsets, and matches executed
  orders with their fees. BTCUSD and ETHUSD contract counts become underlying
  crypto units (0.001 BTC and 0.01 ETH per contract), with an order-notional
  consistency check. The observed BTC round trip has gross P&L $0.2105 and
  net P&L $0.15044862, rather than the generic parser's $210.50 gross result.
  The dedicated format also recovers the observed generic mapping that treated
  per-order realized P&L as a completed trade and disabled the header row.

Delta sizing was checked against the [official contract-size documentation](https://www.delta.exchange/support/solutions?articleId=80001177912).

## Other diagnostic entries and limits

The timestamp `2026-09-2204:15:01` is already supported on cloud main; this
change adds regression coverage and ports that fix to public main. Public main
also receives the report classification needed to explain activity logs,
balance reports, and position snapshots.

Account limits, MetaTrader network logs, and a risk reference document cannot
be recovered as trade executions by changing the parser. TradingView balance
and activity reports omit opening execution data and remain unsupported as
complete trades. Delta partial fills require its Trade History export; unknown
contract sizes or inconsistent notionals are rejected with explicit reasons.

These changes affect future imports. They do not replay failed uploads or
repair existing saved trades with incorrect instrument metadata or quantities.
Full-file recovery remains unverified.

## Validation

The regression suite covers the observed layouts, long/short option P&L,
option grouping, unfilled orders, zero fill quantity, duplicate executions,
CFD classification, Delta sizing and fees, numeric timezone offsets, unsupported
Delta rows, and saved mapping precedence. Canonical persistence-engine P&L
is checked for the CFD and Delta cases.

Both repository implementations are validated independently with their backend
test suite, frontend production build, and `git diff --check`. Tests mock
database access; the real-Postgres integration suite was not run.
