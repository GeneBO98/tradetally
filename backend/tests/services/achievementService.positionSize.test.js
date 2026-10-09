jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/notificationService', () => ({}));

const AchievementService = require('../../src/services/achievementService');

describe('AchievementService High Roller position size', () => {
  const trade = (o) => ({ entry_price: 10, quantity: 10, side: 'long', instrument_type: 'stock', contract_size: null, ...o });

  it('uses price x quantity for stocks', () => {
    expect(AchievementService.capitalDeployed(trade({ entry_price: 50, quantity: 200 }))).toBe(10000);
  });

  it('counts option premium with the contract multiplier', () => {
    expect(AchievementService.capitalDeployed(trade({ instrument_type: 'option', entry_price: 2.5, quantity: 20, contract_size: 100 }))).toBe(5000);
  });

  it('defaults the option multiplier to 100', () => {
    expect(AchievementService.capitalDeployed(trade({ instrument_type: 'option', entry_price: 2.5, quantity: 20 }))).toBe(5000);
  });

  it('ignores premium received on short options', () => {
    expect(AchievementService.capitalDeployed(trade({ instrument_type: 'option', side: 'short', entry_price: 50, quantity: 10 }))).toBe(0);
  });

  it('excludes futures', () => {
    expect(AchievementService.capitalDeployed(trade({ instrument_type: 'future', entry_price: 27471, quantity: 1 }))).toBe(0);
  });

  it('awards High Roller from option premium paid', () => {
    const snapshot = { trades: [trade({ instrument_type: 'option', entry_price: 3, quantity: 20, contract_size: 100 })] };
    expect(AchievementService.evaluatePositionSize(snapshot, 5000)).toEqual({ earned: true, metadata: { min_size: 5000 } });
  });
});
