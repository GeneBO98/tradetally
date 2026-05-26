-- Web Mentions
-- Pro-only alerts based on curated RSS/news sources and cached Finnhub news.

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_web_mentions BOOLEAN DEFAULT true;
COMMENT ON COLUMN users.notify_web_mentions IS 'Send notifications when Web Mention rules reach their configured thresholds';

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE TABLE IF NOT EXISTS web_mention_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'rss',
  feed_url TEXT,
  domain VARCHAR(160),
  enabled BOOLEAN NOT NULL DEFAULT true,
  fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  last_fetch_status VARCHAR(30),
  last_fetch_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT web_mention_sources_type_check CHECK (source_type IN ('rss', 'atom', 'finnhub_cache'))
);

CREATE TABLE IF NOT EXISTS web_mention_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sector VARCHAR(100),
  terms TEXT[] NOT NULL DEFAULT '{}',
  symbols TEXT[] NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT web_mention_presets_name_user_unique UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS web_mention_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  scope_type VARCHAR(30) NOT NULL,
  watchlist_id UUID REFERENCES watchlists(id) ON DELETE SET NULL,
  account_identifier VARCHAR(100),
  sector VARCHAR(100),
  symbols TEXT[] NOT NULL DEFAULT '{}',
  terms TEXT[] NOT NULL DEFAULT '{}',
  threshold_count INTEGER NOT NULL DEFAULT 3,
  window_hours INTEGER NOT NULL DEFAULT 24,
  cooldown_hours INTEGER NOT NULL DEFAULT 12,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_evaluated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT web_mention_rules_scope_check CHECK (scope_type IN ('watchlist', 'holdings', 'sector', 'custom')),
  CONSTRAINT web_mention_rules_threshold_check CHECK (threshold_count BETWEEN 1 AND 100),
  CONSTRAINT web_mention_rules_window_check CHECK (window_hours BETWEEN 1 AND 168),
  CONSTRAINT web_mention_rules_cooldown_check CHECK (cooldown_hours BETWEEN 1 AND 168)
);

CREATE TABLE IF NOT EXISTS web_mention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES web_mention_sources(id) ON DELETE SET NULL,
  source_name VARCHAR(120),
  source_domain VARCHAR(160),
  url TEXT NOT NULL,
  url_hash VARCHAR(64) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  snippet TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  matched_symbols TEXT[] NOT NULL DEFAULT '{}',
  matched_terms TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS web_mention_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES web_mention_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  article_count INTEGER NOT NULL,
  mention_item_ids UUID[] NOT NULL DEFAULT '{}',
  notification_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT web_mention_alerts_rule_window_unique UNIQUE(rule_id, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS idx_web_mention_sources_enabled ON web_mention_sources(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_mention_sources_name ON web_mention_sources(name);
CREATE INDEX IF NOT EXISTS idx_web_mention_rules_user ON web_mention_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_web_mention_rules_enabled ON web_mention_rules(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_web_mention_items_discovered ON web_mention_items(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_mention_items_symbols ON web_mention_items USING GIN(matched_symbols);
CREATE INDEX IF NOT EXISTS idx_web_mention_items_terms ON web_mention_items USING GIN(matched_terms);
CREATE INDEX IF NOT EXISTS idx_web_mention_alerts_user ON web_mention_alerts(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_mention_system_presets_name ON web_mention_presets(name) WHERE user_id IS NULL;

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
VALUES
  ('SEC Press Releases', 'rss', 'https://www.sec.gov/news/pressreleases.rss', 'sec.gov', 120),
  ('Federal Reserve Press Releases', 'rss', 'https://www.federalreserve.gov/feeds/press_all.xml', 'federalreserve.gov', 120),
  ('Yahoo Finance Top Stories', 'rss', 'https://finance.yahoo.com/news/rssindex', 'finance.yahoo.com', 60),
  ('MarketWatch Top Stories', 'rss', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', 'marketwatch.com', 60),
  ('Finnhub Cached Company News', 'finnhub_cache', NULL, 'finnhub.io', 60)
ON CONFLICT (name) DO NOTHING;

INSERT INTO web_mention_presets (user_id, name, sector, terms, is_system)
SELECT NULL, 'Energy Monitor', 'Energy', ARRAY['oil', 'natural gas', 'uranium', 'nuclear', 'nuclear fusion', 'grid', 'renewables'], true
WHERE NOT EXISTS (SELECT 1 FROM web_mention_presets WHERE user_id IS NULL AND name = 'Energy Monitor');

INSERT INTO web_mention_presets (user_id, name, sector, terms, is_system)
SELECT NULL, 'Rate Sensitive', NULL, ARRAY['interest rates', 'federal reserve', 'inflation', 'treasury yields', 'rate cut', 'rate hike'], true
WHERE NOT EXISTS (SELECT 1 FROM web_mention_presets WHERE user_id IS NULL AND name = 'Rate Sensitive');

INSERT INTO web_mention_presets (user_id, name, sector, terms, is_system)
SELECT NULL, 'Semiconductors', 'Technology', ARRAY['semiconductor', 'chip', 'AI accelerator', 'data center', 'foundry', 'export controls'], true
WHERE NOT EXISTS (SELECT 1 FROM web_mention_presets WHERE user_id IS NULL AND name = 'Semiconductors');

INSERT INTO features (feature_key, feature_name, description, required_tier, is_active)
VALUES ('web_mentions', 'Web Mentions', 'Monitor curated financial news sources for holdings, watchlists, sectors, and custom terms', 'pro', true)
ON CONFLICT (feature_key) DO NOTHING;
