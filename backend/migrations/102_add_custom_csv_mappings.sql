-- Create table for storing custom CSV column mappings
CREATE TABLE IF NOT EXISTS custom_csv_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mapping_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Column mappings (CSV column name -> database field)
    symbol_column VARCHAR(255),
    side_column VARCHAR(255),
    quantity_column VARCHAR(255),
    entry_price_column VARCHAR(255),
    exit_price_column VARCHAR(255),
    entry_date_column VARCHAR(255),
    exit_date_column VARCHAR(255),
    pnl_column VARCHAR(255),
    fees_column VARCHAR(255),
    notes_column VARCHAR(255),

    -- Date format (e.g., 'MM/DD/YYYY', 'YYYY-MM-DD', etc.)
    date_format VARCHAR(50) DEFAULT 'MM/DD/YYYY',

    -- Delimiter (comma, tab, semicolon, etc.)
    delimiter VARCHAR(10) DEFAULT ',',

    -- Header row present
    has_header_row BOOLEAN DEFAULT true,

    -- Additional parsing options (JSON for flexibility)
    parsing_options JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    use_count INTEGER DEFAULT 0,

    CONSTRAINT unique_user_mapping_name UNIQUE(user_id, mapping_name)
);

-- Create index for faster lookups
CREATE INDEX idx_custom_csv_mappings_user_id ON custom_csv_mappings(user_id);
CREATE INDEX idx_custom_csv_mappings_last_used ON custom_csv_mappings(user_id, last_used_at DESC);

-- Add comment
COMMENT ON TABLE custom_csv_mappings IS 'Stores user-defined CSV column mappings for importing trades from unsupported broker formats';
