jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn(),
  createSettings: jest.fn(),
  updateSettings: jest.fn(() => Promise.resolve({}))
}));
jest.mock('../../src/services/aiTraderContext', () => ({
  MAX_ABOUT_CHARS: 2000,
  MAX_MEMORY_NOTES: 20,
  MAX_MEMORY_NOTE_CHARS: 300,
  invalidate: jest.fn()
}));

const User = require('../../src/models/User');
const AITraderContext = require('../../src/services/aiTraderContext');
const settingsController = require('../../src/controllers/settings.controller');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('settingsController trading profile (AI fields)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getTradingProfile returns the free text and memory notes', async () => {
    User.getSettings.mockResolvedValueOnce({
      trading_strategies: ['Breakouts'],
      about_trading: 'I trade ORB.',
      ai_memory_notes: ['keep size flat'],
      preferred_sectors: ['Technology']
    });
    const res = createRes();
    await settingsController.getTradingProfile({ user: { id: 'u1' } }, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      tradingProfile: expect.objectContaining({
        tradingStrategies: ['Breakouts'],
        aboutTrading: 'I trade ORB.',
        aiMemoryNotes: ['keep size flat'],
        preferredSectors: ['Technology']
      })
    });
  });

  test('updateTradingProfile normalizes notes, saves, and invalidates the dossier cache', async () => {
    const res = createRes();
    await settingsController.updateTradingProfile({
      user: { id: 'u1' },
      body: {
        riskTolerance: 'aggressive',
        aboutTrading: '  I trade   ORB.  ',
        aiMemoryNotes: ['  keep   size flat ', '', 42, 'no trades after 1pm']
      }
    }, res, jest.fn());

    expect(User.updateSettings).toHaveBeenCalledWith('u1', expect.objectContaining({
      riskTolerance: 'aggressive',
      aboutTrading: 'I trade   ORB.',
      aiMemoryNotes: ['keep size flat', 'no trades after 1pm']
    }));
    expect(AITraderContext.invalidate).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Trading profile updated successfully' }));
  });

  test('updateTradingProfile rejects oversized or malformed AI fields', async () => {
    const cases = [
      { aboutTrading: 'x'.repeat(2001) },
      { aboutTrading: { nope: true } },
      { aiMemoryNotes: 'not a list' },
      { aiMemoryNotes: Array.from({ length: 21 }, (_, i) => `note ${i}`) },
      { aiMemoryNotes: ['y'.repeat(301)] }
    ];
    for (const body of cases) {
      const res = createRes();
      await settingsController.updateTradingProfile({ user: { id: 'u1' }, body }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(User.updateSettings).not.toHaveBeenCalled();
    expect(AITraderContext.invalidate).not.toHaveBeenCalled();
  });
});
