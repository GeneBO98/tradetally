# Shared saved-work recovery — 27 October 2026

These unapplied patches preserve shared application work recovered during repository cleanup. The patches retain the original changes rather than silently discarding work or replacing newer runtime code with historical versions. They require review and adaptation before implementation.

| Patch | Saved date | Scope |
| --- | --- | --- |
| [metatrader-deal-history.patch](metatrader-deal-history.patch) | 2026-05-17 | MetaTrader 4/5 deal-history CSV parser and importer |
| [investment-api-key-auth.patch](investment-api-key-auth.patch) | 2026-05-11 | API-key authentication for investment routes |
| [ibkr-currency-warning.patch](ibkr-currency-warning.patch) | 2026-05-10 | IBKR unconverted-currency import and sync warning variant |

The MetaTrader and IBKR patches target the former monolithic CSV parser; the current parser is split into modules. The MetaTrader patch handles execution-pair exports, while the existing MT5 importer handles a different report layout. The IBKR variant permits unconverted currency values, so its currency behavior needs review before use. The investment patch changes accepted authentication methods and must retain tier and scope checks.

`patches.json` records SHA-256 digests of the exact recovered patch bytes. This branch preserves the work for inspection; it does not change runtime behavior. Hosted integrations, production configuration, historical private ancestry and operational data are excluded.
