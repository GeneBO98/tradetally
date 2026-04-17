const Playbook = require('../models/Playbook');
const PlaybookAdherenceService = require('../services/playbookAdherence.service');
const AchievementService = require('../services/achievementService');

function mapChecklistItems(items = []) {
  return (items || []).map(item => ({
    id: item.id,
    label: item.label,
    itemOrder: Number(item.item_order ?? item.itemOrder ?? 0),
    weight: Number(item.weight ?? 1),
    isRequired: item.is_required === true || item.isRequired === true
  }));
}

function mapPlaybook(playbook) {
  if (!playbook) return null;

  return {
    id: playbook.id,
    name: playbook.name,
    description: playbook.description,
    market: playbook.market,
    timeframe: playbook.timeframe,
    side: playbook.side,
    requiredStrategy: playbook.required_strategy,
    requiredSetup: playbook.required_setup,
    requiredTags: playbook.required_tags || [],
    requireStopLoss: playbook.require_stop_loss === true,
    minimumTargetR: playbook.minimum_target_r !== null && playbook.minimum_target_r !== undefined
      ? Number(playbook.minimum_target_r)
      : null,
    isActive: playbook.is_active !== false,
    checklistItems: mapChecklistItems(playbook.checklist_items || []),
    createdAt: playbook.created_at,
    updatedAt: playbook.updated_at
  };
}

function mapReview(review) {
  if (!review) return null;

  return {
    id: review.id,
    tradeId: review.trade_id,
    playbookId: review.playbook_id,
    playbookName: review.playbook_name,
    adherenceScore: review.adherence_score !== null && review.adherence_score !== undefined
      ? Number(review.adherence_score)
      : null,
    checklistScore: review.checklist_score !== null && review.checklist_score !== undefined
      ? Number(review.checklist_score)
      : null,
    followedPlan: review.followed_plan,
    reviewNotes: review.review_notes,
    checklistResponses: review.checklist_responses || [],
    ruleResults: review.rule_results || [],
    violationSummary: review.violation_summary || [],
    reviewedAt: review.reviewed_at,
    updatedAt: review.updated_at
  };
}

const playbookController = {
  async listPlaybooks(req, res, next) {
    try {
      const includeArchived = req.query.includeArchived === 'true';
      const playbooks = await Playbook.listByUser(req.user.id, { includeArchived });
      res.json({ playbooks: playbooks.map(mapPlaybook) });
    } catch (error) {
      next(error);
    }
  },

  async getPlaybook(req, res, next) {
    try {
      const playbook = await Playbook.findById(req.params.id, req.user.id);
      if (!playbook) {
        return res.status(404).json({ error: 'Playbook not found' });
      }

      res.json({ playbook: mapPlaybook(playbook) });
    } catch (error) {
      next(error);
    }
  },

  async createPlaybook(req, res, next) {
    try {
      const playbook = await Playbook.create(req.user.id, req.body);

      try {
        await AchievementService.checkAndAwardAchievements(req.user.id);
      } catch (achievementError) {
        console.warn(`Failed to check achievements for user ${req.user.id} after playbook creation:`, achievementError.message);
      }

      res.status(201).json({ playbook: mapPlaybook(playbook) });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A playbook with that name already exists' });
      }
      next(error);
    }
  },

  async updatePlaybook(req, res, next) {
    try {
      const playbook = await Playbook.update(req.params.id, req.user.id, req.body);
      if (!playbook) {
        return res.status(404).json({ error: 'Playbook not found' });
      }

      res.json({ playbook: mapPlaybook(playbook) });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A playbook with that name already exists' });
      }
      next(error);
    }
  },

  async archivePlaybook(req, res, next) {
    try {
      const playbook = await Playbook.archive(req.params.id, req.user.id);
      if (!playbook) {
        return res.status(404).json({ error: 'Playbook not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async getTradeReview(req, res, next) {
    try {
      const trade = await Playbook.getTradeByIdForUser(req.params.tradeId, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const review = await Playbook.getTradeReviewByTradeId(req.params.tradeId, req.user.id);
      res.json({ review: mapReview(review) });
    } catch (error) {
      next(error);
    }
  },

  async upsertTradeReview(req, res, next) {
    try {
      const trade = await Playbook.getTradeByIdForUser(req.params.tradeId, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const playbook = await Playbook.findById(req.body.playbookId, req.user.id);
      if (!playbook || playbook.is_active === false) {
        return res.status(404).json({ error: 'Playbook not found' });
      }

      const reviewMetrics = PlaybookAdherenceService.buildReview(
        playbook,
        trade,
        playbook.checklist_items || [],
        req.body.checklistResponses || []
      );

      const review = await Playbook.upsertTradeReview(req.user.id, req.params.tradeId, {
        playbookId: playbook.id,
        followedPlan: req.body.followedPlan,
        reviewNotes: req.body.reviewNotes,
        ...reviewMetrics
      });

      const hydratedReview = await Playbook.getTradeReviewByTradeId(review.trade_id, req.user.id);

      try {
        await AchievementService.checkAndAwardAchievements(req.user.id);
      } catch (achievementError) {
        console.warn(`Failed to check achievements for user ${req.user.id} after playbook review:`, achievementError.message);
      }

      res.json({
        review: mapReview(hydratedReview)
      });
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(req, res, next) {
    try {
      const analytics = await Playbook.getAnalytics(req.user.id);
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  },

  async getTradeReviewSummaries(userId, tradeIds) {
    const rows = await Playbook.getTradeReviewSummaries(userId, tradeIds);
    return rows.reduce((map, row) => {
      map.set(row.trade_id, {
        playbookId: row.playbook_id,
        playbookName: row.playbook_name,
        adherenceScore: row.adherence_score !== null && row.adherence_score !== undefined
          ? Number(row.adherence_score)
          : null,
        followedPlan: row.followed_plan,
        reviewedAt: row.reviewed_at
      });
      return map;
    }, new Map());
  },
};

module.exports = playbookController;
