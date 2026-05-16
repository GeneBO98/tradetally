const db = require('../config/database');
const crypto = require('crypto');
const { assertCanReviewOwnRequest } = require('../utils/approvalPolicy');

const RUN_MODES = new Set(['live', 'replay', 'backtest']);
const RUN_STATUSES = new Set(['created', 'running', 'paused', 'completed', 'failed', 'cancelled']);
const LINEAGE_TYPES = new Set(['replay_of', 'backtest_of', 'rerun_of', 'derived_from']);
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.:-]{1,63}$/;
const DEFAULT_REPORT_TEMPLATES = {
  trader: {
    templateKey: 'trader',
    label: 'Trader Workbook',
    description: 'Process-quality report focused on setup, R-multiple, MAE/MFE, behavior, and replay/backtest comparison.',
    sections: [
      { key: 'audience', label: 'Audience Report Template', enabled: true },
      { key: 'overview', label: 'Run Overview', enabled: true },
      { key: 'lineage', label: 'Lineage and Reproducibility', enabled: true },
      { key: 'provenance', label: 'Data Provenance', enabled: true },
      { key: 'metrics', label: 'Metrics', enabled: true },
      { key: 'confidence', label: 'Confidence', enabled: true },
      { key: 'events', label: 'Event Timeline', enabled: true }
    ],
    shareDefaults: { formats: ['json', 'pdf'], includeEvents: true, includeMetrics: true, includeReportAccesses: false },
    isEnabled: true
  },
  prop_firm: {
    templateKey: 'prop_firm',
    label: 'Prop Firm Risk Review',
    description: 'Risk-control report focused on daily loss, max drawdown, consistency, lineage, and audit trail.',
    sections: [
      { key: 'audience', label: 'Audience Report Template', enabled: true },
      { key: 'overview', label: 'Run Overview', enabled: true },
      { key: 'lineage', label: 'Lineage and Reproducibility', enabled: true },
      { key: 'provenance', label: 'Data Provenance', enabled: true },
      { key: 'metrics', label: 'Risk Metrics', enabled: true },
      { key: 'confidence', label: 'Confidence', enabled: true },
      { key: 'events', label: 'Event Timeline', enabled: true },
      { key: 'access', label: 'Report Access Audit', enabled: true }
    ],
    shareDefaults: { formats: ['json', 'pdf'], includeEvents: true, includeMetrics: true, includeReportAccesses: true },
    isEnabled: true
  },
  investor: {
    templateKey: 'investor',
    label: 'Investor Summary',
    description: 'Performance and reproducibility report focused on expectancy, drawdown, confidence, and provenance.',
    sections: [
      { key: 'audience', label: 'Audience Report Template', enabled: true },
      { key: 'overview', label: 'Run Overview', enabled: true },
      { key: 'lineage', label: 'Lineage and Reproducibility', enabled: true },
      { key: 'provenance', label: 'Data Provenance', enabled: true },
      { key: 'metrics', label: 'Performance Metrics', enabled: true },
      { key: 'confidence', label: 'Confidence', enabled: true },
      { key: 'access', label: 'Report Access Audit', enabled: true }
    ],
    shareDefaults: { formats: ['json', 'pdf'], includeEvents: false, includeMetrics: true, includeReportAccesses: true },
    isEnabled: true
  },
  tax_accounting: {
    templateKey: 'tax_accounting',
    label: 'Tax and Accounting Packet',
    description: 'Realized PnL, fees, account, instrument classification, assignment, margin, and export trail report.',
    sections: [
      { key: 'audience', label: 'Audience Report Template', enabled: true },
      { key: 'overview', label: 'Run Overview', enabled: true },
      { key: 'lineage', label: 'Lineage and Reproducibility', enabled: true },
      { key: 'provenance', label: 'Data Provenance', enabled: true },
      { key: 'derivatives', label: 'Options, Futures, and Margin', enabled: true },
      { key: 'metrics', label: 'Accounting Metrics', enabled: true },
      { key: 'access', label: 'Report Access Audit', enabled: true },
      { key: 'shareAudit', label: 'Share Link Audit', enabled: true }
    ],
    shareDefaults: { formats: ['json', 'csv', 'pdf'], includeEvents: false, includeMetrics: true, includeReportAccesses: true },
    isEnabled: true
  }
};
const DEFAULT_CONFIDENCE_LEVELS = [0.9, 0.95, 0.99];
const CONFIDENCE_Z_SCORES = new Map([
  [0.8, 1.2816],
  [0.85, 1.4395],
  [0.9, 1.6449],
  [0.95, 1.96],
  [0.975, 2.2414],
  [0.99, 2.5758]
]);

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    name: row.name,
    status: row.status,
    source: row.source,
    config: row.config || {},
    metrics: row.metrics || {},
    parentRunId: row.parent_run_id,
    lineageType: row.lineage_type,
    marketDataSnapshotId: row.market_data_snapshot_id,
    marketDataSnapshot: row.market_data_snapshot || {},
    confidence: row.confidence || {},
    startedAt: row.started_at,
    endedAt: row.ended_at,
    errorMessage: row.error_message,
    shareToken: row.share_token,
    shareScope: row.share_scope || {},
    verifiedShareScope: row.verified_share_scope || null,
    isShared: Boolean(row.share_token),
    sharedAt: row.shared_at,
    shareExpiresAt: row.share_expires_at,
    userEmail: row.user_email,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toReportAccessCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    shareToken: row.share_token,
    userId: row.user_id,
    accessType: row.access_type,
    format: row.format,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
}

function confidenceKey(level) {
  const percent = Math.round(level * 1000) / 10;
  return `p${String(percent).replace('.', '_')}`;
}

function normalizeConfidenceLevels(input, fallback = DEFAULT_CONFIDENCE_LEVELS) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : fallback;
  const levels = raw
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value > 0.5 && value < 1)
    .map(value => Math.round(value * 1000) / 1000);

  return Array.from(new Set(levels)).sort((a, b) => a - b);
}

function zScoreForLevel(level) {
  return CONFIDENCE_Z_SCORES.get(level) || 1.96;
}

function numberStats(values, confidenceLevels = DEFAULT_CONFIDENCE_LEVELS) {
  const clean = values.map(Number).filter(value => Number.isFinite(value));
  const count = clean.length;
  if (count === 0) {
    return {
      count: 0,
      mean: null,
      standardDeviation: null,
      intervals: Object.fromEntries(confidenceLevels.map(level => [confidenceKey(level), {
        level,
        lower: null,
        upper: null,
        margin: null
      }])),
      lower95: null,
      upper95: null,
      margin95: null
    };
  }

  const mean = clean.reduce((sum, value) => sum + value, 0) / count;
  const variance = count > 1
    ? clean.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (count - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const intervals = Object.fromEntries(confidenceLevels.map(level => {
    const margin = count > 1 ? zScoreForLevel(level) * (standardDeviation / Math.sqrt(count)) : 0;
    return [confidenceKey(level), {
      level,
      lower: mean - margin,
      upper: mean + margin,
      margin
    }];
  }));
  const p95 = intervals.p95 || intervals[confidenceKey(0.95)] || { lower: mean, upper: mean, margin: 0 };

  return {
    count,
    mean,
    standardDeviation,
    intervals,
    lower95: p95.lower,
    upper95: p95.upper,
    margin95: p95.margin
  };
}

function toWorkflowSettingsCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    confidenceLevels: normalizeConfidenceLevels(row.confidence_levels),
    sharedReportAccessThreshold: Number(row.shared_report_access_threshold || 10),
    sharedReportAccessWindowMinutes: Number(row.shared_report_access_window_minutes || 15),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toWorkflowSettingRevisionCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    actorUserId: row.actor_user_id,
    beforeSettings: row.before_settings || {},
    afterSettings: row.after_settings || {},
    approvalStatus: row.approval_status,
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at
  };
}

function toShareAuditCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    tokenHash: row.token_hash,
    previousTokenHash: row.previous_token_hash,
    scope: row.scope || {},
    reason: row.reason,
    recipient: row.recipient,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

function toStrategyAnomalySettingsCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    strategy: row.strategy,
    sharedReportAccessThreshold: Number(row.shared_report_access_threshold || 10),
    sharedReportAccessWindowMinutes: Number(row.shared_report_access_window_minutes || 15),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toReportTemplateCamel(row) {
  if (!row) return null;
  return {
    templateKey: row.template_key,
    label: row.label,
    description: row.description,
    sections: Array.isArray(row.sections) ? row.sections : [],
    shareDefaults: row.share_defaults || {},
    isEnabled: row.is_enabled !== false,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toReportTemplateRevisionCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    templateKey: row.template_key,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    beforeTemplate: row.before_template || {},
    afterTemplate: row.after_template || {},
    diffSummary: row.diff_summary || {},
    approvalStatus: row.approval_status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at
  };
}

function stableJson(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function tokenHash(token) {
  return token ? sha256(token) : null;
}

function normalizeReportTemplate(value) {
  const template = String(value || 'trader').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return /^[a-z0-9_.:-]{1,80}$/.test(template) ? template : 'trader';
}

function cleanText(value, maxLength = 160) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeReportSections(input, fallback = DEFAULT_REPORT_TEMPLATES.trader.sections) {
  const sections = Array.isArray(input) ? input : fallback;
  return sections
    .map(section => ({
      key: normalizeReportTemplate(section.key || section.id || section.label || ''),
      label: cleanText(section.label || section.key, 120) || 'Section',
      enabled: section.enabled !== false
    }))
    .filter(section => section.key && section.label)
    .slice(0, 24);
}

function validateReportTemplateDraft(templateKey = 'trader', data = {}) {
  const normalized = normalizeReportTemplate(templateKey || data.templateKey || data.template_key);
  const fallback = defaultReportTemplate(normalized);
  const errors = [];
  const warnings = [];

  if (normalizeReportTemplate(templateKey || data.templateKey || data.template_key) !== String(templateKey || data.templateKey || data.template_key || '').trim().toLowerCase().replace(/[-\s]+/g, '_')) {
    warnings.push('Template key was normalized for storage');
  }

  if (data.sections !== undefined && !Array.isArray(data.sections)) {
    errors.push('sections must be an array');
  }
  if (Array.isArray(data.sections)) {
    data.sections.forEach((section, index) => {
      if (!section || typeof section !== 'object') errors.push(`sections[${index}] must be an object`);
      if (section && !cleanText(section.key || section.id || section.label, 120)) errors.push(`sections[${index}] needs a key or label`);
      if (section && section.enabled !== undefined && typeof section.enabled !== 'boolean') warnings.push(`sections[${index}].enabled will be coerced to boolean`);
    });
    if (data.sections.length > 24) warnings.push('Only the first 24 sections are used');
  }

  const shareDefaultsInput = data.shareDefaults || data.share_defaults || fallback.shareDefaults || {};
  if (shareDefaultsInput && typeof shareDefaultsInput !== 'object') {
    errors.push('shareDefaults must be an object');
  }
  const requestedFormats = Array.isArray(shareDefaultsInput.formats)
    ? shareDefaultsInput.formats
    : typeof shareDefaultsInput.formats === 'string'
      ? shareDefaultsInput.formats.split(',')
      : [];
  const invalidFormats = requestedFormats
    .map(format => String(format).trim().toLowerCase())
    .filter(format => !['json', 'csv', 'pdf'].includes(format));
  if (invalidFormats.length > 0) errors.push(`Unsupported share formats: ${Array.from(new Set(invalidFormats)).join(', ')}`);

  const sections = normalizeReportSections(data.sections, fallback.sections);
  if (sections.length === 0) errors.push('At least one enabled or disabled section is required');

  const template = {
    templateKey: normalized,
    label: cleanText(data.label, 120) || fallback.label,
    description: cleanText(data.description, 500) || fallback.description,
    sections,
    shareDefaults: {
      ...normalizeShareScope(shareDefaultsInput),
      template: normalized
    },
    isEnabled: data.isEnabled !== undefined ? Boolean(data.isEnabled) : data.is_enabled !== undefined ? Boolean(data.is_enabled) : true
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    template
  };
}

function reportTemplateDiffSummary(beforeTemplate = {}, afterTemplate = {}) {
  const changedFields = ['label', 'description', 'isEnabled']
    .filter(field => beforeTemplate[field] !== afterTemplate[field]);
  const beforeSections = Array.isArray(beforeTemplate.sections) ? beforeTemplate.sections : [];
  const afterSections = Array.isArray(afterTemplate.sections) ? afterTemplate.sections : [];
  const beforeSectionMap = new Map(beforeSections.map(section => [section.key, section]));
  const afterSectionMap = new Map(afterSections.map(section => [section.key, section]));
  const addedSections = afterSections
    .filter(section => !beforeSectionMap.has(section.key))
    .map(section => section.key);
  const removedSections = beforeSections
    .filter(section => !afterSectionMap.has(section.key))
    .map(section => section.key);
  const changedSections = afterSections
    .filter(section => {
      const beforeSection = beforeSectionMap.get(section.key);
      return beforeSection && stableJson(beforeSection) !== stableJson(section);
    })
    .map(section => section.key);
  const shareDefaultsChanged = stableJson(beforeTemplate.shareDefaults || {}) !== stableJson(afterTemplate.shareDefaults || {});

  return {
    changedFields,
    addedSections,
    removedSections,
    changedSections,
    shareDefaultsChanged
  };
}

function defaultReportTemplate(templateKey = 'trader') {
  const normalized = normalizeReportTemplate(templateKey);
  return DEFAULT_REPORT_TEMPLATES[normalized] || {
    ...DEFAULT_REPORT_TEMPLATES.trader,
    templateKey: normalized,
    label: normalized.replace(/[_:-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  };
}

function appendAccountValue(values, value) {
  if (Array.isArray(value)) {
    value.forEach(item => appendAccountValue(values, item));
    return;
  }
  if (value && typeof value === 'object') {
    appendAccountValue(values, value.id || value.accountId || value.accountIdentifier || value.account || value.number);
    return;
  }
  const cleaned = cleanText(value, 80);
  if (cleaned) values.add(cleaned);
}

function extractRunAccountIds(run = {}) {
  const values = new Set();
  const payloads = [run.config || {}, run.marketDataSnapshot || {}];
  payloads.forEach(payload => {
    [
      'accountId',
      'accountIdentifier',
      'account',
      'accountNumber',
      'accountLabel',
      'brokerAccountId',
      'accountIds',
      'accounts'
    ].forEach(key => appendAccountValue(values, payload[key]));
  });
  return Array.from(values);
}

function toShareScopeAccountCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountName: row.account_name,
    accountIdentifier: row.account_identifier,
    broker: row.broker,
    isPrimary: row.is_primary,
    scopeId: row.account_identifier || row.id,
    tradeCount: Number(row.trade_count || 0)
  };
}

function normalizeShareScope(input = {}) {
  const validFormats = new Set(['json', 'csv', 'pdf']);
  const requestedFormats = Array.isArray(input.formats)
    ? input.formats
    : typeof input.formats === 'string'
      ? input.formats.split(',')
      : ['json', 'pdf'];
  const formats = requestedFormats
    .map(format => String(format).trim().toLowerCase())
    .filter(format => validFormats.has(format));

  return {
    formats: Array.from(new Set(formats.length > 0 ? formats : ['json'])),
    includeEvents: input.includeEvents !== false,
    includeMetrics: input.includeMetrics !== false,
    includeReportAccesses: input.includeReportAccesses === true,
    template: normalizeReportTemplate(input.template || input.reportTemplate),
    recipient: cleanText(input.recipient, 180),
    watermark: cleanText(input.watermark, 120),
    accountIds: Array.isArray(input.accountIds)
      ? input.accountIds.map(value => cleanText(value, 80)).filter(Boolean).slice(0, 25)
      : []
  };
}

function normalizeWorkflowSettings(source = 'default', current = {}, updates = {}) {
  const normalizedSource = String(source || 'default').trim() || 'default';
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(normalizedSource)) {
    const error = new Error('Invalid workflow settings source');
    error.status = 400;
    throw error;
  }

  const confidenceLevels = normalizeConfidenceLevels(
    updates.confidenceLevels || updates.confidence_levels,
    current.confidenceLevels || DEFAULT_CONFIDENCE_LEVELS
  );
  const threshold = Number(updates.sharedReportAccessThreshold || updates.shared_report_access_threshold || current.sharedReportAccessThreshold || 10);
  const windowMinutes = Number(updates.sharedReportAccessWindowMinutes || updates.shared_report_access_window_minutes || current.sharedReportAccessWindowMinutes || 15);

  if (!Number.isFinite(threshold) || threshold < 2 || threshold > 10000) {
    const error = new Error('Shared report access threshold must be between 2 and 10000');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(windowMinutes) || windowMinutes < 1 || windowMinutes > 10080) {
    const error = new Error('Shared report access window must be between 1 minute and 7 days');
    error.status = 400;
    throw error;
  }

  return {
    source: normalizedSource,
    confidenceLevels,
    sharedReportAccessThreshold: Math.round(threshold),
    sharedReportAccessWindowMinutes: Math.round(windowMinutes)
  };
}

function parseShareExpiresAt(options = {}) {
  if (options.expiresAt) {
    const parsed = new Date(options.expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      const error = new Error('Share link expiry must be a future date');
      error.status = 400;
      throw error;
    }
    return parsed;
  }

  const requestedHours = Number(options.expiresInHours || options.expires_in_hours || 168);
  const expiresInHours = Number.isFinite(requestedHours)
    ? Math.min(Math.max(requestedHours, 1), 2160)
    : 168;
  return new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
}

function reportLinkSecret() {
  return process.env.REPORT_LINK_SECRET || process.env.JWT_SECRET || 'dev-report-link-secret';
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function signSharePayload(encodedPayload) {
  return base64UrlEncode(crypto.createHmac('sha256', reportLinkSecret()).update(encodedPayload).digest());
}

function createSignedShareToken({ runId, expiresAt, scope }) {
  const payload = {
    runId,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000),
    scope,
    nonce: crypto.randomBytes(12).toString('hex')
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `v1.${encodedPayload}.${signSharePayload(encodedPayload)}`;
}

function verifySignedShareToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;

  const expected = signSharePayload(parts[1]);
  const supplied = parts[2];
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (!payload.runId || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return {
      runId: payload.runId,
      exp: payload.exp,
      scope: normalizeShareScope(payload.scope || {})
    };
  } catch (error) {
    return null;
  }
}

function toEventCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    eventType: row.event_type,
    payload: row.payload || {},
    previousEventHash: row.previous_event_hash || null,
    eventHash: row.event_hash || null,
    createdAt: row.created_at
  };
}

function eventHashFor({ runId, eventType, payload, previousEventHash }) {
  return sha256(`${runId}|${eventType}|${stableJson(payload || {})}|${previousEventHash || ''}`);
}

function verifyEventChain(events = []) {
  if (!events.some(event => event.eventHash)) {
    return { valid: null, lastEventHash: null, checkedEventCount: 0 };
  }

  let previousEventHash = null;
  let checkedEventCount = 0;
  for (const event of events) {
    if (!event.eventHash) continue;
    const expectedPrevious = event.previousEventHash || null;
    const expectedHash = eventHashFor({
      runId: event.runId,
      eventType: event.eventType,
      payload: event.payload || {},
      previousEventHash: expectedPrevious
    });
    checkedEventCount += 1;
    if (expectedPrevious !== previousEventHash || expectedHash !== event.eventHash) {
      return {
        valid: false,
        lastEventHash: previousEventHash,
        checkedEventCount
      };
    }
    previousEventHash = event.eventHash;
  }

  return {
    valid: true,
    lastEventHash: previousEventHash,
    checkedEventCount
  };
}

class ExecutionRun {
  static validateMode(mode) {
    if (!RUN_MODES.has(mode)) {
      const error = new Error(`Unsupported execution run mode: ${mode}`);
      error.status = 400;
      throw error;
    }
  }

  static validateStatus(status) {
    if (!RUN_STATUSES.has(status)) {
      const error = new Error(`Unsupported execution run status: ${status}`);
      error.status = 400;
      throw error;
    }
  }

  static validateEventType(eventType) {
    if (typeof eventType !== 'string' || !EVENT_TYPE_PATTERN.test(eventType)) {
      const error = new Error('Invalid execution run event type');
      error.status = 400;
      throw error;
    }
  }

  static validateLineageType(lineageType) {
    if (lineageType && !LINEAGE_TYPES.has(lineageType)) {
      const error = new Error(`Unsupported execution run lineage type: ${lineageType}`);
      error.status = 400;
      throw error;
    }
  }

  static async validateLineageRelationship(userId, data) {
    const parentRunId = data.parentRunId || null;
    const lineageType = data.lineageType || null;

    if (!parentRunId && !lineageType) return;
    if (!parentRunId || !lineageType) {
      const error = new Error('Execution run lineage requires parentRunId and lineageType together');
      error.status = 400;
      throw error;
    }
    if (parentRunId === data.id) {
      const error = new Error('Execution run cannot be its own parent');
      error.status = 400;
      throw error;
    }

    const parentResult = await db.query(
      'SELECT id, user_id, mode FROM execution_runs WHERE id = $1',
      [parentRunId]
    );
    const parent = parentResult.rows[0];
    if (!parent) {
      const error = new Error('Execution run parent not found');
      error.status = 400;
      throw error;
    }
    if (parent.user_id !== userId) {
      const error = new Error('Execution run parent must belong to the same user');
      error.status = 400;
      throw error;
    }
    if (lineageType === 'replay_of' && !(data.mode === 'replay' && parent.mode === 'live')) {
      const error = new Error('replay_of lineage requires replay child and live parent');
      error.status = 400;
      throw error;
    }
    if (lineageType === 'backtest_of' && !(data.mode === 'backtest' && parent.mode === 'replay')) {
      const error = new Error('backtest_of lineage requires backtest child and replay parent');
      error.status = 400;
      throw error;
    }
    if (lineageType === 'rerun_of' && data.mode !== parent.mode) {
      const error = new Error('rerun_of lineage requires parent and child to use the same mode');
      error.status = 400;
      throw error;
    }
  }

  static async _withTransaction(callback) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async _recordEvent(client, runId, eventType, payload = {}) {
    this.validateEventType(eventType);

    const previousResult = await client.query(
      `
        SELECT event_hash
        FROM execution_run_events
        WHERE run_id = $1
          AND event_hash IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [runId]
    );
    const previousEventHash = previousResult.rows[0]?.event_hash || null;
    const eventHash = eventHashFor({ runId, eventType, payload, previousEventHash });

    const result = await client.query(
      `
        INSERT INTO execution_run_events (
          run_id, event_type, payload, previous_event_hash, event_hash
        )
        VALUES ($1, $2, $3::jsonb, $4, $5)
        RETURNING *
      `,
      [runId, eventType, JSON.stringify(payload || {}), previousEventHash, eventHash]
    );

    return toEventCamel(result.rows[0]);
  }

  static async create(userId, data) {
    this.validateMode(data.mode);
    const status = data.status || 'created';
    this.validateStatus(status);
    this.validateLineageType(data.lineageType);
    await this.validateLineageRelationship(userId, data);

    return this._withTransaction(async (client) => {
      const result = await client.query(
        `
          INSERT INTO execution_runs (
            user_id, mode, name, status, source, config, metrics,
            parent_run_id, lineage_type, market_data_snapshot_id, market_data_snapshot, confidence,
            started_at, ended_at, error_message
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15)
          RETURNING *
        `,
        [
          userId,
          data.mode,
          data.name || null,
          status,
          data.source || null,
          JSON.stringify(data.config || {}),
          JSON.stringify(data.metrics || {}),
          data.parentRunId || null,
          data.lineageType || null,
          data.marketDataSnapshotId || null,
          JSON.stringify(data.marketDataSnapshot || {}),
          JSON.stringify(data.confidence || {}),
          data.startedAt || null,
          data.endedAt || null,
          data.errorMessage || null
        ]
      );

      const run = toCamel(result.rows[0]);
      await this._recordEvent(client, run.id, 'run.created', {
        userId,
        mode: run.mode,
        status: run.status,
        source: run.source,
        name: run.name,
        parentRunId: run.parentRunId,
        lineageType: run.lineageType,
        marketDataSnapshotId: run.marketDataSnapshotId
      });

      return run;
    });
  }

  static async findByUser(userId, filters = {}) {
    const values = [userId];
    const clauses = ['user_id = $1'];

    if (filters.mode) {
      this.validateMode(filters.mode);
      values.push(filters.mode);
      clauses.push(`mode = $${values.length}`);
    }

    if (filters.status) {
      this.validateStatus(filters.status);
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 200);
    values.push(limit);

    const result = await db.query(
      `
        SELECT *
        FROM execution_runs
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map(toCamel);
  }

  static async findAllForAdmin(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.mode) {
      this.validateMode(filters.mode);
      values.push(filters.mode);
      clauses.push(`er.mode = $${values.length}`);
    }

    if (filters.status) {
      this.validateStatus(filters.status);
      values.push(filters.status);
      clauses.push(`er.status = $${values.length}`);
    }

    if (filters.userId) {
      values.push(filters.userId);
      clauses.push(`er.user_id = $${values.length}`);
    }

    if (filters.source) {
      values.push(filters.source);
      clauses.push(`er.source = $${values.length}`);
    }

    if (filters.symbol) {
      values.push(`%${String(filters.symbol).trim()}%`);
      clauses.push(`(
        er.config->>'symbol' ILIKE $${values.length}
        OR er.market_data_snapshot->>'symbol' ILIKE $${values.length}
      )`);
    }

    if (filters.strategy) {
      values.push(`%${String(filters.strategy).trim()}%`);
      clauses.push(`(
        er.config->>'strategy' ILIKE $${values.length}
        OR er.market_data_snapshot->>'strategy' ILIKE $${values.length}
      )`);
    }

    if (filters.account || filters.accountId) {
      values.push(`%${String(filters.account || filters.accountId).trim()}%`);
      clauses.push(`(
        er.config->>'accountId' ILIKE $${values.length}
        OR er.config->>'accountIdentifier' ILIKE $${values.length}
        OR er.config->>'account' ILIKE $${values.length}
        OR er.market_data_snapshot->>'accountId' ILIKE $${values.length}
        OR er.market_data_snapshot->>'accountIdentifier' ILIKE $${values.length}
        OR er.market_data_snapshot->>'account' ILIKE $${values.length}
      )`);
    }

    if (filters.from) {
      const fromDate = new Date(filters.from);
      if (!Number.isNaN(fromDate.getTime())) {
        values.push(fromDate.toISOString());
        clauses.push(`er.created_at >= $${values.length}`);
      }
    }

    if (filters.to) {
      const toDate = new Date(filters.to);
      if (!Number.isNaN(toDate.getTime())) {
        values.push(toDate.toISOString());
        clauses.push(`er.created_at <= $${values.length}`);
      }
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '100', 10), 1), 500);
    values.push(limit);

    const result = await db.query(
      `
        SELECT er.*, u.email AS user_email, u.username
        FROM execution_runs er
        JOIN users u ON u.id = er.user_id
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY er.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map(toCamel);
  }

  static async getAdminSummary() {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*)::integer FROM execution_runs) AS total,
        (SELECT COUNT(*)::integer FROM execution_runs WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h,
        (SELECT COUNT(*)::integer FROM execution_runs WHERE status IN ('created', 'running', 'paused')) AS active,
        (SELECT COUNT(*)::integer FROM execution_runs WHERE share_token IS NOT NULL) AS shared,
        (SELECT COUNT(*)::integer FROM execution_run_report_accesses WHERE created_at >= NOW() - INTERVAL '24 hours') AS report_accesses_24h,
        COALESCE((
          SELECT jsonb_object_agg(mode, count)
          FROM (
            SELECT mode, COUNT(*)::integer AS count
            FROM execution_runs
            GROUP BY mode
          ) mode_counts
        ), '{}'::jsonb) AS by_mode,
        COALESCE((
          SELECT jsonb_object_agg(status, count)
          FROM (
            SELECT status, COUNT(*)::integer AS count
            FROM execution_runs
            GROUP BY status
          ) status_counts
        ), '{}'::jsonb) AS by_status
    `);

    return result.rows[0] || {
      total: 0,
      last_24h: 0,
      active: 0,
      shared: 0,
      report_accesses_24h: 0,
      by_mode: {},
      by_status: {}
    };
  }

  static async findById(userId, runId) {
    const result = await db.query(
      'SELECT * FROM execution_runs WHERE id = $1 AND user_id = $2',
      [runId, userId]
    );
    return toCamel(result.rows[0]);
  }

  static async findByIdForAdmin(runId) {
    const result = await db.query(
      `
        SELECT er.*, u.email AS user_email, u.username
        FROM execution_runs er
        JOIN users u ON u.id = er.user_id
        WHERE er.id = $1
      `,
      [runId]
    );
    return toCamel(result.rows[0]);
  }

  static async findByShareToken(shareToken) {
    const signedPayload = verifySignedShareToken(shareToken);
    const values = signedPayload ? [shareToken, signedPayload.runId] : [shareToken];
    const idClause = signedPayload ? 'AND er.id = $2' : '';
    const result = await db.query(
      `
        SELECT er.*, u.email AS user_email, u.username
        FROM execution_runs er
        JOIN users u ON u.id = er.user_id
        WHERE er.share_token = $1
          ${idClause}
          AND er.share_expires_at > NOW()
      `,
      values
    );
    const run = toCamel(result.rows[0]);
    if (!run) return null;
    const verifiedShareScope = signedPayload?.scope || normalizeShareScope(run.shareScope);
    if (!this.shareScopeAllowsRun(run, verifiedShareScope)) return null;
    return {
      ...run,
      verifiedShareScope
    };
  }

  static async update(userId, runId, updates) {
    const allowedFields = {
      name: 'name',
      status: 'status',
      source: 'source',
      config: 'config',
      metrics: 'metrics',
      parentRunId: 'parent_run_id',
      lineageType: 'lineage_type',
      marketDataSnapshotId: 'market_data_snapshot_id',
      marketDataSnapshot: 'market_data_snapshot',
      confidence: 'confidence',
      startedAt: 'started_at',
      endedAt: 'ended_at',
      errorMessage: 'error_message'
    };

    const previous = await this.findById(userId, runId);
    if (!previous) return null;
    if (Object.prototype.hasOwnProperty.call(updates, 'parentRunId') || Object.prototype.hasOwnProperty.call(updates, 'lineageType')) {
      await this.validateLineageRelationship(userId, {
        ...previous,
        parentRunId: Object.prototype.hasOwnProperty.call(updates, 'parentRunId') ? updates.parentRunId : previous.parentRunId,
        lineageType: Object.prototype.hasOwnProperty.call(updates, 'lineageType') ? updates.lineageType : previous.lineageType
      });
    }

    const fields = [];
    const values = [];
    const changedKeys = [];

    for (const [key, value] of Object.entries(updates)) {
      const column = allowedFields[key];
      if (!column) continue;
      if (key === 'status') this.validateStatus(value);
      if (key === 'lineageType') this.validateLineageType(value);

      const isJsonb = ['config', 'metrics', 'marketDataSnapshot', 'confidence'].includes(key);
      values.push(isJsonb ? JSON.stringify(value || {}) : value);
      fields.push(`${column} = $${values.length}${isJsonb ? '::jsonb' : ''}`);
      changedKeys.push(key);
    }

    if (fields.length === 0) {
      const error = new Error('No execution run fields changed');
      error.status = 400;
      throw error;
    }

    values.push(runId, userId);
    return this._withTransaction(async (client) => {
      const result = await client.query(
        `
          UPDATE execution_runs
          SET ${fields.join(', ')},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $${values.length - 1} AND user_id = $${values.length}
          RETURNING *
        `,
        values
      );

      const run = toCamel(result.rows[0]);
      if (!run) return null;

      if (Object.prototype.hasOwnProperty.call(updates, 'status') && previous.status !== run.status) {
        await this._recordEvent(client, runId, 'run.status_changed', {
          from: previous.status,
          to: run.status,
          errorMessage: run.errorMessage || null
        });
      }

      const nonStatusChanges = changedKeys.filter(key => key !== 'status');
      if (nonStatusChanges.length > 0) {
        await this._recordEvent(client, runId, 'run.updated', {
          fields: nonStatusChanges,
          status: run.status
        });
      }

      return run;
    });
  }

  static async appendEvent(userId, runId, eventType, payload = {}) {
    this.validateEventType(eventType);
    const run = await this.findById(userId, runId);
    if (!run) return null;

    return this._recordEvent(db, runId, eventType, payload);
  }

  static async _recordShareAudit(client, runId, {
    actorUserId = null,
    action,
    token = null,
    previousToken = null,
    scope = {},
    reason = null,
    recipient = null,
    expiresAt = null
  }) {
    const result = await client.query(
      `
        INSERT INTO execution_run_share_audits (
          run_id, actor_user_id, action, token_hash, previous_token_hash,
          scope, reason, recipient, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
        RETURNING *
      `,
      [
        runId,
        actorUserId,
        action,
        tokenHash(token),
        tokenHash(previousToken),
        JSON.stringify(scope || {}),
        cleanText(reason, 500),
        cleanText(recipient, 180),
        expiresAt || null
      ]
    );

    return toShareAuditCamel(result.rows[0]);
  }

  static async share(userId, runId, options = {}) {
    const expiresAt = parseShareExpiresAt(options);
    const scope = normalizeShareScope(options.scope || options);
    const token = createSignedShareToken({ runId, expiresAt, scope });

    return this._withTransaction(async (client) => {
      const previousResult = await client.query(
        'SELECT share_token FROM execution_runs WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [runId, userId]
      );
      const previousToken = previousResult.rows[0]?.share_token || null;
      const action = previousToken ? 'rotate' : 'share';
      const result = await client.query(
        `
          UPDATE execution_runs
          SET share_token = $3,
              shared_at = CURRENT_TIMESTAMP,
              share_expires_at = $4,
              share_scope = $5::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND user_id = $2
          RETURNING *
        `,
        [runId, userId, token, expiresAt, JSON.stringify(scope)]
      );

      const run = toCamel(result.rows[0]);
      if (run) {
        await this._recordEvent(client, runId, 'run.shared', {
          action,
          expiresAt,
          scope,
          recipient: scope.recipient,
          reason: cleanText(options.reason, 500)
        });
        await this._recordShareAudit(client, runId, {
          actorUserId: userId,
          action,
          token,
          previousToken,
          scope,
          reason: options.reason || null,
          recipient: scope.recipient,
          expiresAt
        });
      }
      return run;
    });
  }

  static async unshare(userId, runId, options = {}) {
    return this._withTransaction(async (client) => {
      const previousResult = await client.query(
        'SELECT share_token, share_scope FROM execution_runs WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [runId, userId]
      );
      const previousToken = previousResult.rows[0]?.share_token || null;
      const previousScope = previousResult.rows[0]?.share_scope || {};
      const action = options.reason ? 'revoke' : 'unshare';
      const result = await client.query(
        `
          UPDATE execution_runs
          SET share_token = NULL,
              shared_at = NULL,
              share_expires_at = NULL,
              share_scope = DEFAULT,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND user_id = $2
          RETURNING *
        `,
        [runId, userId]
      );

      const run = toCamel(result.rows[0]);
      if (run) {
        await this._recordEvent(client, runId, 'run.unshared', {
          action,
          reason: cleanText(options.reason, 500)
        });
        await this._recordShareAudit(client, runId, {
          actorUserId: userId,
          action,
          previousToken,
          scope: previousScope,
          reason: options.reason || null,
          recipient: previousScope.recipient || null
        });
      }
      return run;
    });
  }

  static shareScopeAllowsRun(run = {}, scope = {}) {
    const scopedAccountIds = Array.isArray(scope.accountIds) ? scope.accountIds.filter(Boolean) : [];
    if (scopedAccountIds.length === 0) return true;
    const runAccountIds = extractRunAccountIds(run);
    if (runAccountIds.length === 0) return false;
    return runAccountIds.some(accountId => scopedAccountIds.includes(accountId));
  }

  static async listShareScopeAccounts(userId, runId) {
    const run = await this.findById(userId, runId);
    if (!run) return null;

    const runAccountIds = extractRunAccountIds(run);
    if (runAccountIds.length === 0) {
      return {
        runAccountIds,
        accounts: [],
        unresolvedAccountIds: []
      };
    }

    const result = await db.query(
      `
        SELECT
          ua.*,
          (
            SELECT COUNT(*)
            FROM trades t
            WHERE t.user_id = $1
              AND t.account_identifier = ua.account_identifier
              AND ua.account_identifier IS NOT NULL
          ) AS trade_count
        FROM user_accounts ua
        WHERE ua.user_id = $1
          AND (
            ua.id::text = ANY($2::text[])
            OR ua.account_identifier = ANY($2::text[])
          )
        ORDER BY ua.is_primary DESC, ua.account_name ASC
      `,
      [userId, runAccountIds]
    );

    const accounts = result.rows.map(toShareScopeAccountCamel);
    const accountScopeIds = new Set(accounts.flatMap(account => [account.id, account.accountIdentifier, account.scopeId].filter(Boolean)));
    return {
      runAccountIds,
      accounts,
      unresolvedAccountIds: runAccountIds.filter(accountId => !accountScopeIds.has(accountId))
    };
  }

  static defaultReportTemplates() {
    return Object.values(DEFAULT_REPORT_TEMPLATES).map(template => ({
      ...template,
      sections: normalizeReportSections(template.sections),
      shareDefaults: { ...normalizeShareScope(template.shareDefaults), template: template.templateKey }
    }));
  }

  static async listReportTemplates(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.enabled !== undefined) {
      values.push(String(filters.enabled) === 'true');
      clauses.push(`is_enabled = $${values.length}`);
    }
    const result = await db.query(
      `
        SELECT *
        FROM execution_report_templates
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY template_key ASC
      `,
      values
    );
    return result.rows.map(toReportTemplateCamel);
  }

  static async getReportTemplate(templateKey = 'trader') {
    const normalized = normalizeReportTemplate(templateKey);
    const fallback = defaultReportTemplate(normalized);
    const result = await db.query(
      `
        SELECT *
        FROM execution_report_templates
        WHERE template_key = $1
          AND is_enabled = TRUE
        LIMIT 1
      `,
      [normalized]
    );
    return toReportTemplateCamel(result.rows[0]) || fallback;
  }

  static async upsertReportTemplate(templateKey = 'trader', data = {}, actorUserId = null) {
    const validation = validateReportTemplateDraft(templateKey, data);
    if (!validation.valid) {
      const error = new Error(validation.errors.join('; '));
      error.status = 400;
      throw error;
    }
    const { template } = validation;

    const result = await db.query(
      `
        INSERT INTO execution_report_templates (
          template_key, label, description, sections, share_defaults, is_enabled, updated_by
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
        ON CONFLICT (template_key) DO UPDATE SET
          label = EXCLUDED.label,
          description = EXCLUDED.description,
          sections = EXCLUDED.sections,
          share_defaults = EXCLUDED.share_defaults,
          is_enabled = EXCLUDED.is_enabled,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        template.templateKey,
        template.label,
        template.description,
        JSON.stringify(template.sections),
        JSON.stringify(template.shareDefaults),
        template.isEnabled,
        actorUserId
      ]
    );
    return toReportTemplateCamel(result.rows[0]);
  }

  static async requestReportTemplateUpdate(templateKey = 'trader', data = {}, actorUserId = null) {
    const validation = validateReportTemplateDraft(templateKey, data);
    if (!validation.valid) {
      const error = new Error(validation.errors.join('; '));
      error.status = 400;
      throw error;
    }
    const current = await this.getReportTemplate(validation.template.templateKey);
    const diffSummary = reportTemplateDiffSummary(current, validation.template);
    const result = await db.query(
      `
        INSERT INTO execution_report_template_revisions (
          template_key, requested_by, before_template, after_template, diff_summary
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
        RETURNING *
      `,
      [
        validation.template.templateKey,
        actorUserId,
        JSON.stringify(current || {}),
        JSON.stringify(validation.template),
        JSON.stringify(diffSummary)
      ]
    );
    return toReportTemplateRevisionCamel(result.rows[0]);
  }

  static async listReportTemplateRevisions(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.templateKey || filters.template_key) {
      values.push(normalizeReportTemplate(filters.templateKey || filters.template_key));
      clauses.push(`template_key = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`approval_status = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT *
        FROM execution_report_template_revisions
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY requested_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toReportTemplateRevisionCamel);
  }

  static async runReportTemplateRevisionAction(revisionId, action = 'approve', reviewerUserId = null) {
    if (!['approve', 'reject', 'rollback'].includes(action)) {
      const error = new Error('Unsupported report template revision action');
      error.status = 400;
      throw error;
    }

    const existingResult = await db.query(
      `
        SELECT *
        FROM execution_report_template_revisions
        WHERE id = $1
      `,
      [revisionId]
    );
    const revision = existingResult.rows[0];
    if (!revision) {
      const error = new Error('Report template revision not found');
      error.status = 404;
      throw error;
    }
    if (action !== 'rollback') {
      assertCanReviewOwnRequest({
        requestedBy: revision.requested_by,
        reviewerUserId,
        resource: 'report template revision'
      });
    }

    if (action === 'reject') {
      if (revision.approval_status !== 'pending') {
        const error = new Error('Only pending report template revisions can be rejected');
        error.status = 400;
        throw error;
      }
      const rejectedResult = await db.query(
        `
          UPDATE execution_report_template_revisions
          SET approval_status = 'rejected',
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [revisionId, reviewerUserId]
      );
      return { revision: toReportTemplateRevisionCamel(rejectedResult.rows[0]), template: null };
    }

    if (action === 'rollback') {
      if (!['applied', 'approved'].includes(revision.approval_status)) {
        const error = new Error('Only applied report template revisions can be rolled back');
        error.status = 400;
        throw error;
      }
      const beforeTemplate = revision.before_template || {};
      const template = await this.upsertReportTemplate(revision.template_key, beforeTemplate, reviewerUserId);
      const rolledBackResult = await db.query(
        `
          UPDATE execution_report_template_revisions
          SET approval_status = 'rolled_back',
              reviewed_by = COALESCE(reviewed_by, $2),
              reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
              applied_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [revisionId, reviewerUserId]
      );
      return { revision: toReportTemplateRevisionCamel(rolledBackResult.rows[0]), template };
    }

    if (revision.approval_status !== 'pending') {
      const error = new Error('Report template revision has already been reviewed');
      error.status = 400;
      throw error;
    }
    const template = await this.upsertReportTemplate(revision.template_key, revision.after_template || {}, reviewerUserId);
    const approvedResult = await db.query(
      `
        UPDATE execution_report_template_revisions
        SET approval_status = 'applied',
            reviewed_by = $2,
            reviewed_at = CURRENT_TIMESTAMP,
            applied_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [revisionId, reviewerUserId]
    );
    return { revision: toReportTemplateRevisionCamel(approvedResult.rows[0]), template };
  }

  static validateReportTemplateDraft(templateKey = 'trader', data = {}) {
    return validateReportTemplateDraft(templateKey, data);
  }

  static async backfillEventHashes(options = {}) {
    const values = [];
    const clauses = [];
    if (options.runId) {
      values.push(options.runId);
      clauses.push(`run_id = $${values.length}`);
    }
    const limit = Math.min(Math.max(parseInt(options.limit || '1000', 10), 1), 10000);
    values.push(limit);

    const result = await db.query(
      `
        SELECT *
        FROM execution_run_events
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY run_id ASC, created_at ASC, id ASC
        LIMIT $${values.length}
      `,
      values
    );

    const runs = new Map();
    result.rows.forEach(row => {
      const events = runs.get(row.run_id) || [];
      events.push(toEventCamel(row));
      runs.set(row.run_id, events);
    });

    let checkedEvents = 0;
    let updatedEvents = 0;
    const repairedRuns = [];
    for (const [runId, events] of runs.entries()) {
      let previousEventHash = null;
      let runUpdated = 0;
      for (const event of events) {
        const nextHash = eventHashFor({
          runId,
          eventType: event.eventType,
          payload: event.payload || {},
          previousEventHash
        });
        checkedEvents += 1;
        if (event.previousEventHash !== previousEventHash || event.eventHash !== nextHash) {
          await db.query(
            `
              UPDATE execution_run_events
              SET previous_event_hash = $2,
                  event_hash = $3
              WHERE id = $1
            `,
            [event.id, previousEventHash, nextHash]
          );
          updatedEvents += 1;
          runUpdated += 1;
        }
        previousEventHash = nextHash;
      }
      if (runUpdated > 0) repairedRuns.push({ runId, updatedEvents: runUpdated });
    }

    return {
      checkedEvents,
      updatedEvents,
      repairedRuns,
      limited: result.rows.length === limit
    };
  }

  static async findEventChainViolations(options = {}) {
    const runLimit = Math.min(Math.max(parseInt(options.limit || '200', 10), 1), 1000);
    const runResult = await db.query(
      `
        SELECT er.id, er.user_id, er.name, er.mode, er.source, COUNT(ere.id)::integer AS event_count
        FROM execution_runs er
        JOIN execution_run_events ere ON ere.run_id = er.id
        WHERE ere.event_hash IS NOT NULL
        GROUP BY er.id, er.user_id, er.name, er.mode, er.source
        ORDER BY MAX(ere.created_at) DESC
        LIMIT $1
      `,
      [runLimit]
    );
    if (runResult.rows.length === 0) return [];

    const runIds = runResult.rows.map(row => row.id);
    const eventResult = await db.query(
      `
        SELECT *
        FROM execution_run_events
        WHERE run_id = ANY($1::uuid[])
        ORDER BY run_id ASC, created_at ASC, id ASC
      `,
      [runIds]
    );

    const eventsByRun = new Map();
    eventResult.rows.forEach(row => {
      const events = eventsByRun.get(row.run_id) || [];
      events.push(toEventCamel(row));
      eventsByRun.set(row.run_id, events);
    });

    return runResult.rows
      .map(row => {
        const events = eventsByRun.get(row.id) || [];
        const verification = verifyEventChain(events);
        return {
          runId: row.id,
          userId: row.user_id,
          name: row.name,
          mode: row.mode,
          source: row.source,
          eventCount: Number(row.event_count || events.length),
          verification
        };
      })
      .filter(item => item.verification.valid === false);
  }

  static async getReport(userId, runId, options = {}) {
    const run = options.admin ? await this.findByIdForAdmin(runId) : await this.findById(userId, runId);
    if (!run) return null;

    const events = await this.listEvents(run.userId, runId);
    const reportAccesses = await this.listReportAccesses(runId, { limit: 25 });
    const shareAudits = await this.listShareAudits(runId, { limit: 25 });
    const template = normalizeReportTemplate(options.template || run.shareScope?.template);
    const templateConfig = await this.getReportTemplate(template);
    const eventChain = verifyEventChain(events || []);
    const watermark = cleanText(options.watermark || run.shareScope?.watermark, 120);
    const recipient = cleanText(options.recipient || run.shareScope?.recipient, 180);
    const provenanceHash = sha256(stableJson({
      reportVersion: 2,
      template,
      templateConfig,
      run: {
        id: run.id,
        userId: run.userId,
        mode: run.mode,
        status: run.status,
        source: run.source,
        config: run.config || {},
        metrics: run.metrics || {},
        confidence: run.confidence || {},
        parentRunId: run.parentRunId,
        lineageType: run.lineageType,
        marketDataSnapshotId: run.marketDataSnapshotId,
        marketDataSnapshot: run.marketDataSnapshot || {}
      },
      eventHashes: (events || []).map(event => event.eventHash || sha256(stableJson({
        eventType: event.eventType,
        payload: event.payload || {},
        createdAt: event.createdAt
      }))),
      reportAccessIds: reportAccesses.map(access => access.id),
      shareAuditIds: shareAudits.map(audit => audit.id)
    }));
    return {
      generatedAt: new Date().toISOString(),
      template,
      templateConfig,
      watermark,
      recipient,
      provenanceHash,
      eventChain,
      run,
      events: events || [],
      reportAccesses,
      shareAudits,
      summary: {
        mode: run.mode,
        status: run.status,
        source: run.source,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        metrics: run.metrics || {},
        confidence: run.confidence || {},
        marketDataSnapshotId: run.marketDataSnapshotId,
        parentRunId: run.parentRunId,
        eventCount: events ? events.length : 0,
        provenanceHash,
        eventChain
      }
    };
  }

  static async recordReportAccess(runId, data = {}) {
    const result = await db.query(
      `
        INSERT INTO execution_run_report_accesses (
          run_id, share_token, user_id, access_type, format, request_id, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8)
        RETURNING *
      `,
      [
        runId,
        data.shareToken || null,
        data.userId || null,
        data.accessType || 'owner',
        data.format || 'json',
        data.requestId || null,
        data.ipAddress || null,
        data.userAgent || null
      ]
    );

    return toReportAccessCamel(result.rows[0]);
  }

  static async listReportAccesses(runId, options = {}) {
    const limit = Math.min(Math.max(parseInt(options.limit || '50', 10), 1), 500);
    const result = await db.query(
      `
        SELECT *
        FROM execution_run_report_accesses
        WHERE run_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [runId, limit]
    );

    return result.rows.map(toReportAccessCamel);
  }

  static async listShareAudits(runId, options = {}) {
    const limit = Math.min(Math.max(parseInt(options.limit || '50', 10), 1), 500);
    const result = await db.query(
      `
        SELECT *
        FROM execution_run_share_audits
        WHERE run_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [runId, limit]
    );

    return result.rows.map(toShareAuditCamel);
  }

  static async getWorkflowSettings(source = 'default') {
    const result = await db.query(
      `
        SELECT *
        FROM execution_workflow_settings
        WHERE source IN ($1, 'default')
        ORDER BY CASE WHEN source = $1 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [source || 'default']
    );

    return toWorkflowSettingsCamel(result.rows[0]) || {
      source: 'default',
      confidenceLevels: DEFAULT_CONFIDENCE_LEVELS,
      sharedReportAccessThreshold: 10,
      sharedReportAccessWindowMinutes: 15
    };
  }

  static async listWorkflowSettings() {
    const result = await db.query(
      `
        SELECT *
        FROM execution_workflow_settings
        ORDER BY CASE WHEN source = 'default' THEN 0 ELSE 1 END, source ASC
      `
    );
    return result.rows.map(toWorkflowSettingsCamel);
  }

  static async updateWorkflowSettings(source = 'default', updates = {}) {
    const current = await this.getWorkflowSettings(source);
    const normalized = normalizeWorkflowSettings(source, current, updates);

    const result = await db.query(
      `
        INSERT INTO execution_workflow_settings (
          source, confidence_levels, shared_report_access_threshold, shared_report_access_window_minutes
        )
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (source) DO UPDATE SET
          confidence_levels = EXCLUDED.confidence_levels,
          shared_report_access_threshold = EXCLUDED.shared_report_access_threshold,
          shared_report_access_window_minutes = EXCLUDED.shared_report_access_window_minutes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        normalized.source,
        JSON.stringify(normalized.confidenceLevels),
        normalized.sharedReportAccessThreshold,
        normalized.sharedReportAccessWindowMinutes
      ]
    );

    return toWorkflowSettingsCamel(result.rows[0]);
  }

  static async requestWorkflowSettingsUpdate(source = 'default', updates = {}, actorUserId = null) {
    const current = await this.getWorkflowSettings(source);
    const normalized = normalizeWorkflowSettings(source, current, updates);
    const result = await db.query(
      `
        INSERT INTO execution_workflow_setting_revisions (
          source, actor_user_id, before_settings, after_settings
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb)
        RETURNING *
      `,
      [
        normalized.source,
        actorUserId,
        JSON.stringify(current),
        JSON.stringify(normalized)
      ]
    );

    return toWorkflowSettingRevisionCamel(result.rows[0]);
  }

  static async listWorkflowSettingRevisions(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.source) {
      values.push(filters.source);
      clauses.push(`source = $${values.length}`);
    }

    if (filters.status) {
      values.push(filters.status);
      clauses.push(`approval_status = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT *
        FROM execution_workflow_setting_revisions
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY requested_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map(toWorkflowSettingRevisionCamel);
  }

  static async runWorkflowSettingRevisionAction(revisionId, action = 'approve', reviewerUserId = null) {
    if (!['approve', 'reject'].includes(action)) {
      const error = new Error('Unsupported workflow settings revision action');
      error.status = 400;
      throw error;
    }

    return this._withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM execution_workflow_setting_revisions
          WHERE id = $1
          FOR UPDATE
        `,
        [revisionId]
      );
      const revision = existingResult.rows[0];
      if (!revision) {
        const error = new Error('Workflow settings revision not found');
        error.status = 404;
        throw error;
      }
      if (revision.approval_status !== 'pending') {
        const error = new Error('Workflow settings revision has already been reviewed');
        error.status = 400;
        throw error;
      }
      assertCanReviewOwnRequest({
        requestedBy: revision.actor_user_id,
        reviewerUserId,
        resource: 'workflow settings revision'
      });

      if (action === 'reject') {
        const rejectedResult = await client.query(
          `
            UPDATE execution_workflow_setting_revisions
            SET approval_status = 'rejected',
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
          `,
          [revisionId, reviewerUserId]
        );
        return { revision: toWorkflowSettingRevisionCamel(rejectedResult.rows[0]), settings: null };
      }

      const afterSettings = revision.after_settings || {};
      const settingsResult = await client.query(
        `
          INSERT INTO execution_workflow_settings (
            source, confidence_levels, shared_report_access_threshold, shared_report_access_window_minutes
          )
          VALUES ($1, $2::jsonb, $3, $4)
          ON CONFLICT (source) DO UPDATE SET
            confidence_levels = EXCLUDED.confidence_levels,
            shared_report_access_threshold = EXCLUDED.shared_report_access_threshold,
            shared_report_access_window_minutes = EXCLUDED.shared_report_access_window_minutes,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `,
        [
          revision.source,
          JSON.stringify(afterSettings.confidenceLevels || DEFAULT_CONFIDENCE_LEVELS),
          Number(afterSettings.sharedReportAccessThreshold || 10),
          Number(afterSettings.sharedReportAccessWindowMinutes || 15)
        ]
      );
      const revisionResult = await client.query(
        `
          UPDATE execution_workflow_setting_revisions
          SET approval_status = 'applied',
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP,
              applied_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [revisionId, reviewerUserId]
      );

      return {
        revision: toWorkflowSettingRevisionCamel(revisionResult.rows[0]),
        settings: toWorkflowSettingsCamel(settingsResult.rows[0])
      };
    });
  }

  static async listStrategyAnomalySettings(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.source) {
      values.push(filters.source);
      clauses.push(`source = $${values.length}`);
    }
    if (filters.strategy) {
      values.push(filters.strategy);
      clauses.push(`strategy = $${values.length}`);
    }

    const result = await db.query(
      `
        SELECT *
        FROM execution_strategy_anomaly_settings
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY source ASC, strategy ASC
      `,
      values
    );
    return result.rows.map(toStrategyAnomalySettingsCamel);
  }

  static async upsertStrategyAnomalySettings(source = 'trade-management', strategy, updates = {}) {
    const normalizedSource = String(source || 'trade-management').trim() || 'trade-management';
    const normalizedStrategy = cleanText(strategy || updates.strategy, 120);
    if (!normalizedStrategy) {
      const error = new Error('Strategy is required for anomaly settings');
      error.status = 400;
      throw error;
    }
    const current = await this.getWorkflowSettings(normalizedSource);
    const threshold = Number(updates.sharedReportAccessThreshold || updates.shared_report_access_threshold || current.sharedReportAccessThreshold || 10);
    const windowMinutes = Number(updates.sharedReportAccessWindowMinutes || updates.shared_report_access_window_minutes || current.sharedReportAccessWindowMinutes || 15);
    if (!Number.isFinite(threshold) || threshold < 2 || threshold > 10000) {
      const error = new Error('Shared report access threshold must be between 2 and 10000');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(windowMinutes) || windowMinutes < 1 || windowMinutes > 10080) {
      const error = new Error('Shared report access window must be between 1 minute and 7 days');
      error.status = 400;
      throw error;
    }

    const result = await db.query(
      `
        INSERT INTO execution_strategy_anomaly_settings (
          source, strategy, shared_report_access_threshold, shared_report_access_window_minutes
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (source, strategy) DO UPDATE SET
          shared_report_access_threshold = EXCLUDED.shared_report_access_threshold,
          shared_report_access_window_minutes = EXCLUDED.shared_report_access_window_minutes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [normalizedSource, normalizedStrategy, Math.round(threshold), Math.round(windowMinutes)]
    );

    return toStrategyAnomalySettingsCamel(result.rows[0]);
  }

  static async recordPerformanceMeasurement(endpointKey, durationMs, metadata = {}) {
    await db.query(
      `
        INSERT INTO execution_performance_measurements (
          endpoint_key, duration_ms, request_id, status_code
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        endpointKey,
        Math.max(0, Math.round(durationMs || 0)),
        metadata.requestId || null,
        metadata.statusCode || null
      ]
    );
  }

  static async listPerformanceBudgets(options = {}) {
    const hours = Math.min(Math.max(parseInt(options.hours || '24', 10), 1), 168);
    const result = await db.query(
      `
        SELECT
          b.endpoint_key,
          b.method,
          b.path_pattern,
          b.budget_ms,
          b.p95_budget_ms,
          b.is_enabled,
          COALESCE(m.sample_count, 0)::integer AS sample_count,
          COALESCE(m.avg_duration_ms, 0)::integer AS avg_duration_ms,
          COALESCE(m.p95_duration_ms, 0)::integer AS p95_duration_ms,
          COALESCE(m.max_duration_ms, 0)::integer AS max_duration_ms,
          m.last_seen_at,
          COALESCE(q.query_sample_count, 0)::integer AS query_sample_count,
          COALESCE(q.query_avg_duration_ms, 0)::integer AS query_avg_duration_ms,
          COALESCE(q.query_p50_duration_ms, 0)::integer AS query_p50_duration_ms,
          COALESCE(q.query_p95_duration_ms, 0)::integer AS query_p95_duration_ms,
          COALESCE(q.query_max_duration_ms, 0)::integer AS query_max_duration_ms,
          COALESCE(q.query_labels, '[]'::jsonb) AS query_labels
        FROM execution_performance_budgets b
        LEFT JOIN (
          SELECT
            endpoint_key,
            COUNT(*)::integer AS sample_count,
            ROUND(AVG(duration_ms))::integer AS avg_duration_ms,
            ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer AS p95_duration_ms,
            MAX(duration_ms)::integer AS max_duration_ms,
            MAX(created_at) AS last_seen_at
          FROM execution_performance_measurements
          WHERE created_at >= NOW() - ($1::text || ' hours')::interval
          GROUP BY endpoint_key
        ) m ON m.endpoint_key = b.endpoint_key
        LEFT JOIN (
          SELECT
            totals.endpoint_key,
            totals.query_sample_count,
            totals.query_avg_duration_ms,
            totals.query_p50_duration_ms,
            totals.query_p95_duration_ms,
            totals.query_max_duration_ms,
            COALESCE(labels.query_labels, '[]'::jsonb) AS query_labels
          FROM (
            SELECT
              endpoint_key,
              COUNT(*)::integer AS query_sample_count,
              ROUND(AVG(duration_ms))::integer AS query_avg_duration_ms,
              ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms))::integer AS query_p50_duration_ms,
              ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer AS query_p95_duration_ms,
              MAX(duration_ms)::integer AS query_max_duration_ms
            FROM execution_db_query_measurements
            WHERE created_at >= NOW() - ($1::text || ' hours')::interval
            GROUP BY endpoint_key
          ) totals
          LEFT JOIN (
            SELECT endpoint_key,
              jsonb_agg(
                jsonb_build_object(
                  'queryLabel', query_label,
                  'sampleCount', sample_count,
                  'avgDurationMs', avg_duration_ms,
                  'p95DurationMs', p95_duration_ms,
                  'maxDurationMs', max_duration_ms
                )
                ORDER BY p95_duration_ms DESC, query_label ASC
              ) AS query_labels
            FROM (
              SELECT
                endpoint_key,
                query_label,
                COUNT(*)::integer AS sample_count,
                ROUND(AVG(duration_ms))::integer AS avg_duration_ms,
                ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer AS p95_duration_ms,
                MAX(duration_ms)::integer AS max_duration_ms
              FROM execution_db_query_measurements
              WHERE created_at >= NOW() - ($1::text || ' hours')::interval
              GROUP BY endpoint_key, query_label
            ) query_rollups
            GROUP BY endpoint_key
          ) labels ON labels.endpoint_key = totals.endpoint_key
        ) q ON q.endpoint_key = b.endpoint_key
        ORDER BY b.endpoint_key ASC
      `,
      [hours]
    );

    return result.rows.map(row => ({
      endpointKey: row.endpoint_key,
      method: row.method,
      pathPattern: row.path_pattern,
      budgetMs: Number(row.budget_ms),
      p95BudgetMs: Number(row.p95_budget_ms),
      isEnabled: row.is_enabled,
      sampleCount: Number(row.sample_count || 0),
      avgDurationMs: Number(row.avg_duration_ms || 0),
      p95DurationMs: Number(row.p95_duration_ms || 0),
      maxDurationMs: Number(row.max_duration_ms || 0),
      lastSeenAt: row.last_seen_at,
      dbQueryLatency: {
        sampleCount: Number(row.query_sample_count || 0),
        avgDurationMs: Number(row.query_avg_duration_ms || 0),
        p50DurationMs: Number(row.query_p50_duration_ms || 0),
        p95DurationMs: Number(row.query_p95_duration_ms || 0),
        maxDurationMs: Number(row.query_max_duration_ms || 0),
        labels: row.query_labels || []
      },
      status: Number(row.p95_duration_ms || 0) > Number(row.p95_budget_ms) ? 'breached' : 'ok'
    }));
  }

  static async compareByModes(userId, filters = {}) {
    const sourceClause = filters.source ? 'AND source = $2' : '';
    const values = filters.source ? [userId, filters.source] : [userId];
    const workflowSettings = await this.getWorkflowSettings(filters.source || 'default');
    const confidenceLevels = normalizeConfidenceLevels(
      filters.confidenceLevels || filters.confidence_levels,
      workflowSettings.confidenceLevels
    );

    const result = await db.query(
      `
        WITH ranked AS (
          SELECT *,
            ROW_NUMBER() OVER (
              PARTITION BY mode
              ORDER BY
                CASE WHEN metrics <> '{}'::jsonb THEN 0 ELSE 1 END,
                CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
                created_at DESC
            ) AS rn
          FROM execution_runs
          WHERE user_id = $1
          ${sourceClause}
        )
        SELECT *
        FROM ranked
        WHERE rn = 1
        ORDER BY CASE mode WHEN 'live' THEN 1 WHEN 'replay' THEN 2 ELSE 3 END
      `,
      values
    );

    const runs = result.rows.map(toCamel);
    const metricKeys = Array.from(new Set(
      runs.flatMap(run => Object.keys(run.metrics || {}))
    )).sort();
    const liveRun = runs.find(run => run.mode === 'live') || null;
    const historyResult = await db.query(
      `
        SELECT mode, metrics
        FROM execution_runs
        WHERE user_id = $1
          ${sourceClause}
          AND status = 'completed'
          AND metrics <> '{}'::jsonb
        ORDER BY created_at DESC
        LIMIT 150
      `,
      values
    );

    const metrics = metricKeys.map(key => {
      const byMode = {};
      const confidenceByMode = {};
      runs.forEach(run => {
        byMode[run.mode] = Number(run.metrics?.[key] ?? 0);
        const historicalValues = historyResult.rows
          .filter(row => row.mode === run.mode)
          .map(row => row.metrics?.[key])
          .filter(value => value !== undefined && value !== null);
        confidenceByMode[run.mode] = numberStats(historicalValues, confidenceLevels);
      });
      return {
        key,
        byMode,
        confidenceByMode,
        deltasFromLive: liveRun
          ? Object.fromEntries(runs.map(run => [run.mode, Number(run.metrics?.[key] ?? 0) - Number(liveRun.metrics?.[key] ?? 0)]))
          : {}
      };
    });

    return {
      runs,
      metrics,
      confidenceLevels,
      workflowSettings
    };
  }

  static async listEvents(userId, runId) {
    const run = await this.findById(userId, runId);
    if (!run) return null;

    const result = await db.query(
      `
        SELECT *
        FROM execution_run_events
        WHERE run_id = $1
        ORDER BY created_at ASC
      `,
      [runId]
    );

    return result.rows.map(toEventCamel);
  }
}

module.exports = ExecutionRun;
