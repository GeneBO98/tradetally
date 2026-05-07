const axios = require('axios');
const db = require('../config/database');

function isConfigured() {
  return !!process.env.SEQUENZY_API_KEY;
}

function getBaseUrl() {
  return `${(process.env.SEQUENZY_API_BASE_URL || 'https://api.sequenzy.com').replace(/\/$/, '')}/api/v1`;
}

function splitName(fullName, username) {
  const fallback = (username || '').trim();
  const trimmed = (fullName || '').trim();
  const source = trimmed || fallback;

  if (!source) {
    return { firstName: undefined, lastName: undefined };
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: undefined };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

function normalizeTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTags(user) {
  const tags = [
    'tradetally-user',
    `role.${normalizeTag(user.role || 'user')}`,
    `tier.${normalizeTag(user.tier || 'free')}`,
    `subscription.${normalizeTag(user.subscription_status || 'none')}`
  ];

  if (user.marketing_consent) {
    tags.push('marketing-consent');
  } else {
    tags.push('marketing-opted-out');
  }

  if (user.is_verified) {
    tags.push('email-verified');
  } else {
    tags.push('email-unverified');
  }

  if (!user.is_active) {
    tags.push('user-inactive');
  }

  if (!user.admin_approved) {
    tags.push('admin-approval-pending');
  }

  return Array.from(new Set(tags.filter(Boolean)));
}

function buildStatus(user) {
  if (!user.is_active || !user.marketing_consent || !user.is_verified || !user.admin_approved) {
    return 'unsubscribed';
  }

  return 'active';
}

function buildPayload(user) {
  const { firstName, lastName } = splitName(user.full_name, user.username);

  return {
    email: user.email,
    firstName,
    lastName,
    status: buildStatus(user),
    tags: buildTags(user),
    customAttributes: {
      userId: String(user.id),
      username: user.username || null,
      fullName: user.full_name || null,
      role: user.role || null,
      tier: user.tier || null,
      timezone: user.timezone || null,
      isVerified: !!user.is_verified,
      adminApproved: !!user.admin_approved,
      isActive: !!user.is_active,
      marketingConsent: !!user.marketing_consent,
      createdAt: user.created_at ? new Date(user.created_at).toISOString() : null,
      updatedAt: user.updated_at ? new Date(user.updated_at).toISOString() : null,
      subscriptionStatus: user.subscription_status || null,
      subscriptionCurrentPeriodEnd: user.subscription_current_period_end
        ? new Date(user.subscription_current_period_end).toISOString()
        : null,
      subscriptionCancelAtPeriodEnd: user.subscription_cancel_at_period_end ?? null
    }
  };
}

async function request(method, path, data) {
  const response = await axios({
    method,
    url: `${getBaseUrl()}${path}`,
    data,
    headers: {
      Authorization: `Bearer ${process.env.SEQUENZY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  return response.data;
}

async function loadUserById(userId) {
  const result = await db.query(
    `SELECT
       u.id,
       u.email,
       u.username,
       u.full_name,
       u.role,
       u.is_verified,
       u.admin_approved,
       u.is_active,
       u.timezone,
       u.tier,
       u.marketing_consent,
       u.created_at,
       u.updated_at,
       s.status AS subscription_status,
       s.current_period_end AS subscription_current_period_end,
       s.cancel_at_period_end AS subscription_cancel_at_period_end
     FROM users u
     LEFT JOIN LATERAL (
       SELECT status, current_period_end, cancel_at_period_end
       FROM subscriptions
       WHERE user_id = u.id
       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 1
     ) s ON true
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function createSubscriber(payload) {
  return request('post', '/subscribers', payload);
}

async function updateSubscriber(email, payload) {
  return request('patch', `/subscribers/${encodeURIComponent(email)}`, payload);
}

async function deleteSubscriber(email) {
  return request('delete', `/subscribers/${encodeURIComponent(email)}`);
}

async function upsertSubscriber(user) {
  const payload = buildPayload(user);

  try {
    return await updateSubscriber(user.email, payload);
  } catch (error) {
    if (error.response?.status === 404) {
      return createSubscriber(payload);
    }
    throw error;
  }
}

async function syncUserById(userId, options = {}) {
  if (!isConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  const user = await loadUserById(userId);
  if (!user) {
    return { skipped: true, reason: 'user_not_found' };
  }

  const result = await upsertSubscriber(user);

  const previousEmail = options.previousEmail?.toLowerCase?.() || null;
  if (previousEmail && previousEmail !== user.email.toLowerCase()) {
    try {
      await deleteSubscriber(previousEmail);
    } catch (error) {
      if (error.response?.status !== 404) {
        throw error;
      }
    }
  }

  return { success: true, result };
}

function queueSyncUserById(userId, options = {}) {
  if (!isConfigured() || !userId) {
    return;
  }

  setImmediate(async () => {
    try {
      await syncUserById(userId, options);
      console.log(`[SEQUENZY] Synced subscriber for user ${userId}`);
    } catch (error) {
      console.error(`[SEQUENZY] Failed to sync subscriber for user ${userId}:`, error.response?.data || error.message);
    }
  });
}

function queueDeleteSubscriber(email) {
  if (!isConfigured() || !email) {
    return;
  }

  setImmediate(async () => {
    try {
      await deleteSubscriber(email);
      console.log(`[SEQUENZY] Deleted subscriber ${email}`);
    } catch (error) {
      if (error.response?.status === 404) {
        return;
      }
      console.error(`[SEQUENZY] Failed to delete subscriber ${email}:`, error.response?.data || error.message);
    }
  });
}

module.exports = {
  buildPayload,
  deleteSubscriber,
  isConfigured,
  loadUserById,
  queueDeleteSubscriber,
  queueSyncUserById,
  syncUserById
};
