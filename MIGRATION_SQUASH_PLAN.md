# Migration Squash Plan - TradeTally

## Problem Statement

TradeTally currently has 69+ migrations that run sequentially on new installations. This creates several issues:

1. **Performance**: Each new install takes longer as migrations accumulate
2. **Maintenance**: Difficult to track which migrations fix what issues
3. **Conflicts**: Migration checksum mismatches when files are modified after application
4. **Debugging**: Hard to understand current schema state without reading through dozens of files
5. **User Experience**: Users on older versions may have outdated column types causing runtime errors

## Current Situation

### Critical Column Type Issues Found

The following columns have had precision issues that were fixed in later migrations:

- `strategy_confidence`: Initially DECIMAL(3,2), fixed to DECIMAL(5,2) in migration 058
- `pnl`: Initially DECIMAL(10,2), fixed to NUMERIC(20,6) in migration 064
- `pnl_percent`: Initially DECIMAL(10,4), fixed to NUMERIC(15,6) in migration 064
- Price fields: Toggled between DECIMAL(10,2) and DECIMAL(15,6) in migrations 013, 014, 063

Users who haven't run all migrations will encounter "numeric field overflow" errors when:
- Strategy confidence is calculated as percentage (0-100) but column only holds -9.99 to 9.99
- Large trade P&L values exceed the precision limits
- Imports with many executions accumulate large values

## Solution: Migration Squash

### Approach

Create a baseline migration for version 2.0 that:

1. **Consolidate Migrations 001-060** into a single baseline schema file
2. **Keep Recent Migrations** (061-069+) for users upgrading from 1.x versions
3. **Version Detection** to determine which migration path to follow

### Implementation Plan

#### Phase 1: Create Baseline Schema (v2.0.0)

Create `migrations/baseline_v2.0.0.sql` with:
- Complete current schema with all tables, indexes, views
- Correct column types (NUMERIC(20,6) for pnl, etc.)
- All features up through migration 060
- Database version marker

#### Phase 2: Migration Runner Logic

Update migration runner to:
```javascript
// Check if database is new (no migrations table or empty)
if (isNewDatabase) {
  // Run baseline schema
  await runMigration('baseline_v2.0.0.sql');
  // Mark migrations 001-060 as applied
  await markMigrationsAsApplied('001' through '060');
}

// Check database version
const dbVersion = await getDatabaseVersion();

if (dbVersion < '2.0.0') {
  // Run incremental migrations 001-069
  await runIncrementalMigrations();
} else {
  // Run only new migrations after baseline
  await runMigrations('061' through 'latest');
}
```

#### Phase 3: Archive Old Migrations

Move migrations 001-060 to `migrations/archive/v1.x/`:
- Keep for reference and troubleshooting
- Not run on new installations
- Still available for users upgrading from very old versions

#### Phase 4: Database Health Check

Implement automated health check (already done in admin.routes.js):
- Verify critical column types on startup
- Log warnings for users with outdated schemas
- Provide migration instructions

### Migration Timeline

**Version 2.0.0 Release:**
- Include baseline schema
- Updated migration runner
- Health check endpoint

**Future Releases (2.1, 2.2, etc.):**
- Only add incremental migrations
- Plan next squash at ~50 migrations (around v3.0.0)

### Benefits

1. **New Installations**: Single baseline migration (1 file vs 69+ files)
2. **Faster Onboarding**: Docker deployments complete in seconds not minutes
3. **Cleaner Codebase**: Easier to understand current schema
4. **Better Testing**: Can test against known baseline state
5. **User Protection**: Health checks warn of schema issues before errors occur

### Rollout Strategy

**For New Users:**
- Automatic - baseline schema runs on first startup

**For Existing Users (Upgrade Path):**

1. **Version Check**: Application detects database version on startup
2. **Migration Path**:
   - v1.0-1.5 users: Run incremental migrations 001-069
   - v2.0+ users: Run only new migrations

3. **Manual Upgrade Option** (for users with issues):
   ```bash
   # Backup database
   pg_dump tradetally > backup.sql

   # Run health check
   curl -H "Authorization: Bearer <admin-token>" \
     http://localhost:3000/api/admin/database/health

   # If issues found, run fix migrations
   npm run migrate
   ```

### Files to Create

1. `migrations/baseline_v2.0.0.sql` - Complete schema
2. `migrations/archive/v1.x/001-060_*.sql` - Archived old migrations
3. `backend/src/utils/migrationRunner.js` - Updated with version detection
4. `UPGRADE_GUIDE.md` - User documentation for v1.x → v2.0 upgrade

### Rollback Plan

If issues arise:
- Keep v1.x branch maintained for 6 months
- Provide downgrade script if needed
- Health check endpoint helps identify problems before full rollout

## Next Steps

1. [x] Create database health check endpoint
2. [x] Document plan (this file)
3. [ ] Test baseline schema creation on clean database
4. [ ] Update migration runner with version detection
5. [ ] Create UPGRADE_GUIDE.md
6. [ ] Test upgrade path from v1.x database
7. [ ] Schedule v2.0.0 release

## References

- Migration 058: Fixed strategy_confidence precision
- Migration 064: Fixed pnl field overflow
- Issue: User reported "numeric field overflow" on IBKR CSV import
- Admin Endpoint: GET /api/admin/database/health
