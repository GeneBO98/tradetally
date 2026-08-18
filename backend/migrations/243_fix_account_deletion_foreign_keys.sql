-- Make retained administrative metadata compatible with account deletion.
-- Creator references are audit metadata and must not prevent deleting the
-- creator. Backup creator identity is likewise optional after deletion.

ALTER TABLE tier_overrides
  DROP CONSTRAINT IF EXISTS tier_overrides_created_by_fkey;
ALTER TABLE tier_overrides
  ADD CONSTRAINT tier_overrides_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE cusip_mappings
  DROP CONSTRAINT IF EXISTS cusip_mappings_created_by_fkey;
ALTER TABLE cusip_mappings
  ADD CONSTRAINT cusip_mappings_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE backups
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE backups
  DROP CONSTRAINT IF EXISTS backups_user_id_fkey;
ALTER TABLE backups
  ADD CONSTRAINT backups_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
