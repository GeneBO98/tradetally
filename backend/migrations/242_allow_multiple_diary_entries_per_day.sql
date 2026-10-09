-- Allow users to create multiple independent journal/playbook entries on a date.
-- Entries are identified by their UUID; the date is scheduling/grouping metadata.
ALTER TABLE diary_entries
  DROP CONSTRAINT IF EXISTS diary_entries_user_id_entry_date_entry_type_key;

COMMENT ON TABLE diary_entries IS
  'Trading journal and playbook entries for users; multiple entries may share a date and type';
