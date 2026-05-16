-- Fresh rebuild compatibility for 127_add_cusip_ai_provider_settings.sql.
-- Existing upgraded databases have already run 127, so avoid changing their
-- admin_settings shape. Fresh rebuilds need these aliases before 127 inserts
-- into key/value/description.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM migrations
    WHERE filename = '127_add_cusip_ai_provider_settings.sql'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS key VARCHAR(255);
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS value TEXT;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS description TEXT;

    UPDATE admin_settings
    SET
      key = COALESCE(key, setting_key),
      value = COALESCE(value, setting_value)
    WHERE key IS NULL OR value IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_settings_key_unique
      ON admin_settings(key);

    CREATE OR REPLACE FUNCTION sync_admin_settings_compat_columns()
    RETURNS TRIGGER AS $trigger$
    BEGIN
      IF NEW.setting_key IS NULL THEN
        NEW.setting_key := NEW.key;
      END IF;

      IF NEW.key IS NULL THEN
        NEW.key := NEW.setting_key;
      END IF;

      IF NEW.setting_value IS NULL THEN
        NEW.setting_value := NEW.value;
      END IF;

      IF NEW.value IS NULL THEN
        NEW.value := NEW.setting_value;
      END IF;

      RETURN NEW;
    END;
    $trigger$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS sync_admin_settings_compat_columns ON admin_settings;
    CREATE TRIGGER sync_admin_settings_compat_columns
      BEFORE INSERT OR UPDATE ON admin_settings
      FOR EACH ROW
      EXECUTE FUNCTION sync_admin_settings_compat_columns();
  END IF;
END $$;
