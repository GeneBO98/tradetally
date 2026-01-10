-- Add contract_month and contract_year to instrument_templates for futures
ALTER TABLE instrument_templates ADD COLUMN IF NOT EXISTS contract_month VARCHAR(3);
ALTER TABLE instrument_templates ADD COLUMN IF NOT EXISTS contract_year INTEGER;
