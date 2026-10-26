# OANDA v20 broker sync (issue #419)

## Connect and test

1. Run the build containing migration `278_add_oanda_broker_sync.sql`. Normal
   application startup applies it; native installs can use `pnpm --dir backend migrate`.
2. Open **Broker Sync → OANDA**. Start with **Practice account** when available.
3. Generate a personal access token in OANDA's **Manage API Access** screen.
   Paste it into TradeTally, select **Load accounts**, and choose the account.
4. Optionally set a label and the earliest closing date to import. Leave the
   date blank for all available history. Open trades are included regardless of
   that floor, so entries preceding the selected date are not lost.
5. Connect, then select **Sync Now**. Review the sync history for warnings.
6. Compare a long, a short, a partially closed trade, and an overnight trade
   against the OANDA account statement. Include a metal/CFD and a non-USD
   account if available. Compare P&L in the same display currency.
7. Sync again: unchanged trades should be duplicates, with no extra rows.
   After closing or reducing a position, sync again: its existing row should
   update, retaining journal notes and tags.

No application-wide OANDA key or new environment variables are required.
OANDA tokens are encrypted using the existing broker encryption configuration.
The feature follows the existing broker-sync tier rules (Pro when billing is
configured, available to self-hosted users without billing).

## Behavior and boundaries

- Practice and live accounts are separate. Each subaccount is connected
  separately, and its account identifier includes the environment and full
  OANDA account ID. Global account filtering uses that identifier normally.
- Trade identities use OANDA trade IDs within their account/environment.
  Opposite positions in the same instrument are never netted together.
- Currencies import as `forex`; OANDA metals and CFDs import as `cfd`.
  Instruments must be exposed by the selected account's API.
- Stored prices and monetary amounts are USD-normalized. Native quote prices
  are preserved for display. OANDA's reported realized P&L is converted from
  the account currency using the historical daily FX rate for each close.
  Missing conversion rates produce a warning and skip the affected trade;
  they never silently fall back to a 1:1 conversion.
- Opening commissions are allocated by units across partial exits and the
  remaining open position. Commissions on reversal orders are split across
  all opened/closed/reduced trade units in that fill.
- Lifetime financing and dividend adjustments are allocated proportionally
  across closed/open units. Credits reduce fees. Costs allocated to units
  still open are included in the trade's costs and realized with those units
  when closed. This is trade-lifecycle accounting, not a reconstruction of
  daily account cash movements. Non-USD conversions use historical daily
  rates, so USD results can differ from intraday currency conversion.
- Spread costs are already reflected in execution prices and are not charged
  again as separate fees. Guaranteed execution fees are included.
- A sync imports a complete trade lifecycle. An end date excludes trades
  closing after that date; an open trade with later exits is skipped with a
  warning. Historical snapshots of account positions are not reconstructed.
- Imported economics follow OANDA when the next changed snapshot is synced;
  user notes and tags are retained. Editing an individual grouped leg's
  price, side, or quantity invalidates that leg's reported P&L and uses the
  normal calculation until OANDA supplies a changed snapshot.
- Deleting synced trades does not remove them from OANDA. A later sync can
  import them again. Disconnecting a broker preserves existing trades.
- OANDA-specific chart candles and streaming quotes are outside this change.

## Token permissions and availability

TradeTally sends only GET requests to OANDA. Its personal token nevertheless
permits trading and access to other subaccounts; OANDA does not provide a
read-only personal-token scope. The connection screen explains this before
saving. Tokens are never returned by connection APIs or stored in browser
storage, and API errors are sanitized before logging.

Eligibility and instrument coverage vary by OANDA division. This integration
requires a v20 account, not an MT4/MT5-only account. See the current OANDA
introduction and regional terms rather than promising universal free access.
Cloud operators should confirm the applicable third-party/partner arrangement
with OANDA before a broad rollout.

References:

- https://developer.oanda.com/rest-live-v20/introduction/
- https://developer.oanda.com/rest-live-v20/authentication/
- https://developer.oanda.com/rest-live-v20/trade-ep/
- https://developer.oanda.com/rest-live-v20/transaction-df/

## Automated verification

The shared trading fixtures cover account-currency P&L and a partial short
metal trade. Backend tests cover API pagination, retries, token redaction,
connection encryption, tier gates, trade updates, and cache invalidation.
Frontend tests cover account selection, reconnect, and displayed net/gross P&L.
The real PostgreSQL suite exercises migration constraints and the actual Trade
create/update paths, including identical fills with distinct OANDA trade IDs.

```bash
pnpm --dir backend test --runInBand
pnpm --dir frontend test:run
pnpm --dir frontend build
TEST_DATABASE_URL=postgres://tradetally:testpass@localhost:5440/tradetally_test \
  pnpm --dir backend test:integration
```

Only point the integration suite at a disposable test database.
