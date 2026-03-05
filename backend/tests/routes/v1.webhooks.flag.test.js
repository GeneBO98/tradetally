function hasMountedWebhooksRoute(router) {
  return (router.stack || []).some((layer) => {
    const pattern = layer?.regexp ? layer.regexp.toString() : '';
    return pattern.includes('webhooks');
  });
}

describe('v1 webhook route feature flag', () => {
  const originalFlag = process.env.ENABLE_V1_WEBHOOKS;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.ENABLE_V1_WEBHOOKS;
    } else {
      process.env.ENABLE_V1_WEBHOOKS = originalFlag;
    }
    jest.resetModules();
  });

  test('does not mount /webhooks when ENABLE_V1_WEBHOOKS is not true', () => {
    delete process.env.ENABLE_V1_WEBHOOKS;
    jest.resetModules();

    const router = require('../../src/routes/v1');
    expect(hasMountedWebhooksRoute(router)).toBe(false);
  });

  test('mounts /webhooks when ENABLE_V1_WEBHOOKS=true', () => {
    process.env.ENABLE_V1_WEBHOOKS = 'true';
    jest.resetModules();

    const router = require('../../src/routes/v1');
    expect(hasMountedWebhooksRoute(router)).toBe(true);
  });
});
