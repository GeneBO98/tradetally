// Regression coverage for the v3.0 dynamic user data export/import in
// settings.controller.js (documented fragility hotspot: dynamic field mapping
// via toCamelCase/keysToSnakeCase, getTableColumns against
// information_schema.columns, dynamicInsert column filtering, JSONB handling,
// legacy v1/v2 path preserved, version detection via exportVersion >= '3.0').
//
// The helpers are module-internal, so everything is exercised through the
// exportUserData/importUserData controller functions with a mocked database.

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));

jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn(),
  createSettings: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({}));

jest.mock('../../src/services/adminSettings', () => ({
  getDefaultAISettings: jest.fn(),
  updateDefaultAISettings: jest.fn()
}));

jest.mock('../../src/utils/urlSecurity', () => ({
  validateAiProviderUrl: jest.fn()
}));

jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  isEncrypted: jest.fn(() => false),
  encrypt: jest.fn(value => `enc:${value}`)
}));

jest.mock('../../src/services/pnlEngine', () => ({
  computeTradePnl: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('UTC')
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidate: jest.fn().mockResolvedValue()
}));

jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn().mockResolvedValue()
}));

const db = require('../../src/config/database');
const settingsController = require('../../src/controllers/settings.controller');

const USER_ID = 'user-1';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Snake_case rows as PostgreSQL would return them on export.
const userRow = {
  username: 'janetrader',
  full_name: 'Jane Q Trader',
  email: 'jane@example.com',
  timezone: 'America/New_York'
};

const settingsRow = {
  id: 'settings-1',
  user_id: USER_ID,
  email_notifications: true,
  account_equity: '25000.00',
  default_tags: ['momentum'],
  analytics_chart_layout: { order: ['pnl', 'winRate'] },
  trading_strategies: ['scalping'],
  risk_tolerance: 'aggressive',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-02T00:00:00.000Z'
};

const tradeRow = {
  id: 'trade-1',
  user_id: USER_ID,
  symbol: 'AAPL',
  side: 'long',
  quantity: 100,
  entry_price: '190.25',
  exit_price: '195.50',
  entry_time: '2025-03-01T14:30:00.000Z',
  exit_time: '2025-03-01T15:45:00.000Z',
  trade_date: '2025-03-01',
  pnl: '525.00',
  pnl_percent: '2.76',
  commission: '1.00',
  fees: '0.35',
  broker: 'lightspeed',
  notes: 'gap and go',
  quality_metrics: { score: 87, factors: ['risk', 'timing'] },
  created_at: '2025-03-01T16:00:00.000Z',
  updated_at: '2025-03-01T16:00:00.000Z'
};

const tagRow = { id: 'tag-1', user_id: USER_ID, name: 'momentum', color: '#ff8800' };

// information_schema.columns fixture used by getTableColumns on import.
// Deliberately a SUBSET of what a real DB has so we can prove unknown
// payload fields are filtered out instead of crashing the INSERT.
const SCHEMA = {
  trades: [
    { name: 'id', dataType: 'uuid', udtName: 'uuid' },
    { name: 'user_id', dataType: 'uuid', udtName: 'uuid' },
    { name: 'import_id', dataType: 'uuid', udtName: 'uuid' },
    { name: 'symbol', dataType: 'character varying', udtName: 'varchar' },
    { name: 'side', dataType: 'character varying', udtName: 'varchar' },
    { name: 'quantity', dataType: 'numeric', udtName: 'numeric' },
    { name: 'entry_price', dataType: 'numeric', udtName: 'numeric' },
    { name: 'exit_price', dataType: 'numeric', udtName: 'numeric' },
    { name: 'entry_time', dataType: 'timestamp with time zone', udtName: 'timestamptz' },
    { name: 'exit_time', dataType: 'timestamp with time zone', udtName: 'timestamptz' },
    { name: 'trade_date', dataType: 'date', udtName: 'date' },
    { name: 'pnl', dataType: 'numeric', udtName: 'numeric' },
    { name: 'pnl_percent', dataType: 'numeric', udtName: 'numeric' },
    { name: 'commission', dataType: 'numeric', udtName: 'numeric' },
    { name: 'fees', dataType: 'numeric', udtName: 'numeric' },
    { name: 'broker', dataType: 'character varying', udtName: 'varchar' },
    { name: 'notes', dataType: 'text', udtName: 'text' },
    { name: 'quality_metrics', dataType: 'jsonb', udtName: 'jsonb' },
    { name: 'created_at', dataType: 'timestamp with time zone', udtName: 'timestamptz' },
    { name: 'updated_at', dataType: 'timestamp with time zone', udtName: 'timestamptz' }
  ],
  user_settings: [
    { name: 'id', dataType: 'uuid', udtName: 'uuid' },
    { name: 'user_id', dataType: 'uuid', udtName: 'uuid' },
    { name: 'email_notifications', dataType: 'boolean', udtName: 'bool' },
    { name: 'account_equity', dataType: 'numeric', udtName: 'numeric' },
    { name: 'default_tags', dataType: 'ARRAY', udtName: '_text' },
    { name: 'analytics_chart_layout', dataType: 'jsonb', udtName: 'jsonb' },
    { name: 'trading_strategies', dataType: 'ARRAY', udtName: '_text' },
    { name: 'risk_tolerance', dataType: 'character varying', udtName: 'varchar' },
    { name: 'created_at', dataType: 'timestamp with time zone', udtName: 'timestamptz' },
    { name: 'updated_at', dataType: 'timestamp with time zone', udtName: 'timestamptz' }
  ]
};

// ---------------------------------------------------------------------------
// Mock plumbing
// ---------------------------------------------------------------------------

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn()
  };
}

// Pool-level db.query mock used by exportUserData and the import schema check.
function installExportDbMock(rowsByTable = {}) {
  db.query.mockImplementation(async (sql) => {
    if (sql.includes('information_schema.tables')) {
      return { rows: [{ has_trades: true, has_tags: true, has_users: true }] };
    }
    const match = sql.match(/FROM\s+([a-z_.]+)/i);
    const table = match ? match[1] : null;
    if (table && rowsByTable[table]) {
      return { rows: rowsByTable[table] };
    }
    return { rows: [] };
  });
}

// Transaction client mock used by importUserData. Routes queries by shape and
// records every call so tests can assert the exact INSERT columns/values.
function createImportClient(schema = SCHEMA) {
  const calls = [];
  const client = {
    calls,
    release: jest.fn(),
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params });
      const text = sql.trim();

      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text)) return { rows: [] };

      if (text.includes('information_schema.columns')) {
        const cols = schema[params[0]] || [];
        return {
          rows: cols.map(c => ({
            column_name: c.name,
            data_type: c.dataType,
            udt_name: c.udtName
          }))
        };
      }

      // Existence/duplicate checks: nothing exists in the target DB.
      if (/^SELECT/.test(text)) return { rows: [] };

      if (/^INSERT INTO/.test(text)) {
        if (text.includes('RETURNING (xmax = 0)')) return { rows: [{ inserted: true }] };
        if (text.includes('RETURNING id')) return { rows: [{ id: `new-id-${calls.length}` }] };
        return { rows: [] };
      }

      return { rows: [] };
    })
  };
  return client;
}

function findInsert(client, tableName) {
  return client.calls.find(c => c.sql.trim().startsWith(`INSERT INTO ${tableName}`));
}

// Parses "INSERT INTO t (a, b, c) VALUES ..." into a column->value map.
function insertedColumnsMap(call) {
  const columns = call.sql.match(/\(([^)]+)\)/)[1].split(',').map(c => c.trim());
  const map = {};
  columns.forEach((col, i) => { map[col] = call.params[i]; });
  return map;
}

async function runExport(rowsByTable) {
  installExportDbMock(rowsByTable);
  const req = { user: { id: USER_ID, role: 'user' } };
  const res = createRes();
  const next = jest.fn();
  await settingsController.exportUserData(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledTimes(1);
  return res.json.mock.calls[0][0];
}

async function runImport(payload, { schema = SCHEMA, role = 'user' } = {}) {
  installExportDbMock({}); // schema-exists check only
  const client = createImportClient(schema);
  db.connect.mockResolvedValue(client);

  const json = JSON.stringify(payload);
  const req = {
    user: { id: USER_ID, role },
    file: {
      buffer: Buffer.from(json),
      originalname: 'tradetally-export.json',
      size: json.length,
      mimetype: 'application/json'
    }
  };
  const res = createRes();
  const next = jest.fn();
  await settingsController.importUserData(req, res, next);
  return { client, res, next };
}

describe('settings controller v3.0 export/import', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('exportUserData produces a v3.0 payload with camelCase keys and originalId', async () => {
    const payload = await runExport({
      users: [userRow],
      user_settings: [settingsRow],
      trades: [tradeRow],
      tags: [tagRow],
      equity_history: [{ user_id: USER_ID, date: '2025-03-01', equity: '25525.00', pnl: '525.00' }]
    });

    expect(payload.exportVersion).toBe('3.0');
    expect(payload.exportDate).toEqual(expect.any(String));
    expect(payload.user).toEqual({
      username: 'janetrader',
      firstName: 'Jane',
      lastName: 'Q Trader',
      fullName: 'Jane Q Trader',
      email: 'jane@example.com',
      timezone: 'America/New_York'
    });

    // Trades: snake_case DB row converted to camelCase, id moved to
    // originalId, user_id excluded entirely.
    expect(payload.trades).toHaveLength(1);
    const trade = payload.trades[0];
    expect(trade.originalId).toBe('trade-1');
    expect(trade).not.toHaveProperty('id');
    expect(trade).not.toHaveProperty('user_id');
    expect(trade).not.toHaveProperty('entry_price');
    expect(trade.symbol).toBe('AAPL');
    expect(trade.entryPrice).toBe('190.25');
    expect(trade.exitPrice).toBe('195.50');
    expect(trade.entryTime).toBe('2025-03-01T14:30:00.000Z');
    expect(trade.tradeDate).toBe('2025-03-01');
    expect(trade.pnlPercent).toBe('2.76');
    // JSONB column exported as a live object, not a string.
    expect(trade.qualityMetrics).toEqual({ score: 87, factors: ['risk', 'timing'] });

    // Settings split: trading profile fields extracted into tradingProfile,
    // internal fields (id/user_id/created_at/updated_at) excluded.
    expect(payload.settings).toEqual({
      emailNotifications: true,
      accountEquity: '25000.00',
      defaultTags: ['momentum'],
      analyticsChartLayout: { order: ['pnl', 'winRate'] }
    });
    expect(payload.tradingProfile).toEqual({
      tradingStrategies: ['scalping'],
      riskTolerance: 'aggressive'
    });

    expect(payload.tags).toEqual([{ name: 'momentum', color: '#ff8800' }]);
    expect(payload.equityHistory).toEqual([
      { date: '2025-03-01', equity: '25525.00', pnl: '525.00' }
    ]);
  });

  test('import round-trips an exported v3 payload back into snake_case columns', async () => {
    const exported = await runExport({
      users: [userRow],
      user_settings: [settingsRow],
      trades: [tradeRow],
      tags: [tagRow]
    });

    // Simulate the on-disk JSON file round trip.
    const { client, res } = await runImport(JSON.parse(JSON.stringify(exported)));

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);

    const tradeInsert = findInsert(client, 'trades');
    expect(tradeInsert).toBeDefined();
    const inserted = insertedColumnsMap(tradeInsert);

    // camelCase payload keys converted back to the original snake_case
    // columns with values intact.
    expect(inserted.symbol).toBe('AAPL');
    expect(inserted.side).toBe('long');
    expect(inserted.quantity).toBe(100);
    expect(inserted.entry_price).toBe('190.25');
    expect(inserted.exit_price).toBe('195.50');
    expect(inserted.entry_time).toBe('2025-03-01T14:30:00.000Z');
    expect(inserted.exit_time).toBe('2025-03-01T15:45:00.000Z');
    expect(inserted.trade_date).toBe('2025-03-01');
    expect(inserted.pnl).toBe('525.00');
    expect(inserted.pnl_percent).toBe('2.76');
    expect(inserted.commission).toBe('1.00');
    expect(inserted.fees).toBe('0.35');
    expect(inserted.broker).toBe('lightspeed');
    expect(inserted.notes).toBe('gap and go');

    // Overrides applied: target user owns the row, import_id is reset.
    expect(inserted.user_id).toBe(USER_ID);
    expect(inserted.import_id).toBeNull();

    // id is regenerated by the DB; originalId is an export-only field.
    expect(inserted).not.toHaveProperty('id');
    expect(inserted).not.toHaveProperty('original_id');

    // user_settings round trip through the dynamic settings path.
    const settingsInsert = findInsert(client, 'user_settings');
    expect(settingsInsert).toBeDefined();
    const insertedSettings = insertedColumnsMap(settingsInsert);
    expect(insertedSettings.user_id).toBe(USER_ID);
    expect(insertedSettings.email_notifications).toBe(true);
    expect(insertedSettings.account_equity).toBe('25000.00');
    expect(insertedSettings.default_tags).toEqual(['momentum']);
    expect(insertedSettings.risk_tolerance).toBe('aggressive');
    expect(insertedSettings.trading_strategies).toEqual(['scalping']);

    // Tags re-imported with the hardcoded insert.
    const tagInsert = findInsert(client, 'tags');
    expect(tagInsert.params).toEqual([USER_ID, 'momentum', '#ff8800']);

    expect(client.calls.some(c => c.sql.trim() === 'COMMIT')).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      tradesAdded: 1,
      tradesSkipped: 0,
      tagsAdded: 1
    }));
  });

  test('payload fields missing from information_schema.columns are dropped, not inserted', async () => {
    const exported = await runExport({
      users: [userRow],
      trades: [tradeRow],
      user_settings: [settingsRow]
    });

    // A field from a newer/older schema that the target DB does not have.
    exported.trades[0].futureColumn = 'not-in-target-schema';
    exported.settings.someRetiredSetting = true;

    const { client, res } = await runImport(exported);

    const tradeInsert = findInsert(client, 'trades');
    expect(tradeInsert).toBeDefined();
    const insertedTradeCols = Object.keys(insertedColumnsMap(tradeInsert));
    expect(insertedTradeCols).not.toContain('future_column');
    expect(insertedTradeCols).not.toContain('futureColumn');
    // Every inserted column actually exists in the mocked schema.
    const knownTradeCols = SCHEMA.trades.map(c => c.name);
    insertedTradeCols.forEach(col => expect(knownTradeCols).toContain(col));

    const settingsInsert = findInsert(client, 'user_settings');
    const insertedSettingsCols = Object.keys(insertedColumnsMap(settingsInsert));
    expect(insertedSettingsCols).not.toContain('some_retired_setting');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, tradesAdded: 1 }));
  });

  test('JSONB fields are serialized exactly once across the round trip', async () => {
    const exported = await runExport({
      users: [userRow],
      trades: [tradeRow],
      user_settings: [settingsRow]
    });

    const { client } = await runImport(JSON.parse(JSON.stringify(exported)));

    // trades.quality_metrics (jsonb): bound as a JSON string the pg driver
    // can cast, and parsing it once recovers the original object. A
    // double-stringified value would parse to a string instead.
    const inserted = insertedColumnsMap(findInsert(client, 'trades'));
    expect(typeof inserted.quality_metrics).toBe('string');
    expect(JSON.parse(inserted.quality_metrics)).toEqual({ score: 87, factors: ['risk', 'timing'] });

    // user_settings.analytics_chart_layout (jsonb) through the dynamic
    // settings insert path.
    const insertedSettings = insertedColumnsMap(findInsert(client, 'user_settings'));
    expect(typeof insertedSettings.analytics_chart_layout).toBe('string');
    expect(JSON.parse(insertedSettings.analytics_chart_layout)).toEqual({ order: ['pnl', 'winRate'] });
  });

  test('exportVersion 3.0 routes through the dynamic insert path (schema-driven)', async () => {
    const exported = await runExport({
      users: [userRow],
      trades: [tradeRow]
    });

    const { client } = await runImport(exported);

    // Dynamic path looks up the trades schema before inserting...
    const columnLookups = client.calls.filter(c => c.sql.includes('information_schema.columns'));
    expect(columnLookups.map(c => c.params[0])).toContain('trades');

    // ...and builds the INSERT from the payload, not the hardcoded legacy
    // column list (no enrichment/currency columns appear because the payload
    // does not contain them).
    const tradeInsert = findInsert(client, 'trades');
    expect(tradeInsert.sql).not.toContain('original_currency');
    expect(tradeInsert.sql).not.toContain('enrichment_status');
  });

  test('legacy exportVersion 2.1 routes through the hardcoded insert path', async () => {
    const legacyPayload = {
      exportVersion: '2.1',
      trades: [{
        symbol: 'TSLA',
        side: 'short',
        quantity: 50,
        entryPrice: 250,
        exitPrice: 240,
        entryTime: '2025-04-01T13:30:00.000Z',
        exitTime: '2025-04-01T14:00:00.000Z',
        tradeDate: '2025-04-01',
        pnl: 500,
        pnlPercent: 4
      }]
    };

    const { client, res } = await runImport(legacyPayload);

    // Legacy path never consults information_schema.columns.
    expect(client.calls.some(c => c.sql.includes('information_schema.columns'))).toBe(false);

    // It uses the fixed 69-column INSERT with hardcoded defaults.
    const tradeInsert = findInsert(client, 'trades');
    expect(tradeInsert).toBeDefined();
    expect(tradeInsert.sql).toContain('original_currency');
    expect(tradeInsert.sql).toContain('enrichment_status');
    expect(tradeInsert.params).toHaveLength(69);
    expect(tradeInsert.params[0]).toBe(USER_ID);
    expect(tradeInsert.params[1]).toBe('TSLA');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      tradesAdded: 1
    }));
  });

  test('payloads without exportVersion are rejected before touching the database', async () => {
    installExportDbMock({});
    const json = JSON.stringify({ trades: [{ symbol: 'AAPL' }] });
    const req = {
      user: { id: USER_ID, role: 'user' },
      file: {
        buffer: Buffer.from(json),
        originalname: 'unknown.json',
        size: json.length,
        mimetype: 'application/json'
      }
    };
    const res = createRes();

    await settingsController.importUserData(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid TradeTally export file' });
    expect(db.connect).not.toHaveBeenCalled();
  });
});
