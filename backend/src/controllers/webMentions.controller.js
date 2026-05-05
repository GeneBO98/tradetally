const WebMentionService = require('../services/webMentionService');
const WebMentionFetcherService = require('../services/webMentionFetcherService');
const logger = require('../utils/logger');

function sendError(res, error) {
  const message = error.message || 'Web Mentions request failed';
  const status = /not found/i.test(message) ? 404 : 400;
  return res.status(status).json({ success: false, error: message });
}

const webMentionsController = {
  async getRules(req, res, next) {
    try {
      res.json({ success: true, data: await WebMentionService.listRules(req.user.id) });
    } catch (error) {
      logger.logError('Error fetching web mention rules:', error);
      next(error);
    }
  },

  async createRule(req, res) {
    try {
      const rule = await WebMentionService.createRule(req.user.id, req.body);
      res.status(201).json({ success: true, data: rule });
    } catch (error) {
      sendError(res, error);
    }
  },

  async updateRule(req, res) {
    try {
      const rule = await WebMentionService.updateRule(req.user.id, req.params.id, req.body);
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true, data: rule });
    } catch (error) {
      sendError(res, error);
    }
  },

  async deleteRule(req, res) {
    try {
      const deleted = await WebMentionService.deleteRule(req.user.id, req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  },

  async testRule(req, res, next) {
    try {
      const result = await WebMentionService.testRule(req.user.id, req.params.id);
      if (!result) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.logError('Error testing web mention rule:', error);
      next(error);
    }
  },

  async getMentions(req, res, next) {
    try {
      const mentions = await WebMentionService.listMentions(req.user.id, req.query);
      res.json({ success: true, data: mentions });
    } catch (error) {
      logger.logError('Error fetching web mentions:', error);
      next(error);
    }
  },

  async getSources(req, res, next) {
    try {
      res.json({ success: true, data: await WebMentionService.listSources() });
    } catch (error) {
      logger.logError('Error fetching web mention sources:', error);
      next(error);
    }
  },

  async getPresets(req, res, next) {
    try {
      res.json({ success: true, data: await WebMentionService.listPresets(req.user.id) });
    } catch (error) {
      logger.logError('Error fetching web mention presets:', error);
      next(error);
    }
  },

  async refreshSources(req, res, next) {
    try {
      const summary = await WebMentionFetcherService.fetchDueSources();
      res.json({ success: true, data: summary });
    } catch (error) {
      logger.logError('Error refreshing web mention sources:', error);
      next(error);
    }
  }
};

module.exports = webMentionsController;
