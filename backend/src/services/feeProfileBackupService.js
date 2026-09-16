// Use the backup transaction's client so accounts and profiles restore atomically.
async function restoreAccountAssignments(client, user_id, profile_id, identifiers) {
  if (!Array.isArray(identifiers)) throw new Error('Fee profile account identifiers must be an array');
  const account_identifiers = [...new Set(identifiers
    .filter(value => value !== null && value !== undefined)
    .map(value => String(value).trim()).filter(Boolean))];
  if (account_identifiers.some(value => value.length > 255)) {
    throw new Error('Fee profile account identifier is too long');
  }
  if (!account_identifiers.length) return;

  // Older backups contain identifiers, not managed-account records. Recreate
  // missing accounts with neutral defaults; never overwrite existing balances.
  await client.query(
    `INSERT INTO user_accounts (user_id, account_name, account_identifier,
       initial_balance, initial_balance_date, fee_profile_id)
     SELECT $1, LEFT(identifier, 100), identifier, 0, CURRENT_DATE, $2
     FROM unnest($3::text[]) AS restored(identifier)
     WHERE NOT EXISTS (
       SELECT 1 FROM user_accounts ua
       WHERE ua.user_id = $1 AND ua.account_identifier = restored.identifier
     )`,
    [user_id, profile_id, account_identifiers]
  );
  await client.query(
    `UPDATE user_accounts SET fee_profile_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2 AND account_identifier = ANY($3::text[])`,
    [profile_id, user_id, account_identifiers]
  );
}

module.exports = { restoreAccountAssignments };
