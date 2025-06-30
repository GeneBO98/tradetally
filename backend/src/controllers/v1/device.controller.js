const deviceService = require('../../services/device.service');
const refreshTokenService = require('../../services/refreshToken.service');

const deviceController = {
  /**
   * Get all devices for the authenticated user
   */
  async getDevices(req, res, next) {
    try {
      const devices = await deviceService.getUserDevices(req.user.id);
      
      res.json({
        devices,
        totalCount: devices.length,
        maxDevices: process.env.MAX_DEVICES_PER_USER || 10
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Register a new device
   */
  async registerDevice(req, res, next) {
    try {
      const deviceInfo = req.body;
      
      const device = await deviceService.registerDevice(req.user.id, deviceInfo);
      
      res.status(201).json({
        message: 'Device registered successfully',
        device
      });
    } catch (error) {
      if (error.message.includes('Maximum number')) {
        return res.status(429).json({ error: error.message });
      }
      next(error);
    }
  },

  /**
   * Get specific device information
   */
  async getDevice(req, res, next) {
    try {
      const { id } = req.params;
      
      const device = await deviceService.getDevice(id, req.user.id);
      
      res.json({ device });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Update device information
   */
  async updateDevice(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const device = await deviceService.updateDeviceInfo(id, updates);
      
      res.json({
        message: 'Device updated successfully',
        device
      });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Delete a device
   */
  async deleteDevice(req, res, next) {
    try {
      const { id } = req.params;
      
      await deviceService.deleteDevice(id, req.user.id);
      
      res.json({ message: 'Device deleted successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Trust a device
   */
  async trustDevice(req, res, next) {
    try {
      const { id } = req.params;
      
      // Verify device belongs to user first
      await deviceService.getDevice(id, req.user.id);
      await deviceService.trustDevice(id);
      
      res.json({ message: 'Device trusted successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Untrust a device
   */
  async untrustDevice(req, res, next) {
    try {
      const { id } = req.params;
      
      // Verify device belongs to user first
      await deviceService.getDevice(id, req.user.id);
      await deviceService.untrustDevice(id);
      
      res.json({ message: 'Device untrusted successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Get active sessions for a device
   */
  async getDeviceSessions(req, res, next) {
    try {
      const { id } = req.params;
      
      // Verify device belongs to user
      await deviceService.getDevice(id, req.user.id);
      
      const tokens = await refreshTokenService.getUserTokens(req.user.id);
      const deviceTokens = tokens.filter(token => token.device_id === id);
      
      res.json({
        sessions: deviceTokens.map(token => ({
          id: token.id,
          createdAt: token.created_at,
          lastUsed: token.used_at || token.created_at,
          expiresAt: token.expires_at
        }))
      });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Revoke all sessions for a device
   */
  async revokeDeviceSessions(req, res, next) {
    try {
      const { id } = req.params;
      
      // Verify device belongs to user
      await deviceService.getDevice(id, req.user.id);
      
      await refreshTokenService.revokeDeviceTokens(id, 'manual_revocation');
      
      res.json({ message: 'All device sessions revoked successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Get current device information (from headers)
   */
  async getCurrentDeviceInfo(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      const device = await deviceService.getDevice(deviceId, req.user.id);
      
      res.json({ device });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Update current device information
   */
  async updateCurrentDeviceInfo(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      const updates = req.body;
      const device = await deviceService.updateDeviceInfo(deviceId, updates);
      
      res.json({
        message: 'Current device updated successfully',
        device
      });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Update device fingerprint
   */
  async updateDeviceFingerprint(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      const { fingerprint } = req.body;
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      if (!fingerprint) {
        return res.status(400).json({ error: 'Fingerprint is required' });
      }
      
      // Update device fingerprint
      await deviceService.updateDeviceInfo(deviceId, { fingerprint });
      
      res.json({ message: 'Device fingerprint updated successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Update push notification token
   */
  async updatePushToken(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      const { token, platform } = req.body;
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      await deviceService.updatePushToken(deviceId, req.user.id, token, platform);
      
      res.json({ message: 'Push token updated successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Remove push notification token
   */
  async removePushToken(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      await deviceService.removePushToken(deviceId, req.user.id);
      
      res.json({ message: 'Push token removed successfully' });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Get device activity
   */
  async getDeviceActivity(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      const device = await deviceService.getDevice(deviceId, req.user.id);
      
      res.json({
        deviceId: device.id,
        lastActive: device.lastActive,
        activeTokens: device.activeTokens,
        isTrusted: device.isTrusted
      });
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  },

  /**
   * Record device heartbeat
   */
  async recordHeartbeat(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'];
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID header required' });
      }
      
      const result = await deviceService.recordHeartbeat(deviceId, req.user.id);
      
      res.json(result);
    } catch (error) {
      if (error.message === 'Device not found') {
        return res.status(404).json({ error: 'Device not found' });
      }
      next(error);
    }
  }
};

module.exports = deviceController;