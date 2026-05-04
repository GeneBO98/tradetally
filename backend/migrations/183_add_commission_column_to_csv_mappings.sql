-- Add separate commission column support to custom CSV mappings.
-- Existing fees_column mappings are left intact for backwards compatibility.

ALTER TABLE custom_csv_mappings
ADD COLUMN IF NOT EXISTS commission_column VARCHAR(255);

COMMENT ON COLUMN custom_csv_mappings.commission_column IS 'CSV column name containing broker commission values';
