jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const deviceService = require('../../src/services/device.service');

describe('deviceService.updateDeviceInfo — IDOR protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({
      rows: [{
        id: 'device-abc',
        device_name: 'My Phone',
        device_type: 'ios',
        device_model: 'iPhone 15',
        device_fingerprint: 'fp',
        platform_version: '17.0',
        app_version: '1.0',
        is_trusted: false,
        last_active: new Date(),
        created_at: new Date()
      }]
    });
  });

  test('scopes the UPDATE by both id and user_id', async () => {
    await deviceService.updateDeviceInfo('device-abc', 'user-123', { name: 'New Name' });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(params[0]).toBe('device-abc');
    expect(params[1]).toBe('user-123');
  });

  test('throws when userId is missing so a caller cannot accidentally edit any device', async () => {
    await expect(deviceService.updateDeviceInfo('device-abc', null, { name: 'X' }))
      .rejects.toThrow(/userId is required/);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns "Device not found" when the row is not owned by the caller', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(deviceService.updateDeviceInfo('other-users-device', 'attacker', { name: 'X' }))
      .rejects.toThrow('Device not found');
  });
});
