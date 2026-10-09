# Strix Security Remediation

This document records the disposition of the findings from the August 2026
authorized Strix assessment. It intentionally excludes proof-of-concept secrets,
credentials, and production topology details.

| Report | Disposition | Verification |
| --- | --- | --- |
| 0001 | Accepted product behavior: email verification is advisory | Legacy and v1 login tests cover approved, unverified users |
| 0002 | Fixed OAuth refresh-token lookup and sanitized `invalid_grant` errors | OAuth service and controller regression tests |
| 0003 | Production containment required in the private deployment repository | Cloudflare Access and Kestra authentication checks |
| 0004 | Resend oracle fixed; duplicate-registration disclosure accepted to preserve auto-login | Uniform `202` resend response tests |
| 0005, 0006 | Fixed as one duplicate IDOR finding | Cross-user split returns `404` |
| 0007 | Production containment required in the private deployment repository | CRM is unreachable without Cloudflare Access |
| 0008 | Fixed IPv4-embedded IPv6 SSRF bypasses | Mapped, compatible, NAT64, and 6to4 regression cases |
| 0009 | Production secret rotation and private routing required | Old secret rejected; sync succeeds only over private origin |
| 0010 | Fixed missing administrator authorization | Import-log routes require authentication and administrator role |
| 0011 | Fixed OAuth consent CSRF gap | CSRF middleware precedes authentication on the direct route |
| 0012 | Fixed by requiring PKCE S256 | Authorization, exchange, legacy-code, and discovery tests |
| 0013 | Fixed backup-restore SQL injection | Identifier, mapping, unknown-table, empty-column, and valid-restore tests |

## Product decisions

- Email verification remains available and visible to clients but is not a login prerequisite.
- Approved registrations continue to receive an immediate session.
- Duplicate registration continues to return an explicit conflict. This is an
  accepted existence signal required by the immediate-session signup contract.
- OAuth authorization code flows require PKCE S256 without a compatibility window.

## Verification boundary

Production verification must remain non-destructive and limited to the exact
authorized hosts `tradetally.io`, `kestra.tradetally.io`, and
`crm.tradetally.io`. Do not replay the original remote-code-execution proof of
concept or include captured secrets in test output.
