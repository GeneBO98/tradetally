const { schemas } = require('../../src/middleware/validation');

describe('settings validation', () => {
  test('does not inject stop-loss defaults into partial settings updates', () => {
    const payload = {
      uiPreferences: {
        dashboardRMode: true
      }
    };

    const { error, value } = schemas.updateSettings.validate(payload);

    expect(error).toBeUndefined();
    expect(value).toEqual(payload);
    expect(value.defaultStopLossType).toBeUndefined();
  });

  test('accepts explicit stop-loss type updates', () => {
    const { error, value } = schemas.updateSettings.validate({
      defaultStopLossType: 'dollar',
      defaultStopLossDollars: 100
    });

    expect(error).toBeUndefined();
    expect(value.defaultStopLossType).toBe('dollar');
  });
});
