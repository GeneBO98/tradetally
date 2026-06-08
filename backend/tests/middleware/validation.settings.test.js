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

  test.each(['deepseek', 'kimi'])('accepts %s as an admin AI provider', (provider) => {
    const { error, value } = schemas.adminAiSettings.validate({
      aiProvider: provider,
      aiApiKey: 'test-key',
      aiApiUrl: '',
      aiModel: ''
    });

    expect(error).toBeUndefined();
    expect(value.aiProvider).toBe(provider);
  });
});
