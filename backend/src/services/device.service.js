const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class DeviceService {
  /**
   * Register a new device for a user
   */
  async registerDevice(userId, deviceInfo) {
    const {
      name,
      type,
      model = '',
      fingerprint = '',
      platformVersion = '',
      appVersion = ''
    } = deviceInfo;

    // Generate device fingerprint if not provided
    const deviceFingerprint = fingerprint || this.generateDeviceFingerprint(deviceInfo);

    // Check device limit per user
    const maxDevices = process.env.MAX_DEVICES_PER_USER || 10;
    const deviceCount = await this.getUserDeviceCount(userId);
    
    if (deviceCount >= maxDevices) {
      throw new Error(`Maximum number of devices (${maxDevices}) reached`);
    }

    const result = await db.query(`
      INSERT INTO devices (
        user_id, device_name, device_type, device_model, 
        device_fingerprint, platform_version, app_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, device_name, device_type, device_model, 
                device_fingerprint, platform_version, app_version, 
                is_trusted, created_at
    `, [userId, name, type, model, deviceFingerprint, platformVersion, appVersion]);

    const device = result.rows[0];

    // Auto-trust first device or if device limit allows
    if (deviceCount === 0 || deviceCount < 3) {
      await this.trustDevice(device.id);
      device.is_trusted = true;
    }

    return {
      id: device.id,
      name: device.device_name,
      type: device.device_type,
      model: device.device_model,
      fingerprint: device.device_fingerprint,
      platformVersion: device.platform_version,
      appVersion: device.app_version,
      isTrusted: device.is_trusted,
      createdAt: device.created_at
    };
  }

  /**
   * Find device by fingerprint
   */
  async findDeviceByFingerprint(userId, fingerprint) {
    if (!fingerprint) return null;

    const result = await db.query(`
      SELECT id, device_name, device_type, device_model, 
             device_fingerprint, platform_version, app_version, 
             is_trusted, last_active, created_at
      FROM devices
      WHERE user_id = $1 AND device_fingerprint = $2
    `, [userId, fingerprint]);

    if (result.rows.length === 0) return null;

    const device = result.rows[0];
    return {
      id: device.id,
      name: device.device_name,
      type: device.device_type,
      model: device.device_model,
      fingerprint: device.device_fingerprint,
      platformVersion: device.platform_version,
      appVersion: device.app_version,
      isTrusted: device.is_trusted,
      lastActive: device.last_active,
      createdAt: device.created_at
    };
  }

  /**
   * Update device information
   */
  async updateDeviceInfo(deviceId, updates) {
    const {
      name,
      model,
      platformVersion,
      appVersion
    } = updates;

    const result = await db.query(`
      UPDATE devices 
      SET device_name = COALESCE($2, device_name),
          device_model = COALESCE($3, device_model),
          platform_version = COALESCE($4, platform_version),
          app_version = COALESCE($5, app_version),
          last_active = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, device_name, device_type, device_model, 
                device_fingerprint, platform_version, app_version, 
                is_trusted, last_active, created_at
    `, [deviceId, name, model, platformVersion, appVersion]);

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    const device = result.rows[0];
    return {
      id: device.id,
      name: device.device_name,
      type: device.device_type,
      model: device.device_model,
      fingerprint: device.device_fingerprint,
      platformVersion: device.platform_version,
      appVersion: device.app_version,
      isTrusted: device.is_trusted,
      lastActive: device.last_active,
      createdAt: device.created_at
    };
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId) {
    const result = await db.query(`
      SELECT d.id, d.device_name, d.device_type, d.device_model, 
             d.device_fingerprint, d.platform_version, d.app_version, 
             d.is_trusted, d.last_active, d.created_at,
             COUNT(rt.id) as active_tokens
      FROM devices d
      LEFT JOIN refresh_tokens rt ON d.id = rt.device_id AND rt.revoked_at IS NULL
      WHERE d.user_id = $1
      GROUP BY d.id
      ORDER BY d.last_active DESC, d.created_at DESC
    `, [userId]);

    return result.rows.map(device => ({
      id: device.id,
      name: device.device_name,
      type: device.device_type,
      model: device.device_model,
      fingerprint: device.device_fingerprint,
      platformVersion: device.platform_version,
      appVersion: device.app_version,
      isTrusted: device.is_trusted,
      lastActive: device.last_active,
      createdAt: device.created_at,
      activeTokens: parseInt(device.active_tokens)
    }));
  }

  /**
   * Get device by ID
   */
  async getDevice(deviceId, userId) {
    const result = await db.query(`
      SELECT d.id, d.device_name, d.device_type, d.device_model, 
             d.device_fingerprint, d.platform_version, d.app_version, 
             d.is_trusted, d.last_active, d.created_at, d.push_token, d.push_platform,
             COUNT(rt.id) as active_tokens
      FROM devices d
      LEFT JOIN refresh_tokens rt ON d.id = rt.device_id AND rt.revoked_at IS NULL
      WHERE d.id = $1 AND d.user_id = $2
      GROUP BY d.id
    `, [deviceId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    const device = result.rows[0];
    return {
      id: device.id,
      name: device.device_name,
      type: device.device_type,
      model: device.device_model,
      fingerprint: device.device_fingerprint,
      platformVersion: device.platform_version,
      appVersion: device.app_version,
      isTrusted: device.is_trusted,
      lastActive: device.last_active,
      createdAt: device.created_at,
      pushToken: device.push_token,
      pushPlatform: device.push_platform,
      activeTokens: parseInt(device.active_tokens)
    };
  }

  /**
   * Trust a device
   */
  async trustDevice(deviceId) {
    await db.query(`
      UPDATE devices 
      SET is_trusted = true 
      WHERE id = $1
    `, [deviceId]);
  }

  /**
   * Untrust a device
   */
  async untrustDevice(deviceId) {
    await db.query(`
      UPDATE devices 
      SET is_trusted = false 
      WHERE id = $1
    `, [deviceId]);
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId, userId) {
    // First revoke all tokens for this device
    await db.query(`
      UPDATE refresh_tokens 
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'device_deleted'
      WHERE device_id = $1
    `, [deviceId]);

    // Then delete the device
    const result = await db.query(`
      DELETE FROM devices 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [deviceId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    return { deleted: true };
  }

  /**
   * Update push token for a device
   */
  async updatePushToken(deviceId, userId, pushToken, pushPlatform) {
    const result = await db.query(`
      UPDATE devices 
      SET push_token = $3, push_platform = $4, last_active = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [deviceId, userId, pushToken, pushPlatform]);

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    return { updated: true };
  }

  /**
   * Remove push token for a device
   */
  async removePushToken(deviceId, userId) {
    const result = await db.query(`
      UPDATE devices 
      SET push_token = NULL, push_platform = NULL, last_active = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [deviceId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    return { removed: true };
  }

  /**
   * Record device heartbeat (update last active)
   */
  async recordHeartbeat(deviceId, userId) {
    const result = await db.query(`
      UPDATE devices 
      SET last_active = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [deviceId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Device not found');
    }

    return { heartbeat: new Date().toISOString() };
  }

  /**
   * Get user device count
   */
  async getUserDeviceCount(userId) {
    const result = await db.query(`
      SELECT COUNT(*) as count 
      FROM devices 
      WHERE user_id = $1
    `, [userId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Generate device fingerprint
   */
  generateDeviceFingerprint(deviceInfo) {
    const {
      type,
      model = '',
      platformVersion = '',
      name = ''
    } = deviceInfo;

    const fingerprintData = `${type}:${model}:${platformVersion}:${name}:${Date.now()}`;
    return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 32);
  }

  /**
   * Clean up inactive devices (for maintenance)
   */
  async cleanupInactiveDevices(daysInactive = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const result = await db.query(`
      DELETE FROM devices 
      WHERE last_active < $1 OR (last_active IS NULL AND created_at < $1)
      RETURNING id
    `, [cutoffDate]);

    return result.rows.length;
  }

  /**
   * Get device statistics
   */
  async getDeviceStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE device_type = 'ios') as ios_devices,
        COUNT(*) FILTER (WHERE device_type = 'android') as android_devices,
        COUNT(*) FILTER (WHERE device_type = 'web') as web_devices,
        COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_devices,
        COUNT(*) FILTER (WHERE is_trusted = true) as trusted_devices,
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '30 days') as active_devices
      FROM devices
    `);

    return result.rows[0];
  }
}

module.exports = new DeviceService();