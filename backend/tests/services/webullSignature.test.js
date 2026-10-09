const { create_signed_headers } = require('../../src/services/brokerSync/webullSignature');

describe('Webull request signing', () => {
  test('matches the published Webull signature example', () => {
    // Public test vector: https://developer.webull.com/apis/docs/authentication/signature/
    const headers = create_signed_headers({
      url: 'https://api.webull.com/trade/place_order',
      app_key: '776da210ab4a452795d74e726ebd74b6',
      app_secret: '0f50a2e853334a9aae1a783bee120c1f',
      params: { a1: 'webull', a2: '123', a3: 'xxx', q1: 'yyy' },
      body: '{"k1":123,"k2":"this is the api request body","k3":true,"k4":{"foo":[1,2]}}',
      timestamp: '2022-01-04T03:55:31Z',
      nonce: '48ef5afed43d4d91ae514aaeafbc29ba'
    });
    expect(headers['x-signature']).toBe('kvlS6opdZDhEBo5jq40nHYXaLvM=');
    expect(headers['x-version']).toBe('v3');
    expect(headers).not.toHaveProperty('x-app-secret');
  });

  test('rejects missing signing credentials before sending a request', () => {
    expect(() => create_signed_headers({ url: 'https://api.webull.com/test' }))
      .toThrow('Webull app signing credentials are not configured');
  });
});
