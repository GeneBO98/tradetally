/**
 * Broker Sync Controller
 * Handles API endpoints for managing broker connections and syncing trades
 */

const BrokerConnection = require('../models/BrokerConnection');
const ibkrService = require('../services/brokerSync/ibkrService');
const schwabService = require('../services/brokerSync/schwabService');
const brokerSyncService = require('../services/brokerSync');
const AnalyticsCache = require('../services/analyticsCache');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// Helper function to invalidate in-memory analytics cache for a user
function invalidateInMemoryCache(userId) {
  const cacheKeys = Object.keys(cache.data || {}).filter(key =>
    key.startsWith(`analytics:user_${userId}:`)
  );
  cacheKeys.forEach(key => cache.del(key));
  console.log(`[BROKER-SYNC] Invalidated ${cacheKeys.length} in-memory analytics cache entries for user ${userId}`);
}

const brokerSyncController = {
  /**
   * Get all broker connections for the current user
   */
  async getConnections(req, res, next) {
    try {
      const userId = req.user.id;
      const connections = await BrokerConnection.findByUserId(userId);

      res.json({
        success: true,
        data: connections
      });
    } catch (error) {
      logger.logError('Error fetching broker connections:', error);
      next(error);
    }
  },

  /**
   * Get a specific broker connection by ID
   */
  async getConnection(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const connection = await BrokerConnection.findById(id, false);

      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      res.json({
        success: true,
        data: connection
      });
    } catch (error) {
      logger.logError('Error fetching broker connection:', error);
      next(error);
    }
  },

  /**
   * Add IBKR connection
   */
  async addIBKRConnection(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        flexToken,
        flexQueryId,
        autoSyncEnabled = false,
        syncFrequency = 'daily',
        syncTime = '06:00:00'
      } = req.body;

      // Validate required fields
      if (!flexToken || !flexQueryId) {
        return res.status(400).json({
          success: false,
          error: 'Flex Token and Query ID are required'
        });
      }

      // Validate credentials with IBKR
      console.log('[BROKER-SYNC] Validating IBKR credentials...');
      const validation = await ibkrService.validateCredentials(flexToken, flexQueryId);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.message
        });
      }

      // Create or update connection
      const connection = await BrokerConnection.create(userId, {
        brokerType: 'ibkr',
        ibkrFlexToken: flexToken,
        ibkrFlexQueryId: flexQueryId,
        autoSyncEnabled,
        syncFrequency,
        syncTime
      });

      // Update status to active after validation
      await BrokerConnection.updateStatus(connection.id, 'active', 'Connection validated successfully');

      // Calculate next sync time if auto-sync enabled
      if (autoSyncEnabled && syncFrequency !== 'manual') {
        const nextSync = BrokerConnection.calculateNextSync(syncFrequency, syncTime);
        if (nextSync) {
          await BrokerConnection.update(connection.id, { nextScheduledSync: nextSync });
        }
      }

      // Fetch updated connection
      const updatedConnection = await BrokerConnection.findById(connection.id, false);

      console.log(`[BROKER-SYNC] IBKR connection created for user ${userId}`);

      res.status(201).json({
        success: true,
        data: updatedConnection,
        message: 'IBKR connection added successfully'
      });
    } catch (error) {
      logger.logError('Error adding IBKR connection:', error);
      next(error);
    }
  },

  /**
   * Initialize Schwab OAuth flow
   */
  async initSchwabOAuth(req, res, next) {
    try {
      const userId = req.user.id;

      // Check if Schwab OAuth is configured
      if (!process.env.SCHWAB_CLIENT_ID || !process.env.SCHWAB_CLIENT_SECRET) {
        return res.status(503).json({
          success: false,
          error: 'Schwab integration is not configured on this server'
        });
      }

      // Generate state token for CSRF protection
      const crypto = require('crypto');
      const state = crypto.randomBytes(32).toString('hex');

      // Store state in session or temporary storage
      // For now, we'll encode user ID in the state
      const encodedState = Buffer.from(JSON.stringify({ userId, nonce: state })).toString('base64');

      // Build authorization URL
      const authUrl = new URL('https://api.schwabapi.com/v1/oauth/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', process.env.SCHWAB_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', process.env.SCHWAB_REDIRECT_URI);
      authUrl.searchParams.set('scope', 'api');
      authUrl.searchParams.set('state', encodedState);

      console.log(`[BROKER-SYNC] Initiating Schwab OAuth for user ${userId}`);

      res.json({
        success: true,
        authUrl: authUrl.toString()
      });
    } catch (error) {
      logger.logError('Error initiating Schwab OAuth:', error);
      next(error);
    }
  },

  /**
   * Handle Schwab OAuth callback
   */
  async handleSchwabCallback(req, res, next) {
    try {
      const { code, state, error: oauthError } = req.query;

      // Handle OAuth errors
      if (oauthError) {
        console.error('[BROKER-SYNC] Schwab OAuth error:', oauthError);
        return res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?error=${oauthError}`);
      }

      if (!code || !state) {
        return res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?error=missing_params`);
      }

      // Decode state to get user ID
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      } catch {
        return res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?error=invalid_state`);
      }

      const { userId } = stateData;

      // Exchange code for tokens
      console.log('[SCHWAB-OAUTH] Exchanging authorization code for tokens...');
      console.log('[SCHWAB-OAUTH] Redirect URI:', process.env.SCHWAB_REDIRECT_URI);

      const axios = require('axios');
      const tokenResponse = await axios.post(
        'https://api.schwabapi.com/v1/oauth/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.SCHWAB_REDIRECT_URI
        }),
        {
          auth: {
            username: process.env.SCHWAB_CLIENT_ID,
            password: process.env.SCHWAB_CLIENT_SECRET
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('[SCHWAB-OAUTH] Token exchange successful');
      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Calculate token expiration
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      console.log('[SCHWAB-OAUTH] Token expires at:', expiresAt);

      // Get account info
      console.log('[SCHWAB-OAUTH] Fetching account info...');
      const accountsResponse = await axios.get(
        'https://api.schwabapi.com/trader/v1/accounts',
        {
          headers: {
            Authorization: `Bearer ${access_token}`
          }
        }
      );

      console.log('[SCHWAB-OAUTH] Accounts response:', JSON.stringify(accountsResponse.data, null, 2));
      const accountNumber = accountsResponse.data?.[0]?.securitiesAccount?.accountNumber;
      console.log('[SCHWAB-OAUTH] Account Number:', accountNumber);

      // Create or update connection
      console.log('[SCHWAB-OAUTH] Creating broker connection for user:', userId);
      const connection = await BrokerConnection.create(userId, {
        brokerType: 'schwab',
        schwabAccessToken: access_token,
        schwabRefreshToken: refresh_token,
        schwabTokenExpiresAt: expiresAt,
        schwabAccountId: accountNumber,
        autoSyncEnabled: false,
        syncFrequency: 'daily'
      });
      console.log('[SCHWAB-OAUTH] Connection created:', connection.id);

      await BrokerConnection.updateStatus(connection.id, 'active', 'OAuth connection successful');
      console.log('[SCHWAB-OAUTH] Connection status updated to active');

      console.log(`[BROKER-SYNC] Schwab connection created for user ${userId}`);

      // Redirect back to frontend
      res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?success=schwab`);
    } catch (error) {
      console.error('[SCHWAB-OAUTH] ERROR MESSAGE:', error.message);
      console.error('[SCHWAB-OAUTH] ERROR STATUS:', error.response?.status);
      console.error('[SCHWAB-OAUTH] ERROR RESPONSE:', JSON.stringify(error.response?.data, null, 2));
      console.error('[SCHWAB-OAUTH] ERROR STACK:', error.stack);
      logger.logError('Error handling Schwab OAuth callback:', error);

      // Provide more specific error message in redirect
      const errorCode = error.response?.status || 'unknown';
      const errorMsg = encodeURIComponent(error.message || 'oauth_failed');
      res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?error=oauth_failed&details=${errorMsg}&status=${errorCode}`);
    }
  },

  /**
   * Update broker connection settings
   */
  async updateConnection(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { autoSyncEnabled, syncFrequency, syncTime } = req.body;

      // Verify ownership
      const connection = await BrokerConnection.findById(id, false);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      // Update settings
      const updated = await BrokerConnection.update(id, {
        autoSyncEnabled,
        syncFrequency,
        syncTime
      });

      // Recalculate next sync time
      if (autoSyncEnabled && syncFrequency !== 'manual') {
        const nextSync = BrokerConnection.calculateNextSync(
          syncFrequency || connection.syncFrequency,
          syncTime || connection.syncTime
        );
        if (nextSync) {
          await BrokerConnection.update(id, { nextScheduledSync: nextSync });
        }
      }

      const finalConnection = await BrokerConnection.findById(id, false);

      res.json({
        success: true,
        data: finalConnection
      });
    } catch (error) {
      logger.logError('Error updating broker connection:', error);
      next(error);
    }
  },

  /**
   * Delete broker connection
   */
  async deleteConnection(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      // Verify ownership
      const connection = await BrokerConnection.findById(id, false);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      await BrokerConnection.delete(id);

      console.log(`[BROKER-SYNC] Connection ${id} deleted for user ${userId}`);

      res.json({
        success: true,
        message: 'Broker connection deleted successfully'
      });
    } catch (error) {
      logger.logError('Error deleting broker connection:', error);
      next(error);
    }
  },

  /**
   * Trigger manual sync
   */
  async triggerSync(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { startDate, endDate } = req.body;

      // Verify ownership and get connection with credentials
      const connection = await BrokerConnection.findById(id, true);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      // Check connection status
      if (connection.connectionStatus !== 'active') {
        return res.status(400).json({
          success: false,
          error: `Cannot sync: connection status is ${connection.connectionStatus}`
        });
      }

      console.log(`[BROKER-SYNC] Starting manual sync for connection ${id}`);

      // Use the broker sync service orchestrator which handles both IBKR and Schwab
      // Start sync in background
      process.nextTick(async () => {
        try {
          const result = await brokerSyncService.syncConnection(id, {
            syncType: 'manual',
            startDate,
            endDate
          });

          console.log(`[BROKER-SYNC] Sync completed for connection ${id}: ${result.imported || 0} imported`);
        } catch (error) {
          console.error(`[BROKER-SYNC] Sync failed for connection ${id}:`, error.message);
          // Error handling is done in the service layer
        }
      });

      res.status(202).json({
        success: true,
        message: 'Sync started'
      });
    } catch (error) {
      logger.logError('Error triggering sync:', error);
      next(error);
    }
  },

  /**
   * Get sync logs for a connection
   */
  async getSyncLogs(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { limit = 20 } = req.query;

      // Verify ownership
      const connection = await BrokerConnection.findById(id, false);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      const logs = await BrokerConnection.getSyncLogs(id, parseInt(limit));

      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.logError('Error fetching sync logs:', error);
      next(error);
    }
  },

  /**
   * Get all sync logs for user
   */
  async getAllSyncLogs(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 50 } = req.query;

      const logs = await BrokerConnection.getSyncLogsByUser(userId, parseInt(limit));

      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.logError('Error fetching all sync logs:', error);
      next(error);
    }
  },

  /**
   * Test broker connection
   */
  async testConnection(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      // Get connection with credentials
      const connection = await BrokerConnection.findById(id, true);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      let testResult;

      if (connection.brokerType === 'ibkr') {
        testResult = await ibkrService.validateCredentials(
          connection.ibkrFlexToken,
          connection.ibkrFlexQueryId
        );
      } else if (connection.brokerType === 'schwab') {
        // Test Schwab connection by checking token validity
        const { accessToken, needsReauth } = await schwabService.ensureValidToken(connection);
        if (needsReauth) {
          testResult = { valid: false, message: 'Schwab authentication expired. Please re-connect your account.' };
        } else {
          // Try to fetch accounts to verify token works
          try {
            await schwabService.getAccounts(accessToken);
            testResult = { valid: true, message: 'Schwab connection is valid' };
          } catch (error) {
            testResult = { valid: false, message: `Schwab connection test failed: ${error.message}` };
          }
        }
      }

      if (testResult.valid) {
        await BrokerConnection.updateStatus(id, 'active', 'Connection test successful');
      } else {
        await BrokerConnection.updateStatus(id, 'error', testResult.message);
      }

      res.json({
        success: testResult.valid,
        message: testResult.message
      });
    } catch (error) {
      logger.logError('Error testing connection:', error);
      next(error);
    }
  },

  /**
   * Get sync status for a specific sync
   */
  async getSyncStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const { syncId } = req.params;

      // Get the sync log
      const logs = await BrokerConnection.getSyncLogsByUser(userId, 100);
      const log = logs.find(l => l.id === syncId);

      if (!log) {
        return res.status(404).json({
          success: false,
          error: 'Sync log not found'
        });
      }

      res.json({
        success: true,
        data: log
      });
    } catch (error) {
      logger.logError('Error fetching sync status:', error);
      next(error);
    }
  },

  /**
   * Delete all trades from a specific broker connection (only synced trades, not manual imports)
   */
  async deleteBrokerTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      // Verify ownership
      const connection = await BrokerConnection.findById(id, false);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Broker connection not found'
        });
      }

      // Delete only trades that were synced from this specific broker connection
      // This preserves manually imported trades (where broker_connection_id is NULL)
      const db = require('../config/database');
      const result = await db.query(
        `DELETE FROM trades WHERE user_id = $1 AND broker_connection_id = $2 RETURNING id`,
        [userId, id]
      );

      const deletedCount = result.rowCount;
      console.log(`[BROKER-SYNC] Deleted ${deletedCount} synced trades for connection ${id} (user ${userId})`);

      // Invalidate both database and in-memory analytics cache after deleting trades
      if (deletedCount > 0) {
        console.log(`[BROKER-SYNC] Invalidating analytics cache for user ${userId}`);
        await AnalyticsCache.invalidateUserCache(userId);
        invalidateInMemoryCache(userId);
      }

      res.json({
        success: true,
        message: `Deleted ${deletedCount} synced trades from ${connection.brokerType}`,
        deletedCount
      });
    } catch (error) {
      logger.logError('Error deleting broker trades:', error);
      next(error);
    }
  }
};

module.exports = brokerSyncController;
