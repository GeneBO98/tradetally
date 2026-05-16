# Migration Prefix Normalization

The historical migration set contains duplicate numeric prefixes. Those files are checksum-bound once applied, so they should not be renamed in place.

Current policy:

- Existing duplicate prefixes are grandfathered in `backend/config/migration-prefix-allowlist.json`.
- `npm run migrate:check` keeps reporting duplicate prefixes as warnings for visibility.
- `MIGRATION_PREFIX_STRICT=true npm run migrate:check` or `npm run migrate:check -- --strict-prefixes` fails on any new duplicate prefix not in the allowlist.
- `npm run migrate:fresh-rebuild` remains the proof that the historical order can rebuild a fresh database.

Next normalization step:

1. Keep adding new migrations with unique monotonic prefixes above the current maximum.
2. Once fresh rebuild is stable for a release cycle, generate a base-schema migration for new installs.
3. Keep the historical migrations for upgraded deployments until the oldest supported upgrade path no longer needs them.
4. Remove allowlisted duplicates only after the replacement base schema is the default bootstrap path.
