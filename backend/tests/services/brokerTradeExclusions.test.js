jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const BrokerTradeExclusions = require('../../src/services/brokerTradeExclusions');

describe('IBKR deleted-trade exclusions', () => {
  const exclusion = {
    account_identifier: 'U123',
    symbol: 'AAPL',
    side: 'long',
    entry_time: '2026-09-01T14:00:00Z',
    entry_price: 100,
    quantity: 10,
    executions: [{ execution_id: 'fill-1', datetime: '2026-09-01T14:00:00Z', price: 100, quantity: 10 }]
  };

  it('keeps a deleted trade excluded when IBKR adds later fills', () => {
    expect(BrokerTradeExclusions.matches(exclusion, {
      accountIdentifier: 'U123', symbol: 'AAPL', side: 'long',
      executionData: [
        { executionId: 'fill-1' },
        { executionId: 'fill-2' }
      ]
    })).toBe(true);
  });

  it('does not exclude a different account or independent trade', () => {
    const incoming = {
      accountIdentifier: 'U123', symbol: 'AAPL', side: 'long',
      entryTime: '2026-09-01T15:00:00Z', entryPrice: 101, quantity: 10,
      executionData: [{ executionId: 'fill-2' }]
    };
    expect(BrokerTradeExclusions.matches(exclusion, incoming)).toBe(false);
    expect(BrokerTradeExclusions.matches(exclusion, {
      ...incoming, accountIdentifier: 'U456', executionData: [{ executionId: 'fill-1' }]
    })).toBe(false);
  });

  it('recognizes a legacy row whose account identifier was missing', () => {
    expect(BrokerTradeExclusions.matches({ ...exclusion, account_identifier: null }, {
      accountIdentifier: 'U123', symbol: 'AAPL', side: 'long',
      executionData: [{ executionId: 'fill-1' }]
    })).toBe(true);
    expect(BrokerTradeExclusions.matches({ ...exclusion, account_identifier: null }, {
      accountIdentifier: 'U123', symbol: 'AAPL', side: 'long',
      executionData: [{ datetime: exclusion.entry_time, price: 100, quantity: 10 }]
    })).toBe(false);
  });

  it('matches legacy trades without execution IDs by entry identity', () => {
    expect(BrokerTradeExclusions.matches({ ...exclusion, executions: [] }, {
      account_identifier: 'U123', symbol: 'AAPL', side: 'long',
      entry_time: exclusion.entry_time, entry_price: 100, quantity: 10
    })).toBe(true);
  });
});
