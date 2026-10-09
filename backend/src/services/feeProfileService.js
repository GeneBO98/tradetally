const db = require('../config/database');
const AppError = require('../utils/AppError');
const { normalizeBrokerName } = require('./brokerFeeApplicationService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_FIELDS = [
  'commission_per_contract',
  'commission_per_side',
  'exchange_fee_per_contract',
  'nfa_fee_per_contract',
  'clearing_fee_per_contract',
  'platform_fee_per_contract'
];
const MAX_RATE = 1000000;

function errorResponse(statusCode, message) {
  return new AppError(statusCode, { error: message });
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw errorResponse(400, `${label} is invalid`);
  }
}

function readValue(record, snakeKey, camelKey) {
  return record?.[snakeKey] ?? record?.[camelKey];
}

function normalizeMoney(value, label) {
  const number = value === '' || value === null || value === undefined ? 0 : Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_RATE) {
    throw errorResponse(400, `${label} must be a valid amount`);
  }
  return number;
}

function normalizeRate(rate, index) {
  const broker = normalizeBrokerName(readValue(rate, 'broker', 'broker'));
  if (!broker || broker === 'auto' || broker === 'generic') {
    throw errorResponse(400, `Rate ${index + 1} needs a specific broker`);
  }

  const instrument = String(readValue(rate, 'instrument', 'instrument') || '').trim().toUpperCase();
  if (instrument.length > 50) {
    throw errorResponse(400, `Rate ${index + 1} instrument is too long`);
  }

  const normalized = {
    broker,
    instrument,
    notes: String(readValue(rate, 'notes', 'notes') || '').trim() || null
  };

  for (const field of RATE_FIELDS) {
    const camelField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    normalized[field] = normalizeMoney(readValue(rate, field, camelField), `${field} on rate ${index + 1}`);
  }

  return normalized;
}

function normalizeProfilePayload(payload = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || payload.name !== undefined) {
    const name = String(payload.name ?? '').trim();
    if (!name || name.length > 100) {
      throw errorResponse(400, 'Profile name is required and must be at most 100 characters');
    }
    result.name = name;
  }

  if (!partial || payload.notes !== undefined) {
    const notes = payload.notes === null ? null : String(payload.notes ?? '').trim();
    if (notes && notes.length > 1000) {
      throw errorResponse(400, 'Profile notes must be at most 1000 characters');
    }
    result.notes = notes || null;
  }

  if (!partial || payload.is_zero_fee !== undefined || payload.isZeroFee !== undefined) {
    result.is_zero_fee = Boolean(payload.is_zero_fee ?? payload.isZeroFee);
  }

  if (!partial || payload.rates !== undefined) {
    if (!Array.isArray(payload.rates) || payload.rates.length > 500) {
      throw errorResponse(400, 'Rates must be an array with at most 500 rows');
    }
    const seen = new Set();
    result.rates = payload.rates.map((rate, index) => {
      const normalized = normalizeRate(rate, index);
      const key = `${normalized.broker}\u0000${normalized.instrument}`;
      if (seen.has(key)) {
        throw errorResponse(400, `Duplicate broker/instrument rate in row ${index + 1}`);
      }
      seen.add(key);
      return normalized;
    });
  }

  return result;
}

function formatRate(row) {
  return {
    id: row.id,
    broker: normalizeBrokerName(row.broker),
    instrument: row.instrument || '',
    commissionPerContract: Number(row.commission_per_contract) || 0,
    commissionPerSide: Number(row.commission_per_side) || 0,
    exchangeFeePerContract: Number(row.exchange_fee_per_contract) || 0,
    nfaFeePerContract: Number(row.nfa_fee_per_contract) || 0,
    clearingFeePerContract: Number(row.clearing_fee_per_contract) || 0,
    platformFeePerContract: Number(row.platform_fee_per_contract) || 0,
    notes: row.notes || null
  };
}

function formatProfile(row, rates = [], accounts = []) {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes || null,
    isZeroFee: row.is_zero_fee === true,
    rates,
    accountIds: accounts.map(account => account.id),
    accounts: accounts.map(account => ({
      id: account.id,
      accountName: account.account_name,
      accountIdentifier: account.account_identifier,
      broker: account.broker
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getProfiles(userId) {
  const [profilesResult, ratesResult, accountsResult] = await Promise.all([
    db.query(
      `SELECT id, user_id, name, notes, is_zero_fee, created_at, updated_at
       FROM fee_profiles
       WHERE user_id = $1
       ORDER BY name`,
      [userId]
    ),
    db.query(
      `SELECT r.*
       FROM fee_profile_rates r
       JOIN fee_profiles p ON p.id = r.fee_profile_id
       WHERE p.user_id = $1
       ORDER BY r.fee_profile_id, r.broker, r.instrument`,
      [userId]
    ),
    db.query(
      `SELECT id, account_name, account_identifier, broker, fee_profile_id
       FROM user_accounts
       WHERE user_id = $1
         AND fee_profile_id IS NOT NULL
       ORDER BY account_name`,
      [userId]
    )
  ]);

  const ratesByProfile = new Map();
  for (const row of ratesResult.rows) {
    if (!ratesByProfile.has(row.fee_profile_id)) ratesByProfile.set(row.fee_profile_id, []);
    ratesByProfile.get(row.fee_profile_id).push(formatRate(row));
  }

  const accountsByProfile = new Map();
  for (const row of accountsResult.rows) {
    if (!accountsByProfile.has(row.fee_profile_id)) accountsByProfile.set(row.fee_profile_id, []);
    accountsByProfile.get(row.fee_profile_id).push(row);
  }

  return profilesResult.rows.map(row => formatProfile(
    row,
    ratesByProfile.get(row.id) || [],
    accountsByProfile.get(row.id) || []
  ));
}

async function createProfile(userId, payload) {
  const normalized = normalizeProfilePayload(payload);
  try {
    return await db.withTransaction(async client => {
      const profileResult = await client.query(
        `INSERT INTO fee_profiles (user_id, name, notes, is_zero_fee)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, normalized.name, normalized.notes, normalized.is_zero_fee]
      );
      const profile = profileResult.rows[0];
      await insertRates(client, profile.id, normalized.rates);
      return formatProfile(profile, normalized.rates.map(formatRate));
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'fee_profiles_user_name_unique') {
      throw errorResponse(409, 'A fee profile with this name already exists');
    }
    throw error;
  }
}

async function updateProfile(userId, profileId, payload) {
  assertUuid(profileId, 'Profile ID');
  const normalized = normalizeProfilePayload(payload);
  try {
    return await db.withTransaction(async client => {
      const profileResult = await client.query(
        `UPDATE fee_profiles
         SET name = $1, notes = $2, is_zero_fee = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND user_id = $5
         RETURNING *`,
        [normalized.name, normalized.notes, normalized.is_zero_fee, profileId, userId]
      );
      if (profileResult.rows.length === 0) throw errorResponse(404, 'Fee profile not found');

      await client.query('DELETE FROM fee_profile_rates WHERE fee_profile_id = $1', [profileId]);
      await insertRates(client, profileId, normalized.rates);
      return formatProfile(profileResult.rows[0], normalized.rates.map(formatRate));
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'fee_profiles_user_name_unique') {
      throw errorResponse(409, 'A fee profile with this name already exists');
    }
    throw error;
  }
}

async function insertRates(client, profileId, rates = []) {
  for (const rate of rates) {
    await client.query(
      `INSERT INTO fee_profile_rates (
        fee_profile_id, broker, instrument,
        commission_per_contract, commission_per_side,
        exchange_fee_per_contract, nfa_fee_per_contract,
        clearing_fee_per_contract, platform_fee_per_contract, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        profileId,
        rate.broker,
        rate.instrument,
        rate.commission_per_contract,
        rate.commission_per_side,
        rate.exchange_fee_per_contract,
        rate.nfa_fee_per_contract,
        rate.clearing_fee_per_contract,
        rate.platform_fee_per_contract,
        rate.notes
      ]
    );
  }
}

async function deleteProfile(userId, profileId) {
  assertUuid(profileId, 'Profile ID');
  const result = await db.query(
    `DELETE FROM fee_profiles
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [profileId, userId]
  );
  if (result.rows.length === 0) throw errorResponse(404, 'Fee profile not found');
  return { id: result.rows[0].id };
}

async function setProfileAccounts(userId, profileId, rawAccountIds) {
  assertUuid(profileId, 'Profile ID');
  if (!Array.isArray(rawAccountIds) || rawAccountIds.length > 500) {
    throw errorResponse(400, 'Account IDs must be an array with at most 500 entries');
  }
  const accountIds = [...new Set(rawAccountIds)];
  accountIds.forEach(id => assertUuid(id, 'Account ID'));

  return db.withTransaction(async client => {
    const profile = await client.query(
      'SELECT id FROM fee_profiles WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [profileId, userId]
    );
    if (profile.rows.length === 0) throw errorResponse(404, 'Fee profile not found');

    if (accountIds.length > 0) {
      const accounts = await client.query(
        `SELECT id FROM user_accounts
         WHERE user_id = $1 AND id = ANY($2::uuid[])
         FOR UPDATE`,
        [userId, accountIds]
      );
      if (accounts.rows.length !== accountIds.length) {
        throw errorResponse(400, 'One or more accounts are unavailable');
      }
    }

    await client.query(
      `UPDATE user_accounts
       SET fee_profile_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND fee_profile_id = $2`,
      [userId, profileId]
    );
    if (accountIds.length > 0) {
      await client.query(
        `UPDATE user_accounts
         SET fee_profile_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND id = ANY($3::uuid[])`,
        [profileId, userId, accountIds]
      );
    }

    return { profileId, accountIds };
  });
}

async function getImportFeeConfiguration(userId, accountIdentifiers = []) {
  const identifiers = [...new Set(accountIdentifiers.filter(Boolean).map(value => String(value).trim()))];
  if (identifiers.length === 0) return { assignments: [], feeRows: [] };

  const result = await db.query(
    `SELECT
       ua.account_identifier,
       ua.fee_profile_id,
       fp.name AS fee_profile_name,
       COALESCE(fp.is_zero_fee, FALSE) AS is_zero_fee,
       r.id,
       r.broker,
       r.instrument,
       r.commission_per_contract,
       r.commission_per_side,
       r.exchange_fee_per_contract,
       r.nfa_fee_per_contract,
       r.clearing_fee_per_contract,
       r.platform_fee_per_contract
     FROM user_accounts ua
     LEFT JOIN fee_profiles fp ON fp.id = ua.fee_profile_id AND fp.user_id = ua.user_id
     LEFT JOIN fee_profile_rates r ON r.fee_profile_id = fp.id
     WHERE ua.user_id = $1
       AND ua.account_identifier = ANY($2::text[])
     ORDER BY ua.account_identifier, r.broker, r.instrument`,
    [userId, identifiers]
  );

  const assignments = [];
  const seenAssignments = new Set();
  const feeRows = [];
  for (const row of result.rows) {
    const assignmentKey = `${row.account_identifier}\u0000${row.fee_profile_id || ''}`;
    if (row.fee_profile_id && !seenAssignments.has(assignmentKey)) {
      seenAssignments.add(assignmentKey);
      assignments.push({
        account_identifier: row.account_identifier,
        fee_profile_id: row.fee_profile_id,
        fee_profile_name: row.fee_profile_name,
        is_zero_fee: row.is_zero_fee === true
      });
    }
    if (row.fee_profile_id && row.id) {
      feeRows.push({ ...row, account_identifier: row.account_identifier, profile_id: row.fee_profile_id });
    }
  }

  return { assignments, feeRows };
}

module.exports = {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setProfileAccounts,
  getImportFeeConfiguration,
  normalizeProfilePayload,
  normalizeRate,
  formatRate,
  formatProfile
};
