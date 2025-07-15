const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');
const db = require('../config/database');

const apiKeyController = {
  // Create a new API key
  async createApiKey(req, res, next) {
    try {
      const { name, permissions, expiresIn } = req.body;
      const userId = req.user.id;

      // Calculate expiration date if provided
      let expiresAt = null;
      if (expiresIn) {
        const now = new Date();
        const daysToAdd = parseInt(expiresIn);
        if (isNaN(daysToAdd) || daysToAdd <= 0) {
          return res.status(400).json({ error: 'Invalid expiration period' });
        }
        expiresAt = new Date(now.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
      }

      // Validate permissions
      const validPermissions = ['read', 'write', 'admin'];
      const requestedPermissions = permissions || ['read'];
      
      for (const permission of requestedPermissions) {
        if (!validPermissions.includes(permission)) {
          return res.status(400).json({ 
            error: `Invalid permission: ${permission}. Valid permissions: ${validPermissions.join(', ')}` 
          });
        }
      }

      // Users can only create keys with permissions they have
      if (requestedPermissions.includes('admin') && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Only administrators can create API keys with admin permissions' 
        });
      }

      const apiKey = await ApiKey.create({
        userId,
        name,
        permissions: requestedPermissions,
        expiresAt
      });

      console.log(`API key created: ${apiKey.name} for user ${userId}`);

      res.status(201).json({
        message: 'API key created successfully',
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          key: apiKey.key, // Only shown once
          keyPrefix: apiKey.key_prefix,
          permissions: apiKey.permissions,
          expiresAt: apiKey.expires_at,
          isActive: apiKey.is_active,
          createdAt: apiKey.created_at
        }
      });
    } catch (error) {
      logger.logError('Error creating API key: ' + error.message);
      next(error);
    }
  },

  // Get all API keys for the current user
  async getUserApiKeys(req, res, next) {
    try {
      const userId = req.user.id;
      const apiKeys = await ApiKey.findByUserId(userId);

      res.json({
        apiKeys: apiKeys.map(key => ({
          id: key.id,
          name: key.name,
          keyPrefix: key.key_prefix,
          permissions: key.permissions,
          lastUsedAt: key.last_used_at,
          expiresAt: key.expires_at,
          isActive: key.is_active,
          createdAt: key.created_at,
          updatedAt: key.updated_at
        }))
      });
    } catch (error) {
      logger.logError('Error fetching API keys: ' + error.message);
      next(error);
    }
  },

  // Get a specific API key
  async getApiKey(req, res, next) {
    try {
      const { keyId } = req.params;
      const userId = req.user.id;

      const apiKey = await ApiKey.findById(keyId);
      
      if (!apiKey) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Users can only access their own API keys (unless admin)
      if (apiKey.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.key_prefix,
          permissions: apiKey.permissions,
          lastUsedAt: apiKey.last_used_at,
          expiresAt: apiKey.expires_at,
          isActive: apiKey.is_active,
          createdAt: apiKey.created_at,
          updatedAt: apiKey.updated_at
        }
      });
    } catch (error) {
      logger.logError('Error fetching API key: ' + error.message);
      next(error);
    }
  },

  // Update an API key
  async updateApiKey(req, res, next) {
    try {
      const { keyId } = req.params;
      const { name, permissions, expiresIn, isActive } = req.body;
      const userId = req.user.id;

      const existingKey = await ApiKey.findById(keyId);
      
      if (!existingKey) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Users can only update their own API keys (unless admin)
      if (existingKey.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Calculate new expiration date if provided
      let expiresAt = undefined;
      if (expiresIn !== undefined) {
        if (expiresIn === null) {
          expiresAt = null; // Remove expiration
        } else {
          const now = new Date();
          const daysToAdd = parseInt(expiresIn);
          if (isNaN(daysToAdd) || daysToAdd <= 0) {
            return res.status(400).json({ error: 'Invalid expiration period' });
          }
          expiresAt = new Date(now.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
        }
      }

      // Validate permissions if provided
      if (permissions) {
        const validPermissions = ['read', 'write', 'admin'];
        
        for (const permission of permissions) {
          if (!validPermissions.includes(permission)) {
            return res.status(400).json({ 
              error: `Invalid permission: ${permission}. Valid permissions: ${validPermissions.join(', ')}` 
            });
          }
        }

        // Users can only set permissions they have
        if (permissions.includes('admin') && req.user.role !== 'admin') {
          return res.status(403).json({ 
            error: 'Only administrators can set admin permissions' 
          });
        }
      }

      const updatedKey = await ApiKey.update(keyId, {
        name,
        permissions,
        expiresAt,
        isActive
      });

      console.log(`API key updated: ${updatedKey.name} for user ${userId}`);

      res.json({
        message: 'API key updated successfully',
        apiKey: {
          id: updatedKey.id,
          name: updatedKey.name,
          keyPrefix: updatedKey.key_prefix,
          permissions: updatedKey.permissions,
          lastUsedAt: updatedKey.last_used_at,
          expiresAt: updatedKey.expires_at,
          isActive: updatedKey.is_active,
          createdAt: updatedKey.created_at,
          updatedAt: updatedKey.updated_at
        }
      });
    } catch (error) {
      logger.logError('Error updating API key: ' + error.message);
      next(error);
    }
  },

  // Delete an API key
  async deleteApiKey(req, res, next) {
    try {
      const { keyId } = req.params;
      const userId = req.user.id;

      const existingKey = await ApiKey.findById(keyId);
      
      if (!existingKey) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Users can only delete their own API keys (unless admin)
      if (existingKey.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const deleted = await ApiKey.delete(keyId);
      
      if (!deleted) {
        return res.status(404).json({ error: 'API key not found' });
      }

      console.log(`API key deleted: ${existingKey.name} for user ${userId}`);

      res.json({ message: 'API key deleted successfully' });
    } catch (error) {
      logger.logError('Error deleting API key: ' + error.message);
      next(error);
    }
  },

  // Admin endpoint to get all API keys
  async getAllApiKeys(req, res, next) {
    try {
      // Only admins can access this endpoint
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const query = `
        SELECT ak.*, u.username, u.email
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        ORDER BY ak.created_at DESC
      `;
      
      const result = await db.query(query);
      const apiKeys = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        permissions: JSON.parse(row.permissions),
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email
        }
      }));

      res.json({ apiKeys });
    } catch (error) {
      logger.logError('Error fetching all API keys: ' + error.message);
      next(error);
    }
  }
};

module.exports = apiKeyController;