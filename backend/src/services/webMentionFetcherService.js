const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../config/database');
const logger = require('../utils/logger');
const WebMentionMatcherService = require('./webMentionMatcherService');

const USER_AGENT = 'TradeTally Web Mentions/1.0 (+https://tradetally.io)';
const MAX_ITEMS_PER_SOURCE = parseInt(process.env.WEB_MENTION_MAX_ITEMS_PER_SOURCE || '40', 10);

class WebMentionFetcherService {
  static async getSourcesByIds(sourceIds = []) {
    const normalizedIds = Array.from(new Set((sourceIds || []).filter(Boolean)));
    if (normalizedIds.length === 0) return [];

    const result = await db.query(`
      SELECT *
      FROM web_mention_sources
      WHERE enabled = true
        AND id = ANY($1::uuid[])
      ORDER BY name ASC
    `, [normalizedIds]);

    return result.rows;
  }

  static async getDueSources() {
    const result = await db.query(`
      SELECT *
      FROM web_mention_sources
      WHERE enabled = true
        AND (
          last_fetched_at IS NULL
          OR last_fetched_at < NOW() - (fetch_interval_minutes || ' minutes')::interval
        )
      ORDER BY last_fetched_at NULLS FIRST
      LIMIT $1
    `, [parseInt(process.env.WEB_MENTION_MAX_SOURCES_PER_RUN || '10', 10)]);

    return result.rows;
  }

  static parseFeed(xml, source) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const items = [];

    $('item, entry').each((_, element) => {
      if (items.length >= MAX_ITEMS_PER_SOURCE) return false;
      const node = $(element);
      const title = node.find('title').first().text().trim();
      const link = node.find('link').first().attr('href') || node.find('link').first().text().trim();
      const snippet = node.find('description, summary, content').first().text().replace(/\s+/g, ' ').trim();
      const publishedRaw = node.find('pubDate, published, updated').first().text().trim();

      if (!title || !link) return;

      items.push({
        source_id: source.id,
        source_name: source.name,
        source_domain: source.domain,
        url: link,
        title,
        snippet,
        published_at: publishedRaw ? new Date(publishedRaw) : null,
        metadata: { source_type: source.source_type }
      });
    });

    return items;
  }

  static async fetchRssSource(source) {
    const response = await axios.get(source.feed_url, {
      timeout: 10000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
      },
      maxContentLength: 2 * 1024 * 1024
    });

    return this.parseFeed(response.data, source);
  }

  static async fetchFinnhubCacheSource(source) {
    const result = await db.query(`
      SELECT symbol, news_items
      FROM dashboard_news_cache
      WHERE fetched_at > NOW() - INTERVAL '7 days'
      ORDER BY fetched_at DESC
      LIMIT 200
    `);

    const items = [];
    for (const row of result.rows) {
      const newsItems = Array.isArray(row.news_items) ? row.news_items : [];
      for (const item of newsItems) {
        if (items.length >= MAX_ITEMS_PER_SOURCE) break;
        const url = item.url || item.link;
        const title = item.headline || item.title;
        if (!url || !title) continue;
        items.push({
          source_id: source.id,
          source_name: source.name,
          source_domain: source.domain,
          url,
          title,
          snippet: item.summary || '',
          published_at: item.datetime ? new Date(item.datetime * 1000) : null,
          matched_symbols: [row.symbol],
          metadata: { source_type: source.source_type, symbol: row.symbol, source: item.source }
        });
      }
    }

    return items;
  }

  static async upsertItems(items) {
    let inserted = 0;
    for (const item of items) {
      const urlHash = WebMentionMatcherService.hashUrl(item.url);
      const result = await db.query(`
        INSERT INTO web_mention_items (
          source_id, source_name, source_domain, url, url_hash, title, snippet,
          published_at, matched_symbols, matched_terms, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (url_hash) DO UPDATE SET
          matched_symbols = (
            SELECT ARRAY(SELECT DISTINCT unnest(web_mention_items.matched_symbols || EXCLUDED.matched_symbols))
          ),
          matched_terms = (
            SELECT ARRAY(SELECT DISTINCT unnest(web_mention_items.matched_terms || EXCLUDED.matched_terms))
          ),
          metadata = web_mention_items.metadata || EXCLUDED.metadata
        RETURNING (xmax = 0) AS inserted
      `, [
        item.source_id,
        item.source_name,
        item.source_domain,
        item.url,
        urlHash,
        item.title,
        item.snippet || null,
        item.published_at && !Number.isNaN(item.published_at.getTime()) ? item.published_at : null,
        item.matched_symbols || [],
        item.matched_terms || [],
        JSON.stringify(item.metadata || {})
      ]);
      if (result.rows[0]?.inserted) inserted++;
    }
    return inserted;
  }

  static async fetchSource(source) {
    try {
      const items = source.source_type === 'finnhub_cache'
        ? await this.fetchFinnhubCacheSource(source)
        : await this.fetchRssSource(source);

      const inserted = await this.upsertItems(items);
      await db.query(`
        UPDATE web_mention_sources
        SET last_fetched_at = NOW(), last_fetch_status = 'success', last_fetch_error = NULL, updated_at = NOW()
        WHERE id = $1
      `, [source.id]);

      return { fetched: items.length, inserted };
    } catch (error) {
      logger.logError(`[WEB-MENTIONS] Failed to fetch source ${source.name}:`, error);
      await db.query(`
        UPDATE web_mention_sources
        SET last_fetched_at = NOW(), last_fetch_status = 'error', last_fetch_error = $2, updated_at = NOW()
        WHERE id = $1
      `, [source.id, String(error.message || error).slice(0, 1000)]);
      return { fetched: 0, inserted: 0, error: error.message };
    }
  }

  static async fetchDueSources() {
    const sources = await this.getDueSources();
    const summary = { sources: sources.length, fetched: 0, inserted: 0, errors: 0 };

    for (const source of sources) {
      const result = await this.fetchSource(source);
      summary.fetched += result.fetched || 0;
      summary.inserted += result.inserted || 0;
      if (result.error) summary.errors++;
    }

    return summary;
  }

  static async fetchSelectedSources(sourceIds = []) {
    const sources = await this.getSourcesByIds(sourceIds);
    const summary = { sources: sources.length, fetched: 0, inserted: 0, errors: 0 };

    for (const source of sources) {
      const result = await this.fetchSource(source);
      summary.fetched += result.fetched || 0;
      summary.inserted += result.inserted || 0;
      if (result.error) summary.errors++;
    }

    return summary;
  }
}

module.exports = WebMentionFetcherService;
