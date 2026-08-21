const router = require('../../src/routes/oauth2.routes');

describe('OAuth2 route security', () => {
  test('runs CSRF validation before authentication on consent approval', () => {
    const layer = router.stack.find(candidate =>
      candidate.route?.path === '/authorize' && candidate.route.methods.post
    );

    expect(layer).toBeDefined();
    expect(layer.route.stack.map(handler => handler.handle.name).slice(0, 2))
      .toEqual(['requireCsrf', 'authenticate']);
  });
});
