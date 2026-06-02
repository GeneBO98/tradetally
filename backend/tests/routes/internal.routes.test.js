function hasMountedKestraRoute(router) {
  return (router.stack || []).some((layer) => {
    const routePath = layer?.route?.path;
    return typeof routePath === 'string' && routePath.includes('/kestra/crm-sync');
  });
}

describe('internal Kestra route wiring', () => {
  test('mounts Kestra CRM sync endpoints', () => {
    const router = require('../../src/routes/internal.routes');
    expect(hasMountedKestraRoute(router)).toBe(true);
  });
});
