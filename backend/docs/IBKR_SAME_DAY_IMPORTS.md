# IBKR same-day imports and Activity reconciliation

TradeTally accepts one Flex Web Service token, a required Activity Flex Query ID,
and an optional Trade Confirmation Flex Query ID. Existing Activity-only connections
continue to work. This integration downloads reports; it does not require TWS or
Client Portal trading-session authentication.

## Setup

1. Keep your existing Activity query with Trades at **Executions** detail and Open
   Positions. Do not replace its ID with a confirmation query's ID.
2. In IBKR Portal, open **Reporting > Flex Queries** (or **Performance & Reports >
   Flex Queries**) and create a separate **Trade Confirmation Flex Query**.
3. Select **Executions** detail, XML or CSV output, and intraday coverage. Select
   Today when available. IBKR's July 27, 2026 setup guide lists several historical
   periods but omits Today; verify the saved query actually returns current fills.
   TradeTally runs the saved confirmation period without Activity date overrides.
4. Include Account ID, Symbol, Asset Class, Conid, Exec ID, Trade ID, Date/Time,
   Buy/Sell, Quantity, Price, Commission, Currency and Multiplier. For options add
   Underlying Symbol, Strike, Expiry and Put/Call. Include Brokerage Order ID for
   multi-leg order grouping. Include the same accounts in both queries.
5. Use identical date/time formatting and reporting timezone for both queries.
   Sync retains the existing Activity connection's timezone interpretation. When
   uploading CSV, select the timezone of the report, not just your display zone.
6. Enter the optional confirmation ID in TradeTally's connection form or Settings.
   Settings uses the already encrypted token. Clear the field to remove the query.
   Reconnect preserves it unless explicitly removed.

## Behavior

- With Auto-Sync enabled, TradeTally checks confirmations every 15 minutes around
  the clock. Activity runs on its separately configured schedule. This is a polling
  interval, not an IBKR delivery guarantee. Both use IBKR's shared token limits.
- **Sync today's fills** imports the saved confirmation report only. The normal
  manual Sync action imports confirmations first, then Activity. Successful imports
  are retained if the other report fails.
- Confirmation trades are available immediately for notes and screenshots and are
  included in analytics. Their label is **Awaiting Activity reconciliation**.
  Missing commission is retained as unknown in broker execution metadata; a zero
  amount is distinct. Preliminary totals can change.
- Activity matches execution IDs (or trade IDs) within the same account and contract,
  replaces broker costs, and recomputes totals on the same trade. It preserves notes,
  screenshots, tags, stops and targets. Subsequent confirmations cannot replace
  finalized Activity values. Split executions share the broker commission by quantity.
- Actual manual IBKR CSV imports use the same reconciliation path. Preview parsing
  is read-only. Files without stable IDs can only match a unique legacy fill using
  its time, side, quantity and price. Missing account identity is not guessed.
- Explicit corrections/cancellations, changed quantities/sides, and ambiguous legacy
  matches produce review warnings. They are not imported as new opening fills or
  deleted by inference from an absent row. Matching trades show a needs-review label.
  Resolve the broker discrepancy and re-import the corrected Activity report. A
  safe match with finalized costs clears the review flag.
- An invalid optional query suspends its polling and displays its own error. Update
  its ID in Settings to validate and resume it. Activity remains operational. A
  definitively invalid/expired shared token uses the existing reconnect flow.
- Confirmation timeouts preserve report references and back off separately from
  Activity backfills. Intraday checks do not move the Activity history cursor or
  clear pending Activity retries. A report-not-yet-available response is a warning.

## API additions

Existing routes and legacy fields are preserved. All added fields use snake_case.

- `POST /api/broker-sync/connections/ibkr` and `PUT /api/broker-sync/connections/:id`:
  optional `ibkr_trade_confirmation_query_id`; omission preserves it and null removes it.
- `POST /api/broker-sync/connections/:id/sync`: optional `report_type` of `activity`,
  `trade_confirmation`, or `all`. Manual sync defaults to both configured reports.
- Connection responses include `ibkr_trade_confirmation_query_id`,
  `ibkr_next_confirmation_sync_at`, and `ibkr_last_confirmation_sync_at`.
- Trade responses include nullable `ibkr_reconciliation_status`: `pending`,
  `reconciled`, or `needs_review`. Legacy trades remain null until processed.
- Sync log details include `report_type`, `updated_count`,
  `pending_reconciliation_count`, and warnings.

Migration 282 only adds nullable columns, a due-time index, and an execution-derived
status trigger. It does not rewrite existing trades or alter Activity schedules.

## Official IBKR references

Checked November 8, 2026. Prefer the current API reference over legacy examples
that tell clients to follow the response URL.

- [Trade confirmations](https://www.ibkrguides.com/advisorportal/ug/tradeconfirm.htm)
  — updated May 19, 2026; confirmations are generated for executions intraday.
- [Trade Confirmation Flex Query setup](https://www.ibkrguides.com/clientportal/performanceandstatements/tradeflex.htm)
  — updated July 27, 2026; field selection, detail level, formats and periods.
- [Generate a report](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report)
  — version 3 SendRequest, saved periods, pacing and ignoring the legacy URL.
- [Retrieve a report](https://www.interactivebrokers.com/docs/web-api/api-reference/get-statement)
  — GetStatement using the report reference code and original token.
- [Confirmation field reference](https://www.ibkrguides.com/reportingreference/reportguide/trade%20confirmation%20configuration.htm)
  — identifiers, contracts, commissions and correction fields.
- [Version 3 error codes](https://www.ibkrguides.com/complianceportal/flex3error.htm)
  — report generation, token/query errors and per-token request limits.

## Release validation

Run the backend/frontend regression suites, frontend build, and PostgreSQL integration
suite against a scratch database. Validate a real intraday report and its subsequent
finalized Activity report before promoting a nightly build to a stable release.
Do not use a user's live database for testing or data repairs.
