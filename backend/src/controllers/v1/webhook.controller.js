const { sendV1Error, sendV1Paginated } = require('../../utils/apiResponse');
const { webhookService } = require('../../services/webhookService');

function parseLimitOffset(query = {}, defaultLimit = 50) {
  const parsedLimit = parseInt(query.limit ?? `${defaultLimit}`, 10);
  const parsedOffset = parseInt(query.offset ?? '0', 10);

  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : defaultLimit;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  return { limit, offset };
}

function buildPagination(limit, offset, total, returnedCount) {
  return {
    limit,
    offset,
    total,
    hasMore: offset + returnedCount < total
  };
}

const webhookV1Controller = {
  async listWebhooks(req, res, next) {
    try {
      const { limit, offset } = parseLimitOffset(req.query, 50);
      const { webhooks, total } = await webhookService.listWebhooks(req.user.id, { limit, offset });

      return sendV1Paginated(res, webhooks, buildPagination(limit, offset, total, webhooks.length));
    } catch (error) {
      return next(error);
    }
  },

  async createWebhook(req, res, next) {
    try {
      const webhook = await webhookService.createWebhook(req.user.id, req.body || {});
      return res.status(201).json({ webhook });
    } catch (error) {
      if (error.code === 'INVALID_EVENT_TYPES') {
        return sendV1Error(res, 400, 'BAD_REQUEST', error.message);
      }
      return next(error);
    }
  },

  async updateWebhook(req, res, next) {
    try {
      const webhook = await webhookService.updateWebhook(req.user.id, req.params.id, req.body || {});
      if (!webhook) {
        return sendV1Error(res, 404, 'NOT_FOUND', 'Webhook not found');
      }

      return res.json({ webhook });
    } catch (error) {
      if (error.code === 'INVALID_EVENT_TYPES') {
        return sendV1Error(res, 400, 'BAD_REQUEST', error.message);
      }
      return next(error);
    }
  },

  async deleteWebhook(req, res, next) {
    try {
      const deleted = await webhookService.deleteWebhook(req.user.id, req.params.id);
      if (!deleted) {
        return sendV1Error(res, 404, 'NOT_FOUND', 'Webhook not found');
      }

      return res.json({
        deleted: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      return next(error);
    }
  },

  async testWebhook(req, res, next) {
    try {
      const result = await webhookService.triggerTestDelivery(req.user.id, req.params.id);
      if (!result) {
        return sendV1Error(res, 404, 'NOT_FOUND', 'Webhook not found');
      }

      return res.json({
        tested: true,
        delivery: result
      });
    } catch (error) {
      return next(error);
    }
  },

  async listWebhookDeliveries(req, res, next) {
    try {
      const { limit, offset } = parseLimitOffset(req.query, 50);
      const webhook = await webhookService.getWebhook(req.user.id, req.params.id);
      if (!webhook) {
        return sendV1Error(res, 404, 'NOT_FOUND', 'Webhook not found');
      }

      const { deliveries, total } = await webhookService.listDeliveries(req.user.id, req.params.id, { limit, offset });
      return sendV1Paginated(res, deliveries, buildPagination(limit, offset, total, deliveries.length));
    } catch (error) {
      return next(error);
    }
  }
};

module.exports = webhookV1Controller;
