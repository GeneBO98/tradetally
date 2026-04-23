const { webhookService } = require('../services/webhookService');

const PRICE_ALERT_EVENT_TYPES = Object.freeze(['price_alert.triggered']);

function parseLimitOffset(query = {}, defaultLimit = 50) {
  const parsedLimit = Number.parseInt(query.limit ?? `${defaultLimit}`, 10);
  const parsedOffset = Number.parseInt(query.offset ?? '0', 10);

  return {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : defaultLimit,
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0
  };
}

function hasOnlyPriceAlertEvent(webhook) {
  return Array.isArray(webhook?.eventTypes)
    && webhook.eventTypes.length === 1
    && webhook.eventTypes[0] === 'price_alert.triggered';
}

function hasValidCustomHeaders(customHeaders) {
  if (customHeaders === undefined) return true;
  if (!customHeaders || typeof customHeaders !== 'object' || Array.isArray(customHeaders)) return false;

  return Object.entries(customHeaders).every(([key, value]) => (
    typeof key === 'string'
    && key.trim().length > 0
    && typeof value === 'string'
  ));
}

function getRequestError(body = {}, { isUpdate = false } = {}) {
  if (!isUpdate || body.url !== undefined) {
    if (body.url !== undefined && typeof body.url !== 'string') {
      return 'Webhook URL must be a string';
    }
  }

  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
    return 'Description must be a string';
  }

  if (body.providerType !== undefined && typeof body.providerType !== 'string') {
    return 'Provider type must be a string';
  }

  if (body.customHeaders !== undefined && !hasValidCustomHeaders(body.customHeaders)) {
    return 'customHeaders must be an object of string values';
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return 'isActive must be a boolean';
  }

  if (body.secret !== undefined && body.secret !== null && typeof body.secret !== 'string') {
    return 'secret must be a string';
  }

  return null;
}

async function getPriceAlertWebhookOrNull(userId, webhookId) {
  const webhook = await webhookService.getWebhook(userId, webhookId);
  return hasOnlyPriceAlertEvent(webhook) ? webhook : null;
}

const priceAlertWebhooksController = {
  async listWebhooks(req, res, next) {
    try {
      const { limit, offset } = parseLimitOffset(req.query, 50);
      const { webhooks, total } = await webhookService.listWebhooks(req.user.id, {
        limit,
        offset,
        exactEventTypes: [...PRICE_ALERT_EVENT_TYPES]
      });

      return res.json({
        success: true,
        data: webhooks,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + webhooks.length < total
        }
      });
    } catch (error) {
      return next(error);
    }
  },

  async createWebhook(req, res, next) {
    try {
      const requestError = getRequestError(req.body || {});
      if (requestError) {
        return res.status(400).json({ success: false, error: requestError });
      }

      const webhook = await webhookService.createWebhook(req.user.id, {
        ...req.body,
        eventTypes: [...PRICE_ALERT_EVENT_TYPES]
      });

      return res.status(201).json({
        success: true,
        data: webhook
      });
    } catch (error) {
      if (error.code === 'INVALID_EVENT_TYPES' || error.code === 'INVALID_OUTBOUND_URL' || error.code === 'INVALID_PROVIDER_TYPE') {
        return res.status(400).json({ success: false, error: error.message });
      }
      return next(error);
    }
  },

  async updateWebhook(req, res, next) {
    try {
      const requestError = getRequestError(req.body || {}, { isUpdate: true });
      if (requestError) {
        return res.status(400).json({ success: false, error: requestError });
      }

      const existingWebhook = await getPriceAlertWebhookOrNull(req.user.id, req.params.id);
      if (!existingWebhook) {
        return res.status(404).json({ success: false, error: 'Webhook not found' });
      }

      const webhook = await webhookService.updateWebhook(req.user.id, req.params.id, {
        ...req.body,
        eventTypes: [...PRICE_ALERT_EVENT_TYPES]
      });

      return res.json({
        success: true,
        data: webhook
      });
    } catch (error) {
      if (error.code === 'INVALID_EVENT_TYPES' || error.code === 'INVALID_OUTBOUND_URL' || error.code === 'INVALID_PROVIDER_TYPE') {
        return res.status(400).json({ success: false, error: error.message });
      }
      return next(error);
    }
  },

  async deleteWebhook(req, res, next) {
    try {
      const existingWebhook = await getPriceAlertWebhookOrNull(req.user.id, req.params.id);
      if (!existingWebhook) {
        return res.status(404).json({ success: false, error: 'Webhook not found' });
      }

      await webhookService.deleteWebhook(req.user.id, req.params.id);
      return res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      return next(error);
    }
  },

  async testWebhook(req, res, next) {
    try {
      const existingWebhook = await getPriceAlertWebhookOrNull(req.user.id, req.params.id);
      if (!existingWebhook) {
        return res.status(404).json({ success: false, error: 'Webhook not found' });
      }

      const delivery = await webhookService.triggerTestDelivery(req.user.id, req.params.id);
      return res.json({
        success: true,
        data: delivery
      });
    } catch (error) {
      return next(error);
    }
  },

  async listDeliveries(req, res, next) {
    try {
      const existingWebhook = await getPriceAlertWebhookOrNull(req.user.id, req.params.id);
      if (!existingWebhook) {
        return res.status(404).json({ success: false, error: 'Webhook not found' });
      }

      const { limit, offset } = parseLimitOffset(req.query, 50);
      const { deliveries, total } = await webhookService.listDeliveries(req.user.id, req.params.id, { limit, offset });

      return res.json({
        success: true,
        data: deliveries,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + deliveries.length < total
        }
      });
    } catch (error) {
      return next(error);
    }
  }
};

module.exports = priceAlertWebhooksController;
