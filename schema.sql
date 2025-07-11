-- TradeTally Database Schema
-- Run this only if tables don't exist

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url VARCHAR(500),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    public_profile BOOLEAN DEFAULT FALSE,
    default_tags TEXT[],
    import_settings JSONB DEFAULT '{}',
    theme VARCHAR(20) DEFAULT 'light',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    quantity INTEGER NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    exit_price DECIMAL(10,4),
    entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
    exit_time TIMESTAMP WITH TIME ZONE,
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short', 'buy', 'sell')),
    pnl DECIMAL(12,2),
    pnl_percent DECIMAL(8,4),
    commission DECIMAL(8,2) DEFAULT 0,
    fees DECIMAL(8,2) DEFAULT 0,
    strategy VARCHAR(50),
    tags TEXT[],
    notes TEXT,
    trade_date DATE NOT NULL,
    broker VARCHAR(50),
    account_id VARCHAR(100),
    order_id VARCHAR(100),
    execution_id VARCHAR(100),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trade attachments table
CREATE TABLE IF NOT EXISTS trade_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_name VARCHAR(255),
    file_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trade comments table
CREATE TABLE IF NOT EXISTS trade_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP WITH TIME ZONE
);

-- Import logs table
CREATE TABLE IF NOT EXISTS import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    broker VARCHAR(50) NOT NULL,
    total_records INTEGER DEFAULT 0,
    trades_imported INTEGER DEFAULT 0,
    trades_failed INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
CREATE INDEX IF NOT EXISTS idx_trades_public ON trades(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_attachments_trade_id ON trade_attachments(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_comments_trade_id ON trade_comments(trade_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_user_id ON import_logs(user_id);

-- Additional composite and specific indexes for analytics
CREATE INDEX IF NOT EXISTS idx_trades_user_id_trade_date ON trades(user_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(pnl);
CREATE INDEX IF NOT EXISTS idx_trades_tags ON trades USING GIN(tags);

-- Insert demo user (optional)
-- Password is: DemoUser25 (hashed with bcrypt)
INSERT INTO users (email, username, password_hash, full_name, is_verified, is_active)
VALUES (
    'demo@example.com',
    'demo',
    '$2b$10$8K1p/a0drtIWinzOWBOIvO4XMW8.a.V3RlN8o8N8W7gGUyN8fQKGO',
    'Demo User',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Insert demo user settings
INSERT INTO user_settings (user_id, email_notifications, public_profile, theme)
SELECT id, true, false, 'light'
FROM users 
WHERE email = 'demo@example.com'
ON CONFLICT (user_id) DO NOTHING;