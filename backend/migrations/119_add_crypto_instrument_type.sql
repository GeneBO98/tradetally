-- Add crypto as a valid instrument type
-- Update the CHECK constraint on instrument_type column

-- Drop the existing constraint
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_instrument_type_check;

-- Add the new constraint with crypto included
ALTER TABLE trades ADD CONSTRAINT trades_instrument_type_check
  CHECK (instrument_type IN ('stock', 'option', 'future', 'crypto'));
