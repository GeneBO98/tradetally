jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  encrypt: jest.fn(value => value),
  decrypt: jest.fn(value => value)
}));

const BrokerConnection = require('../../src/models/BrokerConnection');

describe('BrokerConnection daily scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('interprets the entered time in the user timezone instead of the server timezone', () => {
    jest.setSystemTime(new Date('2026-07-31T15:00:00.000Z'));

    const next = BrokerConnection.calculateNextSync('daily', '11:30:00', 'America/Chicago');

    expect(next.toISOString()).toBe('2026-07-31T16:30:00.000Z');
  });

  test('moves an elapsed local time to the following local calendar day', () => {
    jest.setSystemTime(new Date('2026-07-31T15:00:00.000Z'));

    const next = BrokerConnection.calculateNextSync('daily', '09:00:00', 'America/Chicago');

    expect(next.toISOString()).toBe('2026-08-01T14:00:00.000Z');
  });

  test('uses the new UTC offset after a daylight-saving transition', () => {
    // 07:00 EST on March 7. The next 06:00 occurs March 8 after the switch
    // to EDT, so it is 10:00 UTC rather than 11:00 UTC.
    jest.setSystemTime(new Date('2026-03-07T12:00:00.000Z'));

    const next = BrokerConnection.calculateNextSync('daily', '06:00:00', 'America/New_York');

    expect(next.toISOString()).toBe('2026-03-08T10:00:00.000Z');
  });

});
