jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const { getUserLocalDate } = require('../../src/utils/timezone');

describe('getUserLocalDate', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("returns today's date in the user's timezone when no timestamp is given", async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T03:30:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    db.query.mockResolvedValue({ rows: [{ timezone: 'America/Chicago' }] });
    // 03:30 UTC on Nov 26 is still Nov 25 in Chicago.
    await expect(getUserLocalDate('user-1')).resolves.toBe('2026-11-25');
  });

  it('converts a given timestamp in the user timezone', async () => {
    db.query.mockResolvedValue({ rows: [{ timezone: 'Asia/Tokyo' }] });
    await expect(getUserLocalDate('user-1', '2026-11-25T16:00:00Z', false)).resolves.toBe('2026-11-26');
  });
});
