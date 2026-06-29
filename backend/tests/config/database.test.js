const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();
let mockPoolConfig;

jest.mock('pg', () => ({
  Pool: jest.fn((config) => {
    mockPoolConfig = config;
    return {
      query: mockPoolQuery,
      connect: mockPoolConnect,
      on: jest.fn()
    };
  }),
  types: { setTypeParser: jest.fn() }
}));

const mockEnsurePostExitSchema = jest.fn();

jest.mock('../../src/utils/ensurePostExitSchema', () => ({
  ensurePostExitSchema: mockEnsurePostExitSchema
}));

describe('database query wrapper', () => {
  let database;

  beforeEach(() => {
    jest.resetModules();
    mockPoolQuery.mockReset();
    mockPoolConnect.mockReset();
    mockEnsurePostExitSchema.mockReset();
    mockPoolConfig = undefined;
    delete process.env.DB_SCHEMA;

    mockEnsurePostExitSchema.mockResolvedValue({
      repairedTradeColumns: [],
      repairedUserSettingsColumns: []
    });

    database = require('../../src/config/database');
  });

  test('passes through successful queries without attempting repair', async () => {
    const expected = { rows: [{ id: 't1' }] };
    mockPoolQuery.mockResolvedValue(expected);

    const result = await database.query('SELECT 1', ['x']);

    expect(result).toBe(expected);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1', ['x']);
    expect(mockEnsurePostExitSchema).not.toHaveBeenCalled();
  });

  test('repairs missing post-exit trade columns and retries the query', async () => {
    const missingColumnError = Object.assign(new Error('column "post_exit_mae" does not exist'), {
      code: '42703'
    });
    const expected = { rows: [{ id: 't-created' }] };

    mockPoolQuery
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce(expected);

    const result = await database.query('INSERT INTO trades ...', ['u1']);

    expect(result).toBe(expected);
    expect(mockEnsurePostExitSchema).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test('repairs missing post-exit user settings columns and retries the query', async () => {
    const missingColumnError = Object.assign(new Error('column "post_exit_excursion_window_mode" does not exist'), {
      code: '42703'
    });
    const expected = { rows: [{ user_id: 'u1' }] };

    mockPoolQuery
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce(expected);

    const result = await database.query('UPDATE user_settings SET post_exit_excursion_window_mode = $1', ['manual']);

    expect(result).toBe(expected);
    expect(mockEnsurePostExitSchema).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test('rethrows unrelated database errors without repair', async () => {
    const unrelatedError = Object.assign(new Error('relation "wat" does not exist'), {
      code: '42P01'
    });
    mockPoolQuery.mockRejectedValue(unrelatedError);

    await expect(database.query('SELECT * FROM wat', [])).rejects.toThrow('relation "wat" does not exist');
    expect(mockEnsurePostExitSchema).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  // Issue #349: DATE columns must reach the app as plain 'YYYY-MM-DD' strings.
  // pg's default parser returns Date objects at midnight in the SERVER's local
  // timezone, which shifts displayed dates by a day for users west of the
  // server. Removing this parser silently reintroduces the bug everywhere a
  // DATE column (trade_date, expiration_date, ...) is read.
  test('registers a DATE (oid 1082) type parser that returns the raw string', () => {
    const { types } = require('pg');
    const dateParserCall = types.setTypeParser.mock.calls.find(([oid]) => oid === 1082);

    expect(dateParserCall).toBeDefined();
    const parser = dateParserCall[1];
    expect(parser('2026-06-12')).toBe('2026-06-12');
  });

  test('sets PostgreSQL search_path when DB_SCHEMA is configured', () => {
    jest.resetModules();
    process.env.DB_SCHEMA = 'tradetally';

    require('../../src/config/database');

    expect(mockPoolConfig.options).toBe('-c search_path="tradetally",public');
  });
});
