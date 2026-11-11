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
7. Choose the **Confirmation sync interval (minutes)** during setup or in Settings.
   The default is 15 minutes. Enter 60 for hourly checks; custom values must be whole
   multiples of 15 from 15 through 1440 (24 hours). This does not change Activity's
   schedule. Changing only this interval uses the saved connection without another
   credential check.

## Behavior

- With Auto-Sync enabled, TradeTally checks confirmations at your configured interval
  around the clock. Existing connections keep the 15-minute default. Activity runs on
  its separately configured schedule. The scheduler checks for due work every 15
  minutes; ongoing syncs or broker retry backoff can delay a check. This is a polling
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

## Sync history

Automatic, completed IBKR confirmation checks are grouped by connection and day in
Sync History, using your saved display timezone (including daylight saving changes).
Each row shows its check count, total imports and updates, warning count, distinct
warning messages, and the latest pending-reconciliation count. That last figure is
not summed across checks.

Use **Show checks** to expand a day's individual timestamps and results. **Load older
checks** and **Load older history** keep older entries accessible. Grouping happens
before the history page limit, so 96 checks do not consume 96 rows of history. Logs
are retained individually in the database.

Manual syncs, Activity syncs, failures, running jobs, and entries requiring manual
review remain separate. Warnings on completed automatic checks remain visible in
the daily summary and in the expanded checks.

## API additions

Existing routes and legacy fields are preserved. All added fields use snake_case.

- `POST /api/broker-sync/connections/ibkr` and `PUT /api/broker-sync/connections/:id`:
  optional `ibkr_trade_confirmation_query_id`; omission preserves it and null removes it.
  Optional `ibkr_confirmation_interval_minutes` is an integer multiple of 15 from
  15 to 1440. Omission preserves an existing interval on reconnect or update.
- `POST /api/broker-sync/connections/:id/sync`: optional `report_type` of `activity`,
  `trade_confirmation`, or `all`. Manual sync defaults to both configured reports.
- Connection responses include `ibkr_trade_confirmation_query_id`,
  `ibkr_next_confirmation_sync_at`, `ibkr_last_confirmation_sync_at`, and
  `ibkr_confirmation_interval_minutes`.
- Log endpoints continue to return individual records by default. Request
  `group_by=day` to paginate daily summaries plus individual important events;
  `limit` is 1–100, `offset` is 0–1000000, and `has_more` indicates another page.
  To expand a summary, use the connection log endpoint with `group_date=YYYY-MM-DD`
  and optional `limit`/`offset`. Ownership is checked before retrieving that day.
- Trade responses include nullable `ibkr_reconciliation_status`: `pending`,
  `reconciled`, or `needs_review`. Legacy trades remain null until processed.
- Sync log details include `report_type`, `updated_count`,
  `pending_reconciliation_count`, and warnings.

Migration 282 only adds nullable columns, a due-time index, and an execution-derived
status trigger. It does not rewrite existing trades or alter Activity schedules.
Migration 286 adds the confirmation interval with a 15-minute default and validation;
it does not delete, combine, or rewrite stored logs.

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
