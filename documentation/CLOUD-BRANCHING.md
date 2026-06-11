# Cloud branching & deploy workflow

This documents how the cloud deployment stays correct after the June 2026
incident where a public-repo "remove marketing page" commit was auto-merged
into the cloud branch and wiped the live landing page.

## Repos

| Remote   | URL                                    | Purpose                          |
|----------|----------------------------------------|----------------------------------|
| `origin` | `GeneBO98/tradetally`                  | Public / self-host (OSS). No marketing surface. |
| `cloud`  | `GeneBO98/tradetally-cloud`            | Private cloud build. **Source of truth for prod.** |

## The one rule

**Production deploys from `cloud/main`. Never auto-pull `origin` into the deploy.**

The public repo intentionally deletes the marketing/SEO surface ("remove from
self-host"). If a deploy runs `git pull origin main`, those deletions land on
cloud and take down the public site. Deploys now fast-forward `cloud/main`
only (`scripts/deploy-native.sh`).

## Bringing public (origin) changes into cloud

Do it deliberately, never on the deploy path:

```bash
git fetch origin
git checkout main                 # tracks cloud/main
git merge origin/main            # resolve conflicts; keep cloud-only surface
# open a PR into cloud/main; let CI (build + test) run; review; merge
git push cloud main
```

CI (`.github/workflows/ci.yml`) runs `pnpm install` + frontend build + backend
tests on every PR/push to `main` — it catches missing deps and broken merges
before they can reach prod.

## GitHub settings to enable (one-time, in the cloud repo UI)

Settings → Branches → Add branch protection rule for `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select **CI / build-and-test**
- ✅ Require branches to be up to date before merging
- ✅ Do not allow force pushes / deletions

## Deploy

```bash
./scripts/deploy-native.sh
```

The script: fast-forwards `cloud/main` (ff-only — a divergence fails loudly),
installs deps, builds the frontend, runs DB migrations, restarts pm2, verifies
the live process is running the new code (not stale), then runs
`scripts/post-deploy-smoke.sh` (public page is the marketing page, API healthy,
running commit == deployed commit) and **fails the deploy if any check fails.**

## Hygiene

- **Never edit files directly on the prod checkout.** Develop on a branch, open
  a PR, let CI run, deploy. (Uncommitted WIP was found on the prod server during
  the incident — it makes deploys unsafe and changes hard to trace.)
- Migrations must be **idempotent** and reconcile existing schemas
  (`ALTER ... ADD COLUMN IF NOT EXISTS`, guarded constraint changes) — not
  `CREATE TABLE IF NOT EXISTS`, which silently skips drifted tables (the bug
  behind the 25h Finnhub-metrics outage; see migration 205).
