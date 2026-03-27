-- Allow long option, futures, and qualified market symbols in dashboard news cache
ALTER TABLE dashboard_news_cache
ALTER COLUMN symbol TYPE VARCHAR(128);
