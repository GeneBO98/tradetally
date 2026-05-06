const db = require('../config/database');
const TierService = require('./tierService');
const NotificationPreferenceService = require('./notificationPreferenceService');
const NotificationService = require('./notificationService');
const WebMentionMatcherService = require('./webMentionMatcherService');
const { buildScopedUserCte } = require('../utils/runtimeScope');
const FundamentalDataService = require('./fundamentalDataService');
const aiService = require('../utils/aiService');

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCompanyTerms(name) {
  const companyName = String(name || '').trim();
  if (!companyName) return [];

  const cleaned = companyName.replace(/\s+/g, ' ').trim();
  const base = cleaned
    .replace(/\b(incorporated|inc|corp|corporation|company|co|ltd|limited|plc|holdings|group)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return [...new Set([cleaned, base].filter(Boolean))];
}

function parseSuggestedTerms(response) {
  if (!response) return [];

  const raw = String(response).trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return WebMentionMatcherService.normalizeTerms(parsed);
    }
    if (Array.isArray(parsed.terms)) {
      return WebMentionMatcherService.normalizeTerms(parsed.terms);
    }
  } catch (error) {
    // Fall through to line-based parsing.
  }

  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n|,/)
    .map(item => item.replace(/^[\-\*\d\.\)\s"]+/, '').replace(/["]+$/g, '').trim())
    .filter(Boolean);

  return WebMentionMatcherService.normalizeTerms(cleaned);
}

class WebMentionService {
  static validateRulePayload(data, partial = false) {
    const payload = { ...data };
    if (!partial || payload.name !== undefined) payload.name = String(payload.name || '').trim();
    if (!partial || payload.scope_type !== undefined) payload.scope_type = String(payload.scope_type || '').trim();
    if (payload.symbols !== undefined) payload.symbols = WebMentionMatcherService.normalizeSymbols(toArray(payload.symbols));
    if (payload.terms !== undefined) payload.terms = WebMentionMatcherService.normalizeTerms(toArray(payload.terms));
    if (payload.source_ids !== undefined) payload.source_ids = [...new Set(toArray(payload.source_ids))];

    if (!partial && !payload.name) throw new Error('Rule name is required');
    if (!partial && (!payload.source_ids || payload.source_ids.length === 0)) {
      throw new Error('Select at least one trusted source');
    }
    if (!partial && !['watchlist', 'holdings', 'sector', 'custom'].includes(payload.scope_type)) {
      throw new Error('Invalid scope_type');
    }
    if (payload.scope_type && !['watchlist', 'holdings', 'sector', 'custom'].includes(payload.scope_type)) {
      throw new Error('Invalid scope_type');
    }
    if (payload.source_ids !== undefined && payload.source_ids.length === 0) {
      throw new Error('Select at least one trusted source');
    }

    const threshold = payload.threshold_count !== undefined ? parseInt(payload.threshold_count, 10) : undefined;
    const termMatchThreshold = payload.term_match_threshold !== undefined ? parseInt(payload.term_match_threshold, 10) : undefined;
    const windowHours = payload.window_hours !== undefined ? parseInt(payload.window_hours, 10) : undefined;
    const cooldownHours = payload.cooldown_hours !== undefined ? parseInt(payload.cooldown_hours, 10) : undefined;

    if (threshold !== undefined) payload.threshold_count = Math.min(Math.max(threshold || 1, 1), 100);
    if (termMatchThreshold !== undefined) payload.term_match_threshold = Math.min(Math.max(termMatchThreshold || 1, 1), 25);
    if (windowHours !== undefined) payload.window_hours = Math.min(Math.max(windowHours || 24, 1), 168);
    if (cooldownHours !== undefined) payload.cooldown_hours = Math.min(Math.max(cooldownHours || 12, 1), 168);

    return payload;
  }

  static async listRules(userId) {
    const result = await db.query(`
      SELECT r.*, w.name AS watchlist_name,
        (SELECT COUNT(*)::int FROM web_mention_alerts a WHERE a.rule_id = r.id) AS alert_count
      FROM web_mention_rules r
      LEFT JOIN watchlists w ON w.id = r.watchlist_id
      WHERE r.user_id = $1
      ORDER BY r.enabled DESC, r.created_at DESC
    `, [userId]);
    return result.rows;
  }

  static async getRule(userId, ruleId) {
    const result = await db.query('SELECT * FROM web_mention_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
    return result.rows[0] || null;
  }

  static async createRule(userId, data) {
    const payload = this.validateRulePayload(data);
    const result = await db.query(`
      INSERT INTO web_mention_rules (
        user_id, name, scope_type, watchlist_id, account_identifier, sector, symbols,
        terms, source_ids, threshold_count, term_match_threshold, window_hours, cooldown_hours, enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      userId,
      payload.name,
      payload.scope_type,
      payload.watchlist_id || null,
      payload.account_identifier || null,
      payload.sector || null,
      payload.symbols || [],
      payload.terms || [],
      payload.source_ids || [],
      payload.threshold_count || 1,
      payload.term_match_threshold || 1,
      payload.window_hours || 24,
      payload.cooldown_hours || 12,
      payload.enabled !== false
    ]);
    return result.rows[0];
  }

  static async updateRule(userId, ruleId, data) {
    const payload = this.validateRulePayload(data, true);
    const allowedFields = [
      'name', 'scope_type', 'watchlist_id', 'account_identifier', 'sector',
      'symbols', 'terms', 'source_ids', 'threshold_count', 'term_match_threshold', 'window_hours', 'cooldown_hours', 'enabled'
    ];
    const updates = [];
    const values = [ruleId, userId];
    let index = 3;

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates.push(`${field} = $${index++}`);
        values.push(payload[field]);
      }
    }

    if (updates.length === 0) throw new Error('No valid fields to update');

    const result = await db.query(`
      UPDATE web_mention_rules
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, values);
    return result.rows[0] || null;
  }

  static async deleteRule(userId, ruleId) {
    const result = await db.query('DELETE FROM web_mention_rules WHERE id = $1 AND user_id = $2', [ruleId, userId]);
    return result.rowCount > 0;
  }

  static async resolveRuleScope(rule) {
    const symbols = WebMentionMatcherService.normalizeSymbols(rule.symbols || []);
    const terms = WebMentionMatcherService.normalizeTerms(rule.terms || []);

    if (rule.scope_type === 'watchlist' && rule.watchlist_id) {
      const result = await db.query(`
        SELECT wi.symbol
        FROM watchlist_items wi
        JOIN watchlists w ON w.id = wi.watchlist_id
        WHERE w.id = $1 AND w.user_id = $2
      `, [rule.watchlist_id, rule.user_id]);
      symbols.push(...result.rows.map(row => row.symbol));
    }

    if (rule.scope_type === 'holdings' || rule.scope_type === 'sector') {
      const params = [rule.user_id];
      let where = 'h.user_id = $1 AND h.total_shares > 0';
      if (rule.account_identifier) {
        params.push(rule.account_identifier);
        where += ` AND EXISTS (
          SELECT 1 FROM investment_lots l
          WHERE l.holding_id = h.id AND l.account_identifier = $${params.length}
        )`;
      }
      if (rule.scope_type === 'sector' && rule.sector) {
        params.push(rule.sector);
        where += ` AND LOWER(COALESCE(h.sector, '')) = LOWER($${params.length})`;
        terms.push(rule.sector);
      }
      const result = await db.query(`SELECT DISTINCT h.symbol FROM investment_holdings h WHERE ${where}`, params);
      symbols.push(...result.rows.map(row => row.symbol));
    }

    if (rule.sector) terms.push(rule.sector);

    return {
      symbols: WebMentionMatcherService.normalizeSymbols(symbols),
      terms: WebMentionMatcherService.normalizeTerms(terms)
    };
  }

  static async findMatchingItems(rule, limit = 20) {
    const scope = await this.resolveRuleScope(rule);
    if (scope.symbols.length === 0 && scope.terms.length === 0) {
      return [];
    }

    const sourceIds = Array.isArray(rule.source_ids) ? rule.source_ids.filter(Boolean) : [];
    const params = [rule.window_hours || 24];
    let sourceFilter = '';
    if (sourceIds.length > 0) {
      params.push(sourceIds);
      sourceFilter = `AND source_id = ANY($${params.length}::uuid[])`;
    }

    const result = await db.query(`
      SELECT *
      FROM web_mention_items
      WHERE discovered_at >= NOW() - ($1 || ' hours')::interval
      ${sourceFilter}
      ORDER BY COALESCE(published_at, discovered_at) DESC
      LIMIT 500
    `, params);

    const minimumTermMatches = scope.terms.length > 0
      ? Math.min(rule.term_match_threshold || 1, scope.terms.length)
      : 0;

    return result.rows
      .map(item => {
        const itemSymbols = WebMentionMatcherService.normalizeSymbols(item.matched_symbols || []);
        const itemTerms = WebMentionMatcherService.normalizeTerms(item.matched_terms || []);
        const dynamicMatch = WebMentionMatcherService.matchItem(item, scope.symbols, scope.terms);
        const matched_symbols = [...new Set([
          ...itemSymbols.filter(symbol => scope.symbols.includes(symbol)),
          ...dynamicMatch.matched_symbols
        ])];
        const matched_terms = [...new Set([
          ...itemTerms.filter(term => scope.terms.includes(term)),
          ...dynamicMatch.matched_terms
        ])];
        return { ...item, matched_symbols, matched_terms };
      })
      .filter(item => {
        if (scope.terms.length > 0) {
          return item.matched_terms.length >= minimumTermMatches;
        }
        return item.matched_symbols.length > 0;
      })
      .sort((a, b) => {
        const termDelta = (b.matched_terms?.length || 0) - (a.matched_terms?.length || 0);
        if (termDelta !== 0) return termDelta;

        const symbolDelta = (b.matched_symbols?.length || 0) - (a.matched_symbols?.length || 0);
        if (symbolDelta !== 0) return symbolDelta;

        const aTime = new Date(a.published_at || a.discovered_at || 0).getTime();
        const bTime = new Date(b.published_at || b.discovered_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  static async testRule(userId, ruleId) {
    const rule = await this.getRule(userId, ruleId);
    if (!rule) return null;
    const scope = await this.resolveRuleScope(rule);
    const matches = await this.findMatchingItems(rule, 10);
    return {
      rule,
      scope,
      article_count: matches.length,
      threshold_met: matches.length >= rule.threshold_count,
      matches
    };
  }

  static async listMentions(userId, filters = {}) {
    const rules = await this.listRules(userId);
    const ruleId = filters.rule_id || rules[0]?.id;
    if (!ruleId) return [];
    const rule = rules.find(item => item.id === ruleId) || await this.getRule(userId, ruleId);
    if (!rule) return [];
    return this.findMatchingItems(rule, Math.min(parseInt(filters.limit, 10) || 50, 100));
  }

  static async listSources() {
    const result = await db.query(`
      SELECT id, name, source_type, domain, feed_url, enabled, fetch_interval_minutes, last_fetched_at, last_fetch_status, last_fetch_error
      FROM web_mention_sources
      WHERE enabled = true
      ORDER BY enabled DESC, name ASC
    `);
    return result.rows.map(row => ({
      ...row,
      trusted: true,
      trust_note: row.source_type === 'finnhub_cache'
        ? 'Uses TradeTally cached market news data'
        : 'Curated syndication feed selected for trusted, repeatable crawling'
    }));
  }

  static async listPresets(userId) {
    const result = await db.query(`
      SELECT *
      FROM web_mention_presets
      WHERE user_id IS NULL OR user_id = $1
      ORDER BY is_system DESC, name ASC
    `, [userId]);
    return result.rows;
  }

  static async createPreset(userId, data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Preset name is required');

    const sector = data.sector ? String(data.sector).trim() : null;
    const terms = WebMentionMatcherService.normalizeTerms(toArray(data.terms));
    const symbols = WebMentionMatcherService.normalizeSymbols(toArray(data.symbols));

    if (terms.length === 0 && symbols.length === 0 && !sector) {
      throw new Error('Add at least one term, symbol, or sector to save a preset');
    }

    const result = await db.query(`
      INSERT INTO web_mention_presets (user_id, name, sector, terms, symbols, is_system)
      VALUES ($1, $2, $3, $4, $5, false)
      RETURNING *
    `, [userId, name, sector, terms, symbols]);

    return result.rows[0];
  }

  static async suggestRuleTerms(userId, data = {}) {
    const symbols = WebMentionMatcherService.normalizeSymbols(toArray(data.symbols));
    const suggestions = [];
    const diagnostics = [];

    for (const symbol of symbols) {
      let profile = null;
      try {
        profile = await FundamentalDataService.getProfile(symbol);
      } catch (error) {
        profile = null;
      }

      const companyTerms = normalizeCompanyTerms(profile?.name);
      const symbolPattern = new RegExp(`\\$?${escapeRegex(symbol)}`, 'i');
      let aiTerms = [];
      let aiPrompt = null;
      let aiUsed = false;
      let aiProvider = null;
      let aiStatus = 'not_attempted';
      let aiSkipReason = null;
      let aiError = null;

      try {
        const settings = await aiService.getUserSettings(userId);
        if (!settings.provider) {
          aiStatus = 'skipped';
          aiSkipReason = 'no_provider_configured';
        } else if (!aiService.isProviderConfigured(settings)) {
          aiProvider = settings.provider;
          aiStatus = 'skipped';
          aiSkipReason = 'provider_not_configured';
        } else {
          aiProvider = settings.provider;
          aiStatus = 'requested';
          aiPrompt = [
            'You are helping build a market-monitoring alert rule.',
            `Ticker: ${symbol}`,
            `Company: ${profile?.name || 'Unknown'}`,
            'Return 6 to 10 short terms or phrases that are likely to matter for market-moving coverage of this symbol.',
            'Focus on company, product, management, regulation, macro, supply chain, and industry catalyst terms.',
            'Respond as strict JSON: {"terms":["term 1","term 2"]}'
          ].join('\n');
          const aiResponse = await aiService.generateResponse(userId, aiPrompt, {
            maxTokens: 220,
            temperature: 0.2
          });
          aiTerms = parseSuggestedTerms(aiResponse);
          aiUsed = aiTerms.length > 0;
          aiStatus = aiUsed ? 'used' : 'empty';
          if (!aiUsed) {
            aiSkipReason = 'response_had_no_parsable_terms';
          }
        }
      } catch (error) {
        aiTerms = [];
        aiStatus = 'failed';
        aiError = error.message || 'Unknown AI error';
      }

      const terms = WebMentionMatcherService.normalizeTerms([
        ...companyTerms,
        ...companyTerms.map(term => term.replace(symbolPattern, '').trim()).filter(Boolean),
        ...aiTerms,
        symbol,
        `$${symbol}`
      ]);

      suggestions.push({
        symbol,
        company_name: profile?.name || null,
        terms,
        aliases: [...new Set([symbol, `$${symbol}`])],
        generation: {
          ai_used: aiUsed,
          ai_provider: aiProvider,
          ai_status: aiStatus,
          ai_skip_reason: aiSkipReason,
          ai_error: aiError,
          ai_prompt: aiPrompt,
          ai_term_count: aiTerms.length,
          fallback_term_count: WebMentionMatcherService.normalizeTerms([
            ...companyTerms,
            ...companyTerms.map(term => term.replace(symbolPattern, '').trim()).filter(Boolean),
            symbol,
            `$${symbol}`
          ]).length
        }
      });

      diagnostics.push({
        symbol,
        ai_used: aiUsed,
        ai_provider: aiProvider,
        ai_status: aiStatus,
        ai_skip_reason: aiSkipReason,
        ai_error: aiError,
        ai_prompt: aiPrompt,
        ai_term_count: aiTerms.length
      });
    }

    return {
      suggestions,
      terms: WebMentionMatcherService.normalizeTerms(suggestions.flatMap(item => item.terms)),
      aliases: [...new Set(suggestions.flatMap(item => item.aliases))],
      diagnostics
    };
  }

  static async evaluateRule(rule) {
    const preferenceEnabled = await NotificationPreferenceService.isNotificationEnabled(rule.user_id, 'notify_web_mentions');
    if (!preferenceEnabled) return { skipped: 'preference_disabled' };

    const tier = await TierService.getUserTier(rule.user_id);
    if (tier !== 'pro') return { skipped: 'not_pro' };

    const matches = await this.findMatchingItems(rule, 100);
    const distinctMatches = [...new Map(matches.map(item => [item.url_hash, item])).values()];
    if (distinctMatches.length < rule.threshold_count) {
      await db.query('UPDATE web_mention_rules SET last_evaluated_at = NOW() WHERE id = $1', [rule.id]);
      return { alerted: false, article_count: distinctMatches.length };
    }

    const cooldown = await db.query(`
      SELECT id
      FROM web_mention_alerts
      WHERE rule_id = $1
        AND created_at > NOW() - ($2 || ' hours')::interval
      LIMIT 1
    `, [rule.id, rule.cooldown_hours]);
    if (cooldown.rows.length > 0) return { skipped: 'cooldown', article_count: distinctMatches.length };

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - (rule.window_hours || 24) * 60 * 60 * 1000);
    const topLinks = distinctMatches.slice(0, 5).map(item => ({
      title: item.title,
      url: item.url,
      source: item.source_name,
      published_at: item.published_at
    }));
    const payload = {
      rule_id: rule.id,
      rule_name: rule.name,
      scope_type: rule.scope_type,
      matched_terms: [...new Set(distinctMatches.flatMap(item => item.matched_terms || []))],
      matched_symbols: [...new Set(distinctMatches.flatMap(item => item.matched_symbols || []))],
      sector: rule.sector,
      article_count: distinctMatches.length,
      threshold_count: rule.threshold_count,
      window_hours: rule.window_hours,
      top_links: topLinks,
      message: `${rule.name} matched ${distinctMatches.length} article${distinctMatches.length === 1 ? '' : 's'} in ${rule.window_hours} hour${rule.window_hours === 1 ? '' : 's'}`,
      timestamp: new Date().toISOString()
    };

    const notificationResult = await db.query(`
      INSERT INTO notifications (user_id, type, data)
      VALUES ($1, 'web_mention_alert', $2)
      RETURNING id
    `, [rule.user_id, JSON.stringify(payload)]);

    await db.query(`
      INSERT INTO web_mention_alerts (
        rule_id, user_id, window_start, window_end, article_count, mention_item_ids, notification_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (rule_id, window_start, window_end) DO NOTHING
    `, [rule.id, rule.user_id, windowStart, windowEnd, distinctMatches.length, distinctMatches.map(item => item.id), notificationResult.rows[0].id]);

    await NotificationService.sendSSENotification(rule.user_id, {
      type: 'web_mention_alert',
      data: payload
    });
    await db.query('UPDATE web_mention_rules SET last_evaluated_at = NOW() WHERE id = $1', [rule.id]);
    return { alerted: true, article_count: distinctMatches.length };
  }

  static async evaluateRules() {
    const scope = buildScopedUserCte(1, 'scoped_user');
    const query = `
      ${scope.enabled ? `WITH ${scope.cte}` : ''}
      SELECT r.*
      FROM web_mention_rules r
      WHERE r.enabled = true
      ${scope.enabled ? `AND r.user_id IN (SELECT id FROM ${scope.ref})` : ''}
      ORDER BY r.last_evaluated_at NULLS FIRST
      LIMIT $${scope.params.length + 1}
    `;
    const result = await db.query(query, [...scope.params, parseInt(process.env.WEB_MENTION_MAX_RULES_PER_RUN || '100', 10)]);
    const summary = { rules: result.rows.length, alerted: 0, skipped: 0 };
    for (const rule of result.rows) {
      const evaluation = await this.evaluateRule(rule);
      if (evaluation.alerted) summary.alerted++;
      if (evaluation.skipped) summary.skipped++;
    }
    return summary;
  }

  static async cleanupRetention() {
    await db.query("DELETE FROM web_mention_items WHERE discovered_at < NOW() - INTERVAL '30 days'");
    await db.query("DELETE FROM web_mention_alerts WHERE created_at < NOW() - INTERVAL '90 days'");
  }
}

module.exports = WebMentionService;
