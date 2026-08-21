const router = require('../../src/routes/trade.routes');

function middlewareNames(path) {
  const layer = router.stack.find(candidate => candidate.route?.path === path && candidate.route.methods.get);
  return layer?.route.stack.map(handler => handler.handle.name) || [];
}

describe('trade import log route security', () => {
  test.each(['/import/logs', '/import/logs/:filename'])(
    '%s requires authentication and administrator authorization',
    path => {
      expect(middlewareNames(path).slice(0, 2)).toEqual(['authenticate', 'requireAdmin']);
    }
  );
});
