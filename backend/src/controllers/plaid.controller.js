const plaidFundingService = require('../services/plaid/plaidFundingService');

const plaidController = {
  async createLinkToken(req, res) {
    try {
      const targetType = req.body?.targetType === 'investment' ? 'investment' : 'bank';
      const data = await plaidFundingService.createLinkToken(req.user, targetType);
      res.json({ success: true, data });
    } catch (error) {
      const status = /not configured/i.test(error.message) ? 503 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to create Plaid Link token'
      });
    }
  },

  async exchangePublicToken(req, res) {
    try {
      const { publicToken, institution, targetType, autoSyncEnabled, syncFrequency, syncTime } = req.body || {};
      if (!publicToken) {
        return res.status(400).json({
          success: false,
          message: 'publicToken is required'
        });
      }

      const connection = await plaidFundingService.exchangePublicToken(req.user.id, {
        publicToken,
        institution,
        targetType,
        autoSyncEnabled,
        syncFrequency,
        syncTime
      });

      return res.status(201).json({
        success: true,
        data: connection
      });
    } catch (error) {
      const status = /not configured/i.test(error.message) ? 503 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to exchange Plaid public token'
      });
    }
  },

  async getConnections(req, res) {
    try {
      const connections = await plaidFundingService.listConnections(req.user.id);
      res.json({ success: true, data: connections });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Plaid connections'
      });
    }
  },

  async updateConnection(req, res) {
    try {
      const updated = await plaidFundingService.updateConnection(
        req.user.id,
        req.params.connectionId,
        req.body || {}
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to update Plaid connection'
      });
    }
  },

  async deleteConnection(req, res) {
    try {
      await plaidFundingService.deleteConnection(req.user.id, req.params.connectionId);
      res.json({
        success: true,
        message: 'Plaid connection deleted successfully'
      });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to delete Plaid connection'
      });
    }
  },

  async syncConnection(req, res) {
    try {
      const result = await plaidFundingService.syncConnection(req.params.connectionId, {
        userId: req.user.id
      });
      res.json({ success: true, data: result });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to sync Plaid connection'
      });
    }
  },

  async linkPlaidAccount(req, res) {
    try {
      const trackingMode = ['tracked_account', 'funding_source'].includes(req.body?.trackingMode)
        ? req.body.trackingMode
        : 'tracked_account';

      const linked = await plaidFundingService.linkPlaidAccount(
        req.user.id,
        req.params.plaidAccountId,
        {
          linkedAccountId: req.body?.linkedAccountId || null,
          trackingMode,
          newAccount: req.body?.newAccount || null
        }
      );

      res.json({ success: true, data: linked });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to link Plaid account'
      });
    }
  },

  async unlinkPlaidAccount(req, res) {
    try {
      const plaidAccount = await plaidFundingService.unlinkPlaidAccount(
        req.user.id,
        req.params.plaidAccountId
      );
      res.json({ success: true, data: plaidAccount });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to unlink Plaid account'
      });
    }
  },

  async getReviewQueue(req, res) {
    try {
      const data = await plaidFundingService.getReviewData(req.user.id, req.params.accountId);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Plaid review queue'
      });
    }
  },

  async approveTransaction(req, res) {
    try {
      const transaction = await plaidFundingService.approveTransaction(
        req.user.id,
        req.params.accountId,
        req.params.transactionId,
        {
          transactionType: req.body?.transactionType,
          description: req.body?.description
        }
      );

      res.json({ success: true, data: transaction });
    } catch (error) {
      const status = /not found/i.test(error.message)
        ? 404
        : /required|cannot be approved|already approved/i.test(error.message)
          ? 400
          : error.code === '23505'
            ? 409
            : 500;

      res.status(status).json({
        success: false,
        message: error.message || 'Failed to approve Plaid transaction'
      });
    }
  },

  async rejectTransaction(req, res) {
    try {
      await plaidFundingService.rejectTransaction(
        req.user.id,
        req.params.accountId,
        req.params.transactionId
      );

      res.json({
        success: true,
        message: 'Plaid transaction rejected'
      });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to reject Plaid transaction'
      });
    }
  },

  async bulkApproveTransactions(req, res) {
    try {
      const { transactionIds, transactionType } = req.body || {};
      if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'transactionIds array is required'
        });
      }

      const result = await plaidFundingService.bulkApproveTransactions(
        req.user.id,
        req.params.accountId,
        transactionIds,
        transactionType
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to bulk approve Plaid transactions'
      });
    }
  },

  async revertTransaction(req, res) {
    try {
      const result = await plaidFundingService.revertTransaction(
        req.user.id,
        req.params.accountId,
        req.params.transactionId
      );
      res.json({ success: true, data: result });
    } catch (error) {
      const status = /not found/i.test(error.message)
        ? 404
        : /can be reverted|cannot/i.test(error.message)
          ? 400
          : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to revert Plaid transaction'
      });
    }
  },

  async bulkRevertTransactions(req, res) {
    try {
      const { transactionIds } = req.body || {};
      if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'transactionIds array is required'
        });
      }
      const result = await plaidFundingService.bulkRevertTransactions(
        req.user.id,
        req.params.accountId,
        transactionIds
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to bulk revert Plaid transactions'
      });
    }
  },

  async bulkRejectTransactions(req, res) {
    try {
      const { transactionIds } = req.body || {};
      if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'transactionIds array is required'
        });
      }

      const result = await plaidFundingService.bulkRejectTransactions(
        req.user.id,
        req.params.accountId,
        transactionIds
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to bulk reject Plaid transactions'
      });
    }
  }
};

module.exports = plaidController;
