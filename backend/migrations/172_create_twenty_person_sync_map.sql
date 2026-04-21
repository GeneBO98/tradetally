CREATE TABLE IF NOT EXISTS twenty_person_sync_map (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    twenty_person_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_twenty_person_sync_map_email
    ON twenty_person_sync_map(email);
