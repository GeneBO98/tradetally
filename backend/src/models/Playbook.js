const db = require('../config/database');

class Playbook {
  static async listByUser(userId, { includeArchived = false } = {}) {
    const result = await db.query(
      `
        SELECT
          p.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pci.id,
                'label', pci.label,
                'item_order', pci.item_order,
                'weight', pci.weight,
                'is_required', pci.is_required
              )
              ORDER BY pci.item_order ASC, pci.created_at ASC
            ) FILTER (WHERE pci.id IS NOT NULL),
            '[]'::json
          ) AS checklist_items
        FROM playbooks p
        LEFT JOIN playbook_checklist_items pci ON pci.playbook_id = p.id
        WHERE p.user_id = $1
          AND ($2::boolean = true OR p.is_active = true)
        GROUP BY p.id
        ORDER BY p.is_active DESC, LOWER(p.name) ASC
      `,
      [userId, includeArchived]
    );

    return result.rows;
  }

  static async findById(id, userId) {
    const result = await db.query(
      `
        SELECT
          p.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pci.id,
                'label', pci.label,
                'item_order', pci.item_order,
                'weight', pci.weight,
                'is_required', pci.is_required
              )
              ORDER BY pci.item_order ASC, pci.created_at ASC
            ) FILTER (WHERE pci.id IS NOT NULL),
            '[]'::json
          ) AS checklist_items
        FROM playbooks p
        LEFT JOIN playbook_checklist_items pci ON pci.playbook_id = p.id
        WHERE p.id = $1 AND p.user_id = $2
        GROUP BY p.id
      `,
      [id, userId]
    );

    return result.rows[0] || null;
  }

  static async create(userId, playbook) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
          INSERT INTO playbooks (
            user_id, name, description, market, timeframe, side,
            required_strategy, required_setup, required_tags,
            require_stop_loss, minimum_target_r, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
          RETURNING *
        `,
        [
          userId,
          playbook.name,
          playbook.description || null,
          playbook.market || null,
          playbook.timeframe || null,
          playbook.side || 'both',
          playbook.requiredStrategy || null,
          playbook.requiredSetup || null,
          playbook.requiredTags || [],
          playbook.requireStopLoss === true,
          playbook.minimumTargetR ?? null
        ]
      );

      await this.replaceChecklistItems(client, result.rows[0].id, playbook.checklistItems || []);
      await client.query('COMMIT');
      return this.findById(result.rows[0].id, userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(id, userId, playbook) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
          UPDATE playbooks
          SET
            name = $3,
            description = $4,
            market = $5,
            timeframe = $6,
            side = $7,
            required_strategy = $8,
            required_setup = $9,
            required_tags = $10,
            require_stop_loss = $11,
            minimum_target_r = $12
          WHERE id = $1 AND user_id = $2
          RETURNING *
        `,
        [
          id,
          userId,
          playbook.name,
          playbook.description || null,
          playbook.market || null,
          playbook.timeframe || null,
          playbook.side || 'both',
          playbook.requiredStrategy || null,
          playbook.requiredSetup || null,
          playbook.requiredTags || [],
          playbook.requireStopLoss === true,
          playbook.minimumTargetR ?? null
        ]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      await this.replaceChecklistItems(client, id, playbook.checklistItems || []);
      await client.query('COMMIT');
      return this.findById(id, userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async archive(id, userId) {
    const result = await db.query(
      `
        UPDATE playbooks
        SET is_active = false
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [id, userId]
    );

    return result.rows[0] || null;
  }

  static async replaceChecklistItems(client, playbookId, checklistItems) {
    await client.query('DELETE FROM playbook_checklist_items WHERE playbook_id = $1', [playbookId]);

    for (let index = 0; index < checklistItems.length; index += 1) {
      const item = checklistItems[index];
      await client.query(
        `
          INSERT INTO playbook_checklist_items (
            playbook_id, label, item_order, weight, is_required
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          playbookId,
          item.label,
          item.itemOrder ?? index,
          item.weight ?? 1,
          item.isRequired === true
        ]
      );
    }
  }

  static async getTradeByIdForUser(tradeId, userId) {
    const result = await db.query(
      `
        SELECT
          t.id,
          t.user_id,
          t.symbol,
          t.side,
          t.strategy,
          t.setup,
          t.tags,
          t.entry_price,
          t.stop_loss,
          t.take_profit,
          t.take_profit_targets,
          t.entry_time,
          t.exit_time,
          t.pnl,
          t.r_value
        FROM trades t
        WHERE t.id = $1 AND t.user_id = $2
      `,
      [tradeId, userId]
    );

    return result.rows[0] || null;
  }

  static async upsertTradeReview(userId, tradeId, payload) {
    const result = await db.query(
      `
        INSERT INTO trade_playbook_reviews (
          user_id, trade_id, playbook_id, adherence_score, checklist_score,
          followed_plan, review_notes, checklist_responses, rule_results,
          violation_summary, reviewed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (trade_id)
        DO UPDATE SET
          playbook_id = EXCLUDED.playbook_id,
          adherence_score = EXCLUDED.adherence_score,
          checklist_score = EXCLUDED.checklist_score,
          followed_plan = EXCLUDED.followed_plan,
          review_notes = EXCLUDED.review_notes,
          checklist_responses = EXCLUDED.checklist_responses,
          rule_results = EXCLUDED.rule_results,
          violation_summary = EXCLUDED.violation_summary,
          reviewed_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        userId,
        tradeId,
        payload.playbookId,
        payload.adherenceScore,
        payload.checklistScore,
        payload.followedPlan,
        payload.reviewNotes || null,
        JSON.stringify(payload.checklistResponses || []),
        JSON.stringify(payload.ruleResults || []),
        JSON.stringify(payload.violationSummary || [])
      ]
    );

    return result.rows[0];
  }

  static async getTradeReviewByTradeId(tradeId, userId) {
    const result = await db.query(
      `
        SELECT
          r.*,
          p.name AS playbook_name
        FROM trade_playbook_reviews r
        INNER JOIN playbooks p ON p.id = r.playbook_id
        WHERE r.trade_id = $1 AND r.user_id = $2
      `,
      [tradeId, userId]
    );

    return result.rows[0] || null;
  }

  static async getTradeReviewSummaries(userId, tradeIds) {
    if (!Array.isArray(tradeIds) || tradeIds.length === 0) {
      return [];
    }

    const result = await db.query(
      `
        SELECT
          r.trade_id,
          r.playbook_id,
          p.name AS playbook_name,
          r.adherence_score,
          r.followed_plan,
          r.reviewed_at
        FROM trade_playbook_reviews r
        INNER JOIN playbooks p ON p.id = r.playbook_id
        WHERE r.user_id = $1
          AND r.trade_id = ANY($2::uuid[])
      `,
      [userId, tradeIds]
    );

    return result.rows;
  }

  static async getAnalytics(userId) {
    const summaryResult = await db.query(
      `
        WITH reviewed AS (
          SELECT
            p.id,
            p.name,
            p.side,
            p.timeframe,
            p.is_active,
            r.adherence_score,
            r.followed_plan,
            t.pnl,
            t.r_value
          FROM playbooks p
          LEFT JOIN trade_playbook_reviews r
            ON r.playbook_id = p.id AND r.user_id = $1
          LEFT JOIN trades t
            ON t.id = r.trade_id AND t.user_id = $1
          WHERE p.user_id = $1
        )
        SELECT
          id,
          name,
          side,
          timeframe,
          is_active,
          COUNT(pnl) FILTER (WHERE pnl IS NOT NULL)::integer AS reviewed_trade_count,
          ROUND(COALESCE(AVG(adherence_score), 0)::numeric, 2) AS adherence_average,
          ROUND(COALESCE(AVG(pnl), 0)::numeric, 2) AS avg_pnl,
          ROUND(
            COALESCE(
              100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::numeric
              / NULLIF(COUNT(pnl), 0),
              0
            ),
            2
          ) AS win_rate,
          ROUND(COALESCE(AVG(r_value) FILTER (WHERE r_value IS NOT NULL), 0)::numeric, 2) AS avg_r,
          ROUND(
            COALESCE(
              SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END)
              / NULLIF(ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)), 0),
              0
            )::numeric,
            2
          ) AS profit_factor,
          COUNT(*) FILTER (WHERE followed_plan = true)::integer AS followed_count,
          COUNT(*) FILTER (WHERE followed_plan = false)::integer AS broken_count,
          ROUND(COALESCE(AVG(pnl) FILTER (WHERE followed_plan = true), 0)::numeric, 2) AS followed_avg_pnl,
          ROUND(COALESCE(AVG(pnl) FILTER (WHERE followed_plan = false), 0)::numeric, 2) AS broken_avg_pnl
        FROM reviewed
        GROUP BY id, name, side, timeframe, is_active
        ORDER BY LOWER(name)
      `,
      [userId]
    );

    const recentTradesResult = await db.query(
      `
        SELECT
          r.playbook_id,
          t.id AS trade_id,
          t.symbol,
          t.trade_date,
          t.pnl,
          t.r_value,
          r.adherence_score,
          r.followed_plan
        FROM trade_playbook_reviews r
        INNER JOIN trades t ON t.id = r.trade_id
        WHERE r.user_id = $1
        ORDER BY r.reviewed_at DESC
        LIMIT 20
      `,
      [userId]
    );

    const overviewResult = await db.query(
      `
        SELECT
          COUNT(*)::integer AS playbook_count,
          COUNT(*) FILTER (WHERE is_active = true)::integer AS active_playbook_count
        FROM playbooks
        WHERE user_id = $1
      `,
      [userId]
    );

    const reviewCountsResult = await db.query(
      `
        SELECT
          COUNT(*)::integer AS reviewed_trade_count,
          COUNT(*) FILTER (WHERE followed_plan = true)::integer AS followed_trade_count,
          COUNT(*) FILTER (WHERE followed_plan = false)::integer AS broken_trade_count,
          ROUND(COALESCE(AVG(adherence_score), 0)::numeric, 2) AS adherence_average
        FROM trade_playbook_reviews
        WHERE user_id = $1
      `,
      [userId]
    );

    return {
      overview: {
        ...(overviewResult.rows[0] || { playbook_count: 0, active_playbook_count: 0 }),
        ...(reviewCountsResult.rows[0] || {
          reviewed_trade_count: 0,
          followed_trade_count: 0,
          broken_trade_count: 0,
          adherence_average: 0
        })
      },
      playbooks: summaryResult.rows,
      recentTrades: recentTradesResult.rows
    };
  }
}

module.exports = Playbook;
