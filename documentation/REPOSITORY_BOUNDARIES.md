# Public and hosted repository boundaries

The public repository contains the self-hosted application. The hosted service
contains that application plus its commercial website and operating integrations.

| Area | Public self-hosted app | Hosted service |
| --- | --- | --- |
| Accounts, security and mobile REST API | Shared | Shared |
| Journal, CSV imports, broker sync, P&L and analytics | Shared | Shared |
| Portfolio, retirement planning, charts and market-data helpers | Shared | Shared |
| Playbooks, gamification, backups and user-owned trade sharing | Shared | Shared |
| Verification/reset, broker reconnect and alert emails | SMTP | Hosted email delivery |
| Weekly personal trade summaries and edge reports | SMTP | Hosted email delivery |
| Landing, pricing, comparisons and public SEO calculators | Excluded | Hosted only |
| Trial surveys, conversion/re-engagement campaigns and CRM revenue sync | Excluded | Hosted only |
| Sequenzy, promotional offers and broker-verified public rankings | Excluded | Hosted only |
| Production hosting plans, watchdogs and marketing automation | Excluded | Hosted only |

Existing tier and optional billing scaffolding remains configurable. Hosted
prices, promotions, subscription verification and lifecycle campaigns must not
be copied into the self-hosted application. Authentication, privacy/legal pages
and user-controlled shared trade pages are application features, even though
some of them are accessible without a login.

## Enforcing the boundary

`scripts/public-cloud-boundaries.txt` lists cloud-exclusive paths.
`scripts/check-public-clean.sh` checks a Git tree against that list and scans
shared runtime/configuration files for embedded cloud-provider references.
`tests/repository-boundaries.test.sh` tests both blocked and allowed content.
GitHub runs both checks on public pull requests and `main`/`develop` pushes.

Enable the local preventive hook with:

```bash
git config core.hooksPath githooks
```

Shared features must not be put on the cloud-exclusive list. Intentionally
different hosted implementations belong in the private override list instead.
Review public-to-hosted merges separately from deployments. A native update
must update its configured upstream, without importing another repository or
pushing automatic cross-repository merges.

Applied migrations remain historical records. New ports use unused migration
filenames after the public sequence. Equivalent schema migrations can have
different filenames in the two repositories.
