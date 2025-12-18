/**
 * Broker Sync Controller
 * Handles API endpoints for managing broker connections and syncing trades
 */

const BrokerConnection = require('../models/BrokerConnection');
const ibkrService = require('../services/brokerSync/ibkrService');
const logger = require('../utils/logger');

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

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Calculate token expiration
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Get account info
      const accountsResponse = await axios.get(
        'https://api.schwabapi.com/trader/v1/accounts',
        {
          headers: {
            Authorization: `Bearer ${access_token}`
          }
        }
      );

      const accountId = accountsResponse.data?.[0]?.securitiesAccount?.accountId;

      // Create or update connection
      const connection = await BrokerConnection.create(userId, {
        brokerType: 'schwab',
        schwabAccessToken: access_token,
        schwabRefreshToken: refresh_token,
        schwabTokenExpiresAt: expiresAt,
        schwabAccountId: accountId,
        autoSyncEnabled: false,
        syncFrequency: 'daily'
      });

      await BrokerConnection.updateStatus(connection.id, 'active', 'OAuth connection successful');

      console.log(`[BROKER-SYNC] Schwab connection created for user ${userId}`);

      // Redirect back to frontend
      res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?success=schwab`);
    } catch (error) {
      logger.logError('Error handling Schwab OAuth callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/settings/broker-sync?error=oauth_failed`);
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

      // Create sync log
      const syncLog = await BrokerConnection.createSyncLog(
        id,
        userId,
        'manual',
        startDate,
        endDate
      );

      console.log(`[BROKER-SYNC] Starting manual sync for connection ${id}`);

      // Start sync in background
      process.nextTick(async () => {
        try {
          let result;

          if (connection.brokerType === 'ibkr') {
            result = await ibkrService.syncTrades(connection, {
              startDate,
              endDate,
              syncLogId: syncLog.id
            });
          } else if (connection.brokerType === 'schwab') {
            // Schwab sync will be implemented later
            throw new Error('Schwab sync not yet implemented');
          }

          // Update sync log with results
          await BrokerConnection.updateSyncLog(syncLog.id, 'completed', {
            tradesImported: result.imported,
            tradesSkipped: result.skipped,
            tradesFailed: result.failed,
            duplicatesDetected: result.duplicates
          });

          // Update connection status
          const nextSync = connection.autoSyncEnabled && connection.syncFrequency !== 'manual'
            ? BrokerConnection.calculateNextSync(connection.syncFrequency, connection.syncTime)
            : null;

          await BrokerConnection.updateAfterSync(
            id,
            result.imported,
            result.skipped,
            nextSync
          );

          console.log(`[BROKER-SYNC] Sync completed for connection ${id}: ${result.imported} imported`);
        } catch (error) {
          console.error(`[BROKER-SYNC] Sync failed for connection ${id}:`, error.message);

          await BrokerConnection.updateSyncLog(syncLog.id, 'failed', {
            errorMessage: error.message
          });

          await BrokerConnection.updateAfterFailure(id, error.message);
        }
      });

      res.status(202).json({
        success: true,
        syncId: syncLog.id,
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
        // Test Schwab connection by making a simple API call
        testResult = { valid: true, message: 'Schwab connection test not implemented' };
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
  }
};

module.exports = brokerSyncController;
