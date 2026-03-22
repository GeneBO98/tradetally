# Secret Exposure Remediation

This document tracks the first-pass remediation for secret and sensitive-data findings raised by local security scans.

## Classification

| Source | Classification | Status | Notes |
| --- | --- | --- | --- |
| `scripts/ecosystem.config.js` `VITE_POSTHOG_KEY` | Public client key in committed runtime config | Cleaned from tracked config | Moved to env-driven configuration. Treat as public-facing analytics key unless PostHog admin confirms rotation is required. |
| `backend/src/data/backups/**` in git history | Historical sensitive data blob | Purged locally from git history | Not present in current checkout. History was rewritten locally with `git filter-repo`; collaborators must re-clone or hard-reset after the force-push. |
| Documentation placeholders such as `YOUR_TOKEN`, `tt_live_your_api_key` | Placeholder/example | Accepted | Keep as-is unless they materially degrade scanner signal. |

## Rotation Ledger

| System | Exposure Source | Rotation Date | Deployment Updated | Notes |
| --- | --- | --- | --- | --- |
| PostHog project key | `scripts/ecosystem.config.js` | Pending manual confirmation | Pending | If the currently exposed key maps to a live project and you want a fresh value, rotate in PostHog and update deployment env vars. Public client keys do not grant server-side access but should still be managed outside committed runtime config. |

## History Purge Commands

Install `git-filter-repo` first if it is not already available.

```bash
python3 -m pip install --user git-filter-repo
```

Rewrite history to remove historical backup artifacts and the old committed PM2 config values:

```bash
git filter-repo --force --invert-paths \
  --path backend/src/data/backups \
  --path scripts/ecosystem.config.js
```

Then clean local references and garbage collect:

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

After verification, force-push rewritten branches and tags:

```bash
git push --force --all
git push --force --tags
```

## Verification

1. Re-run `tmp/security-suite/run-gitleaks.sh`.
2. Re-run `tmp/security-suite/run-trivy-fs.sh`.
3. Confirm `git log --all -- backend/src/data/backups` returns no results.
4. Confirm deployments provide `VITE_POSTHOG_KEY` and optionally `VITE_POSTHOG_HOST` through environment variables if analytics should remain enabled.
5. Force-push rewritten branches and tags, then notify collaborators to refresh their clones.
