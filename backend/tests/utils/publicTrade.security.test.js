const {
  getPublicTradeSqlColumns,
  sanitizePublicTrade
} = require('../../src/utils/publicTrade');

describe('public trade serialization', () => {
  test('omits tenant, health, execution, and internal grading fields', () => {
    const trade = sanitizePublicTrade({
      id: 'trade-1',
      symbol: 'AAPL',
      notes: 'shared note',
      user_id: 'user-1',
      account_identifier: 'broker-account',
      broker_connection_id: 'connection-1',
      import_id: 'import-1',
      conid: '12345',
      heart_rate: 80,
      sleep_score: 90,
      sleep_hours: 8,
      stress_level: 2,
      executions: [{ price: 100 }],
      quality_metrics: { secret: true },
      classification_metadata: { source: 'internal' },
      username: 'real-user',
      display_name: 'Real Name',
      avatar_url: '/api/users/avatar/private.webp',
      anonymous_username: 'Trader-1234',
      attachments: [{
        id: 'attachment-1',
        file_url: '/api/trades/trade-1/images/chart.webp',
        file_type: 'image/webp',
        file_name: 'tax-account-123.webp',
        file_size: 100
      }]
    });

    expect(trade).toEqual(expect.objectContaining({
      id: 'trade-1',
      symbol: 'AAPL',
      notes: 'shared note',
      username: 'Trader-1234',
      display_name: 'Trader-1234',
      avatar_url: null
    }));
    expect(trade.attachments).toEqual([{
      id: 'attachment-1',
      file_url: '/api/trades/trade-1/images/chart.webp',
      file_type: 'image/webp'
    }]);

    for (const field of [
      'user_id', 'account_identifier', 'broker_connection_id', 'import_id', 'conid',
      'heart_rate', 'sleep_score', 'sleep_hours', 'stress_level', 'executions',
      'quality_metrics', 'classification_metadata'
    ]) {
      expect(trade).not.toHaveProperty(field);
    }
  });

  test('public list SQL uses an explicit safe column list', () => {
    const columns = getPublicTradeSqlColumns('t');
    expect(columns).toContain('t.symbol');
    expect(columns).not.toContain('t.*');
    expect(columns).not.toMatch(/user_id|account_identifier|heart_rate|executions|quality_metrics/);
  });
});
