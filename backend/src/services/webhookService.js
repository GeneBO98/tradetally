const crypto = require('crypto');
const fetch = require('node-fetch');
const WebhookSubscription = require('../models/WebhookSubscription');

const ALLOWED_EVENT_TYPES = Object.freeze([
  'trade.created',
  'trade.updated',
  'trade.deleted',
  'import.completed',
  'broker_sync.completed',
  'price_alert.triggered',
  'enrichment.completed'
]);

const DEFAULT_EVENT_TYPES = Object.freeze(['trade.created', 'trade.updated', 'trade.deleted']);

function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  if (secret.length <= 8) return `${'*'.repeat(secret.length)}`;
  return `${secret.slice(0, 4)}${'*'.repeat(Math.max(secret.length - 8, 4))}${secret.slice(-4)}`;
}

function toSafeWebhook(webhook, includeSecret = false) {
  if (!webhook) return null;
  return {
    id: webhook.id,
    url: webhook.url,
    description: webhook.description,
    eventTypes: Array.isArray(webhook.event_types) ? webhook.event_types : [],
    customHeaders: webhook.custom_headers || {},
    isActive: Boolean(webhook.is_active),
    failureCount: webhook.failure_count || 0,
    disabledAt: webhook.disabled_at,
    lastSuccessAt: webhook.last_success_at,
    lastFailureAt: webhook.last_failure_at,
    createdAt: webhook.created_at,
    updatedAt: webhook.updated_at,
    secretPreview: maskSecret(webhook.secret),
    secret: includeSecret ? webhook.secret : undefined
  };
}

function normalizeEventTypes(eventTypes) {
  const normalized = Array.isArray(eventTypes)
    ? eventTypes
      .filter((eventType) => typeof eventType === 'string')
      .map((eventType) => eventType.trim())
      .filter(Boolean)
    : [];

  return [...new Set(normalized)];
}

function validateEventTypes(eventTypes) {
  const normalized = normalizeEventTypes(eventTypes);
  const invalid = normalized.filter((eventType) => !ALLOWED_EVENT_TYPES.includes(eventType));
  return {
    valid: invalid.length === 0,
    invalid,
    normalized
  };
}

function createWebhookSecret() {
  if (typeof crypto.randomUUID === 'function') {
    return `whsec_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

class WebhookService {
  async listWebhooks(userId, { limit = 50, offset = 0 } = {}) {
    const { rows, total } = await WebhookSubscription.listByUserId(userId, { limit, offset });
    return {
      webhooks: rows.map((row) => toSafeWebhook(row)),
      total
    };
  }

  async createWebhook(userId, payload = {}) {
    const eventValidation = validateEventTypes(payload.eventTypes || DEFAULT_EVENT_TYPES);
    if (!eventValidation.valid) {
      const error = new Error(`Invalid event types: ${eventValidation.invalid.join(', ')}`);
      error.code = 'INVALID_EVENT_TYPES';
      throw error;
    }

    const created = await WebhookSubscription.create({
      userId,
      url: payload.url,
      description: payload.description || null,
      eventTypes: eventValidation.normalized.length > 0 ? eventValidation.normalized : [...DEFAULT_EVENT_TYPES],
      customHeaders: payload.customHeaders || {},
      isActive: payload.isActive !== false,
      secret: payload.secret || createWebhookSecret()
    });

    return toSafeWebhook(created, true);
  }

  async updateWebhook(userId, webhookId, payload = {}) {
    const updates = {};

    if (payload.url !== undefined) updates.url = payload.url;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;
    if (payload.customHeaders !== undefined) updates.customHeaders = payload.customHeaders;
    if (payload.secret !== undefined) updates.secret = payload.secret || createWebhookSecret();
    if (payload.rotateSecret === true && payload.secret === undefined) {
      updates.secret = createWebhookSecret();
    }

    if (payload.eventTypes !== undefined) {
      const eventValidation = validateEventTypes(payload.eventTypes);
      if (!eventValidation.valid) {
        const error = new Error(`Invalid event types: ${eventValidation.invalid.join(', ')}`);
        error.code = 'INVALID_EVENT_TYPES';
        throw error;
      }
      updates.eventTypes = eventValidation.normalized;
    }

    const updated = await WebhookSubscription.updateForUser(webhookId, userId, updates);
    if (!updated) return null;
    return toSafeWebhook(updated, Boolean(payload.rotateSecret));
  }

  async deleteWebhook(userId, webhookId) {
    return WebhookSubscription.deleteForUser(webhookId, userId);
  }

  async getWebhook(userId, webhookId) {
    const webhook = await WebhookSubscription.findByIdForUser(webhookId, userId);
    return toSafeWebhook(webhook);
  }

  async listDeliveries(userId, webhookId, { limit = 50, offset = 0 } = {}) {
    const { rows, total } = await WebhookSubscription.listDeliveriesForWebhook(userId, webhookId, { limit, offset });
    return {
      deliveries: rows.map((row) => ({
        id: row.id,
        webhookId: row.webhook_id,
        eventType: row.event_type,
        eventId: row.event_id,
        attempt: row.attempt,
        status: row.status,
        responseStatus: row.response_status,
        durationMs: row.duration_ms,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at
      })),
      total
    };
  }

  async triggerTestDelivery(userId, webhookId) {
    const webhook = await WebhookSubscription.findByIdForUser(webhookId, userId);
    if (!webhook) return null;

    const testEvent = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
      type: 'webhook.test',
      occurredAt: new Date().toISOString(),
      payload: {
        message: 'This is a webhook test delivery from TradeTally.',
        webhookId: webhook.id
      },
      metadata: {
        source: 'api.v1.webhooks.test'
      }
    };

    return this.deliverEventToWebhook(webhook, testEvent, { isTest: true });
  }

  async handleDomainEvent(event) {
    const subscriptions = await WebhookSubscription.listActiveByEventType(event.type);
    if (subscriptions.length === 0) {
      return { delivered: 0, failed: 0, skipped: 0 };
    }

    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      subscriptions.map((subscription) => this.deliverEventToWebhook(subscription, event))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'delivered') delivered += 1;
        else if (result.value.status === 'failed') failed += 1;
        else skipped += 1;
      } else {
        failed += 1;
      }
    }

    return { delivered, failed, skipped };
  }

  async deliverEventToWebhook(webhook, event, { isTest = false } = {}) {
    if (!webhook.is_active) {
      return { status: 'skipped' };
    }

    const timeoutMs = Number.parseInt(process.env.WEBHOOK_TIMEOUT_MS || '10000', 10) || 10000;
    const failureThreshold = Number.parseInt(process.env.WEBHOOK_FAILURE_THRESHOLD || '5', 10) || 5;
    const createdAt = Date.now();
    const payload = {
      id: event.id,
      type: event.type,
      createdAt: event.occurredAt,
      data: event.payload,
      metadata: event.metadata || {}
    };
    const payloadText = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(`${timestamp}.${payloadText}`)
      .digest('hex');

    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'TradeTally-Webhooks/1.0',
      'X-TradeTally-Event': event.type,
      'X-TradeTally-Timestamp': timestamp,
      'X-TradeTally-Signature': `sha256=${signature}`,
      ...(webhook.custom_headers || {})
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let responseStatus = null;
    let responseBody = null;
    let status = 'failed';
    let errorMessage = null;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: requestHeaders,
        body: payloadText,
        signal: controller.signal
      });

      responseStatus = response.status;
      responseBody = await response.text();
      status = response.ok ? 'delivered' : 'failed';
      if (!response.ok) {
        errorMessage = `Webhook endpoint responded with HTTP ${response.status}`;
      }
    } catch (error) {
      errorMessage = error.name === 'AbortError'
        ? `Webhook delivery timed out after ${timeoutMs}ms`
        : error.message;
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - createdAt;
    const deliveredAt = status === 'delivered' ? new Date() : null;

    await WebhookSubscription.recordDelivery({
      webhookId: webhook.id,
      userId: webhook.user_id,
      eventType: event.type,
      eventId: event.id,
      attempt: 1,
      status,
      requestUrl: webhook.url,
      requestHeaders,
      requestBody: payload,
      responseStatus,
      responseBody,
      durationMs,
      errorMessage,
      deliveredAt
    });

    if (status === 'delivered') {
      await WebhookSubscription.updateForUser(webhook.id, webhook.user_id, {
        failureCount: 0,
        disabledAt: null,
        lastSuccessAt: new Date()
      });
    } else {
      const nextFailureCount = (webhook.failure_count || 0) + 1;
      const shouldDisable = !isTest && nextFailureCount >= failureThreshold;
      await WebhookSubscription.updateForUser(webhook.id, webhook.user_id, {
        failureCount: nextFailureCount,
        lastFailureAt: new Date(),
        isActive: shouldDisable ? false : webhook.is_active,
        disabledAt: shouldDisable ? new Date() : webhook.disabled_at
      });
    }

    return {
      status,
      responseStatus,
      durationMs,
      errorMessage
    };
  }
}

module.exports = {
  ALLOWED_EVENT_TYPES,
  DEFAULT_EVENT_TYPES,
  createWebhookSecret,
  validateEventTypes,
  webhookService: new WebhookService()
};
