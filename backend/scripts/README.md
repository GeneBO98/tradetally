# Admin Scripts

## Fix MAE/MFE for futures/options trades

Prior to the contract-multiplier fix in `maeEstimator.js`, auto-calculated
MAE/MFE values for futures and options were stored without the `point_value`
(or `contract_size`) multiplier — i.e. in "price-move × quantity" units
rather than dollars. For a MES trade the stored value is 1/5 of the correct
dollar amount.

To repair existing trades:

```bash
cd backend

# Preview what would change
node scripts/fix_mae_mfe_multipliers.js

# Commit the changes
node scripts/fix_mae_mfe_multipliers.js --apply

# Scope to a single user
node scripts/fix_mae_mfe_multipliers.js --user <userId> --apply
```

The script only touches rows where the stored value is mathematically
impossible (MAE smaller than the realized loss in dollars, or MFE smaller
than the realized gain) — anything passing that check is left alone, so
manually-entered values are preserved.

## First User Auto-Admin

The first user to register on a fresh TradeTally installation is automatically granted admin privileges. This ensures there's always an admin account available to manage the system.

## Making Additional Admins

To give additional users admin privileges, use the `make-admin.js` script:

```bash
cd backend
node scripts/make-admin.js user@example.com
```

This will:
- Update the user's role to 'admin' in the database
- Show confirmation with user details
- Exit with an error if the user is not found

## Admin Permissions

Admin users have the following additional permissions:

### Trade Management
- Can delete any public trade (not just their own)
- Regular users can only delete their own trades

### Future Permissions
The admin role system is extensible and can be expanded to include:
- User management
- Site-wide settings
- Moderation capabilities
- Analytics access

## Database Schema

The `users` table includes a `role` column:
- `'user'` (default) - Regular user permissions
- `'admin'` - Full admin permissions

## Security Notes

- Admin permissions are checked server-side in middleware
- JWT tokens include the user's role for frontend permission checks
- All admin actions are logged and can be audited
- The role field has a database constraint to only allow 'user' or 'admin' values

## Release Announcements

Use `announce:release` to hand a version or feature announcement to n8n, which can then turn it into brand-style X.com copy.

Example:

```bash
cd backend
npm run announce:release -- \
  --release-file ../documentation/releases/v2.5.2.md \
  --type version
```

For a feature announcement, pass the feature name and the main benefit:

```bash
cd backend
npm run announce:release -- \
  --type feature \
  --feature-name "Broker sync" \
  --feature-benefit "your broker trades stay in sync automatically" \
  --cta-url "https://tradetally.io"
```

Required environment values:
- `N8N_ANNOUNCEMENT_WEBHOOK_URL`
- `N8N_ANNOUNCEMENT_SECRET` if your workflow checks a shared secret
- `TRADETALLY_PUBLIC_URL` for default call-to-action links
