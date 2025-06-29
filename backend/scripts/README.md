# Admin Scripts

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