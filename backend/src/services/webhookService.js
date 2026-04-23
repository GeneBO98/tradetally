const crypto = require('crypto');
const fetch = require('node-fetch');
const WebhookSubscription = require('../models/WebhookSubscription');
const { fetchWithValidatedRedirects, ensureValidatedOutboundUrl, OutboundUrlValidationError } = require('../utils/urlSecurity');

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
const ALLOWED_PROVIDER_TYPES = Object.freeze(['custom', 'slack', 'discord']);
const DEFAULT_PROVIDER_TYPE = 'custom';

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return `${value}`;
  return `$${parsed.toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return `${value}`;
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(2)}%`;
}

function getProviderType(webhook = {}) {
  const providerType = webhook.provider_type || webhook.providerType || DEFAULT_PROVIDER_TYPE;
  return ALLOWED_PROVIDER_TYPES.includes(providerType) ? providerType : DEFAULT_PROVIDER_TYPE;
}

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
    providerType: getProviderType(webhook),
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

function validateProviderType(providerType) {
  const normalized = typeof providerType === 'string'
    ? providerType.trim().toLowerCase()
    : DEFAULT_PROVIDER_TYPE;

  if (!ALLOWED_PROVIDER_TYPES.includes(normalized)) {
    const error = new Error(`Invalid provider type: ${providerType}`);
    error.code = 'INVALID_PROVIDER_TYPE';
    throw error;
  }

  return normalized;
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

function buildDefaultPayload(event) {
  return {
    id: event.id,
    type: event.type,
    createdAt: event.occurredAt,
    data: event.payload,
    metadata: event.metadata || {}
  };
}

function buildPriceAlertSummary(event) {
  const data = event?.payload || {};
  const symbol = data.symbol || 'Unknown symbol';
  const action = data.alertType === 'below'
    ? 'dropped below your target'
    : data.alertType === 'change_percent'
      ? 'hit your change threshold'
      : 'moved above your target';

  return `Price alert triggered: ${symbol} ${action}`;
}

function buildPriceAlertFields(event) {
  const data = event?.payload || {};
  return [
    { label: 'Symbol', value: data.symbol || 'N/A' },
    { label: 'Alert Type', value: data.alertType || 'N/A' },
    { label: 'Current Price', value: formatCurrency(data.currentPrice) },
    { label: 'Target Price', value: formatCurrency(data.targetPrice) },
    { label: 'Observed Change', value: formatPercent(data.observedPercentChange) },
    { label: 'Threshold', value: formatPercent(data.changePercent) },
    { label: 'Triggered At', value: data.triggeredAt || event.occurredAt || new Date().toISOString() }
  ].filter((field) => field.value !== 'N/A');
}

function formatSlackPayload(event) {
  const data = event?.payload || {};
  const detailLines = buildPriceAlertFields(event)
    .map((field) => `*${field.label}:* ${field.value}`)
    .join('\n');

  return {
    text: buildPriceAlertSummary(event),
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Price Alert: ${data.symbol || 'Unknown'}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: data.message || buildPriceAlertSummary(event)
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: detailLines
        }
      }
    ]
  };
}

function formatDiscordPayload(event) {
  const data = event?.payload || {};
  return {
    content: buildPriceAlertSummary(event),
    embeds: [
      {
        title: `Price Alert: ${data.symbol || 'Unknown'}`,
        description: data.message || buildPriceAlertSummary(event),
        color: data.alertType === 'below' ? 15158332 : 3066993,
        fields: buildPriceAlertFields(event).map((field) => ({
          name: field.label,
          value: field.value,
          inline: field.label !== 'Triggered At'
        })),
        timestamp: data.triggeredAt || event.occurredAt || new Date().toISOString()
      }
    ]
  };
}

function buildWebhookRequestBody(webhook, event) {
  const providerType = getProviderType(webhook);

  if (providerType === 'slack') {
    return formatSlackPayload(event);
  }

  if (providerType === 'discord') {
    return formatDiscordPayload(event);
  }

  return buildDefaultPayload(event);
}

class WebhookService {
  async listWebhooks(userId, { limit = 50, offset = 0, exactEventTypes = null } = {}) {
    const { rows, total } = await WebhookSubscription.listByUserId(userId, { limit, offset, exactEventTypes });
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

    await ensureValidatedOutboundUrl(payload.url, { mode: 'public' });
    const providerType = validateProviderType(payload.providerType);

    const created = await WebhookSubscription.create({
      userId,
      url: payload.url,
      providerType,
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

    if (payload.url !== undefined) {
      await ensureValidatedOutboundUrl(payload.url, { mode: 'public' });
      updates.url = payload.url;
    }
    if (payload.providerType !== undefined) updates.providerType = validateProviderType(payload.providerType);
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

    const now = new Date().toISOString();
    const shouldUsePriceAlertPayload = Array.isArray(webhook.event_types) && webhook.event_types.includes('price_alert.triggered');
    const testEvent = shouldUsePriceAlertPayload
      ? {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
          type: 'price_alert.triggered',
          occurredAt: now,
          payload: {
            alertId: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
            userId,
            symbol: 'AAPL',
            alertType: 'above',
            currentPrice: 205.15,
            targetPrice: 200,
            changePercent: null,
            observedPercentChange: 3.42,
            message: 'AAPL has reached $205.15, which is above your target of $200.00',
            repeatEnabled: false,
            triggeredAt: now
          },
          metadata: {
            source: 'api.webhooks.test',
            isTest: true
          }
        }
      : {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
          type: 'webhook.test',
          occurredAt: now,
          payload: {
            message: 'This is a webhook test delivery from TradeTally.',
            webhookId: webhook.id
          },
          metadata: {
            source: 'api.webhooks.test',
            isTest: true
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
    const payload = buildWebhookRequestBody(webhook, event);
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
      const response = await fetchWithValidatedRedirects(
        webhook.url,
        fetch,
        {
          method: 'POST',
          headers: requestHeaders,
          body: payloadText,
          signal: controller.signal
        },
        {
          mode: 'public',
          maxRedirects: 3
        }
      );

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
      if (error instanceof OutboundUrlValidationError) {
        errorMessage = `Webhook delivery blocked: ${error.message}`;
      }
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
  ALLOWED_PROVIDER_TYPES,
  DEFAULT_EVENT_TYPES,
  DEFAULT_PROVIDER_TYPE,
  buildWebhookRequestBody,
  createWebhookSecret,
  formatDiscordPayload,
  formatSlackPayload,
  validateProviderType,
  validateEventTypes,
  webhookService: new WebhookService()
};
