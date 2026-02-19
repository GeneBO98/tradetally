# PostgreSQL Upgrade Guide

## Problem: PostgreSQL Version Mismatch

If you see this error when running `docker-compose up`:

```
FATAL: database files are incompatible with server
DETAIL: The data directory was initialized by PostgreSQL version 15, which is not compatible with this version 16.10.
```

This means your existing database was created with PostgreSQL 15, but the current Docker setup uses PostgreSQL 16.

## Quick Solution

Run the automatic migration script:

```bash
# Run the migration script
./scripts/rescue-migrate-postgres-16.sh
```

This script will:
1. ✅ Backup your existing PostgreSQL 15 database
2. ✅ Safely upgrade to PostgreSQL 16  
3. ✅ Restore all your data
4. ✅ Start the application normally

## What the Script Does

1. **Creates Backup**: Full SQL dump of your PostgreSQL 15 database
2. **Stops Containers**: Safely stops all running containers
3. **Migrates Data**: 
   - Temporarily starts PostgreSQL 15 to create backup
   - Removes old data volume
   - Creates new PostgreSQL 16 database
   - Restores your data from backup
4. **Verifies Migration**: Confirms data integrity and PostgreSQL version

## Alternative: Environment Variable Control

You can also enable automatic migration by setting in your `.env` file:

```bash
AUTO_MIGRATE_POSTGRES=true
```

Then run:
```bash
./docker/simple-postgres-migrate.sh
```

## Safety Features

- ✅ **Full backup** created before any changes
- ✅ **Rollback capability** if migration fails
- ✅ **Data integrity verification** 
- ✅ **No data loss** - all backups preserved

## After Migration

1. **Verify your data**: Check that all trades, users, and settings are intact
2. **Test functionality**: Import CSV, add trades, check analytics
3. **Keep backups**: Migration creates backups in `./postgres-migration-backup/`

## Need Help?

If the migration fails:
1. **Don't panic** - your data is safe in the backups
2. Check the error logs
3. Run the rollback script: `./scripts/rollback-postgres-15.sh`
4. Your database will be restored to the working PostgreSQL 15 state

## Environment Configuration

Make sure your `.env` file has the correct database settings:

```bash
DB_USER=trader
DB_PASSWORD=your_secure_password
DB_NAME=tradetally
```

---

**This upgrade is a one-time process**. Once completed, your database will be PostgreSQL 16 and fully compatible with the latest TradeTally version.