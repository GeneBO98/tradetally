const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');
const tierCache = require('./tierCache');
const settingsCache = require('./settingsCache');

const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';
const DEFAULT_ENTITLEMENT_ID = 'pro';
const OVERRIDE_REASON = 'RevenueCat Subscription';

class RevenueCatConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RevenueCatConfigurationError';
  }
}

function getConfiguration() {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) {
    throw new RevenueCatConfigurationError('RevenueCat server API key is not configured');
  }

  return {
    apiKey,
    entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID || DEFAULT_ENTITLEMENT_ID
  };
}

function isWebhookAuthorized(authorizationHeader) {
  const expectedHeader = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
  if (!expectedHeader || !authorizationHeader) return false;

  const expected = Buffer.from(expectedHeader);
  const actual = Buffer.from(String(authorizationHeader));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveActiveEntitlement(customerInfo, entitlementId, now = new Date()) {
  const entitlement = customerInfo?.subscriber?.entitlements?.[entitlementId];
  if (!entitlement) return null;

  const expiresAt = parseDate(entitlement.expires_date);
  const gracePeriodEndsAt = parseDate(entitlement.grace_period_expires_date);
  const accessEndsAt = [expiresAt, gracePeriodEndsAt]
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

  // A null expiration represents a lifetime entitlement.
  if (accessEndsAt === null || accessEndsAt > now) {
    return {
      productId: entitlement.product_identifier || null,
      expiresAt: accessEndsAt
    };
  }

  return null;
}

async function fetchCustomerInfo(userId) {
  const { apiKey } = getConfiguration();
  const encodedUserId = encodeURIComponent(String(userId));
  const response = await axios.get(`${REVENUECAT_API_URL}/subscribers/${encodedUserId}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    timeout: 10000
  });
  return response.data;
}

async function persistEntitlement(userId, entitlement) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (entitlement) {
      await client.query(`
        INSERT INTO tier_overrides (user_id, tier, reason, expires_at, created_by)
        VALUES ($1, 'pro', $2, $3, NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          tier = 'pro',
          reason = EXCLUDED.reason,
          expires_at = EXCLUDED.expires_at,
          created_by = NULL,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, OVERRIDE_REASON, entitlement.expiresAt]);
    } else {
      // Never remove an administrator, trial, or other billing provider's override.
      await client.query(
        'DELETE FROM tier_overrides WHERE user_id = $1 AND reason = $2',
        [userId, OVERRIDE_REASON]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  tierCache.invalidate(userId);
  settingsCache.invalidate(userId);
}

async function syncUserEntitlement(userId) {
  const { entitlementId } = getConfiguration();
  const customerInfo = await fetchCustomerInfo(userId);
  const entitlement = resolveActiveEntitlement(customerInfo, entitlementId);
  await persistEntitlement(userId, entitlement);

  return {
    active: entitlement !== null,
    entitlementId,
    productId: entitlement?.productId || null,
    expiresAt: entitlement?.expiresAt || null
  };
}

function extractTradeTallyUserIds(event) {
  if (!event || typeof event !== 'object') return [];

  const candidates = [
    event.app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])
  ];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return [...new Set(candidates.filter((candidate) => (
    typeof candidate === 'string' && uuidPattern.test(candidate)
  )))];
}

async function processWebhook(payload) {
  const event = payload?.event;
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    const error = new Error('Invalid RevenueCat webhook payload');
    error.statusCode = 400;
    throw error;
  }

  if (event.type === 'TEST') {
    return { eventType: event.type, processedUserIds: [], test: true };
  }

  const userIds = extractTradeTallyUserIds(event);
  const results = [];
  for (const userId of userIds) {
    results.push({ userId, ...(await syncUserEntitlement(userId)) });
  }

  return {
    eventType: event.type,
    processedUserIds: userIds,
    results,
    test: false
  };
}

module.exports = {
  RevenueCatConfigurationError,
  extractTradeTallyUserIds,
  isWebhookAuthorized,
  processWebhook,
  resolveActiveEntitlement,
  syncUserEntitlement
};
