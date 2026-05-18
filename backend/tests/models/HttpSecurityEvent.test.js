jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const HttpSecurityEvent = require('../../src/models/HttpSecurityEvent');

describe('HttpSecurityEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('records CSP/CORS/static events with structured payloads', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'event-1',
        event_type: 'csp_violation',
        severity: 'warning',
        origin: 'https://app.example',
        path: '/api/csp-report',
        directive: 'script-src',
        blocked_uri: 'inline',
        payload: { violated: true },
        created_at: '2026-05-18T00:00:00Z'
      }]
    });

    const event = await HttpSecurityEvent.record({
      eventType: 'csp_violation',
      origin: 'https://app.example',
      path: '/api/csp-report',
      directive: 'script-src',
      blockedUri: 'inline',
      payload: { violated: true }
    });

    expect(event).toMatchObject({
      id: 'event-1',
      eventType: 'csp_violation',
      blockedUri: 'inline'
    });
    expect(db.query.mock.calls[0][1][11]).toBe(JSON.stringify({ violated: true }));
  });

  test('lists events with bounded limit and filters', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'event-2',
        event_type: 'static_asset_failure',
        severity: 'critical',
        path: '/assets/missing.js',
        status_code: 404,
        payload: {},
        created_at: '2026-05-18T00:00:00Z'
      }]
    });

    const events = await HttpSecurityEvent.list({ eventType: 'static_asset_failure', severity: 'critical', limit: 500 });

    expect(events[0]).toMatchObject({
      eventType: 'static_asset_failure',
      severity: 'critical'
    });
    expect(db.query.mock.calls[0][1]).toEqual(['static_asset_failure', 'critical', 200, 0]);
  });
});
