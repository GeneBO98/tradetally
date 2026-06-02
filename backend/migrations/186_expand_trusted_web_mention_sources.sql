INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'SEC Speeches', 'rss', 'https://www.sec.gov/news/speeches.rss', 'sec.gov', 180
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'SEC Speeches');

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'U.S. Treasury Press Releases', 'rss', 'https://home.treasury.gov/news/press-releases/rss.xml', 'treasury.gov', 180
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'U.S. Treasury Press Releases');

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'Federal Reserve Speeches', 'rss', 'https://www.federalreserve.gov/feeds/speeches.xml', 'federalreserve.gov', 180
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'Federal Reserve Speeches');

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'IMF News', 'rss', 'https://www.imf.org/en/News/RSS', 'imf.org', 240
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'IMF News');

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'World Bank News', 'rss', 'https://www.worldbank.org/en/news/all?rss=true', 'worldbank.org', 240
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'World Bank News');

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'Nasdaq Market Headlines', 'rss', 'https://www.nasdaq.com/feed/rssoutbound?category=Markets', 'nasdaq.com', 90
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'Nasdaq Market Headlines');

INSERT INTO web_mention_sources (name, source_type, feed_url, domain, fetch_interval_minutes)
SELECT 'Nasdaq Stocks News', 'rss', 'https://www.nasdaq.com/feed/rssoutbound?category=Stocks', 'nasdaq.com', 90
WHERE NOT EXISTS (SELECT 1 FROM web_mention_sources WHERE name = 'Nasdaq Stocks News');
