/**
 * Account Controller
 * Handles API requests for account management and cashflow
 * GitHub Issue: #135
 */

const Account = require('../models/Account');

const accountController = {
  /**
   * Get all accounts for the authenticated user
   * GET /api/accounts
   */
  async getAccounts(req, res) {
    try {
      const accounts = await Account.findByUser(req.user.id);

      // Convert to camelCase for frontend
      const formattedAccounts = accounts.map(account => ({
        id: account.id,
        accountName: account.account_name,
        accountIdentifier: account.account_identifier,
        broker: account.broker,
        initialBalance: parseFloat(account.initial_balance),
        initialBalanceDate: account.initial_balance_date,
        isPrimary: account.is_primary,
        notes: account.notes,
        tradeCount: parseInt(account.trade_count) || 0,
        createdAt: account.created_at,
        updatedAt: account.updated_at
      }));

      res.json({
        success: true,
        data: formattedAccounts
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fetching accounts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch accounts'
      });
    }
  },

  /**
   * Get a single account by ID
   * GET /api/accounts/:id
   */
  async getAccount(req, res) {
    try {
      const account = await Account.findById(req.params.id, req.user.id);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      res.json({
        success: true,
        data: {
          id: account.id,
          accountName: account.account_name,
          accountIdentifier: account.account_identifier,
          broker: account.broker,
          initialBalance: parseFloat(account.initial_balance),
          initialBalanceDate: account.initial_balance_date,
          isPrimary: account.is_primary,
          notes: account.notes,
          createdAt: account.created_at,
          updatedAt: account.updated_at
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fetching account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch account'
      });
    }
  },

  /**
   * Get the primary account
   * GET /api/accounts/primary
   */
  async getPrimaryAccount(req, res) {
    try {
      const account = await Account.getPrimary(req.user.id);

      if (!account) {
        return res.json({
          success: true,
          data: null
        });
      }

      res.json({
        success: true,
        data: {
          id: account.id,
          accountName: account.account_name,
          accountIdentifier: account.account_identifier,
          broker: account.broker,
          initialBalance: parseFloat(account.initial_balance),
          initialBalanceDate: account.initial_balance_date,
          isPrimary: account.is_primary,
          notes: account.notes
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fetching primary account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch primary account'
      });
    }
  },

  /**
   * Get unlinked account identifiers from trades
   * GET /api/accounts/unlinked-identifiers
   */
  async getUnlinkedIdentifiers(req, res) {
    try {
      const identifiers = await Account.getUnlinkedAccountIdentifiers(req.user.id);

      res.json({
        success: true,
        data: identifiers.map(row => ({
          accountIdentifier: row.account_identifier,
          broker: row.broker
        }))
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fetching unlinked identifiers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unlinked identifiers'
      });
    }
  },

  /**
   * Create a new account
   * POST /api/accounts
   */
  async createAccount(req, res) {
    try {
      const {
        accountName,
        accountIdentifier,
        broker,
        initialBalance,
        initialBalanceDate,
        isPrimary,
        notes
      } = req.body;

      // Validation
      if (!accountName || accountName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Account name is required'
        });
      }

      if (!initialBalanceDate) {
        return res.status(400).json({
          success: false,
          message: 'Initial balance date is required'
        });
      }

      const account = await Account.create(req.user.id, {
        accountName: accountName.trim(),
        accountIdentifier: accountIdentifier || null,
        broker: broker || null,
        initialBalance: parseFloat(initialBalance) || 0,
        initialBalanceDate,
        isPrimary: isPrimary || false,
        notes: notes || null
      });

      res.status(201).json({
        success: true,
        data: {
          id: account.id,
          accountName: account.account_name,
          accountIdentifier: account.account_identifier,
          broker: account.broker,
          initialBalance: parseFloat(account.initial_balance),
          initialBalanceDate: account.initial_balance_date,
          isPrimary: account.is_primary,
          notes: account.notes,
          createdAt: account.created_at
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error creating account:', error);

      // Handle unique constraint violation for primary account
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'A primary account already exists'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create account'
      });
    }
  },

  /**
   * Update an account
   * PUT /api/accounts/:id
   */
  async updateAccount(req, res) {
    try {
      const account = await Account.update(req.params.id, req.user.id, req.body);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      res.json({
        success: true,
        data: {
          id: account.id,
          accountName: account.account_name,
          accountIdentifier: account.account_identifier,
          broker: account.broker,
          initialBalance: parseFloat(account.initial_balance),
          initialBalanceDate: account.initial_balance_date,
          isPrimary: account.is_primary,
          notes: account.notes,
          updatedAt: account.updated_at
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error updating account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update account'
      });
    }
  },

  /**
   * Delete an account
   * DELETE /api/accounts/:id
   */
  async deleteAccount(req, res) {
    try {
      const result = await Account.delete(req.params.id, req.user.id);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error deleting account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account'
      });
    }
  },

  /**
   * Get transactions for an account
   * GET /api/accounts/:accountId/transactions
   */
  async getTransactions(req, res) {
    try {
      const { startDate, endDate, limit } = req.query;

      const transactions = await Account.getTransactions(
        req.user.id,
        req.params.accountId,
        {
          startDate,
          endDate,
          limit: parseInt(limit) || 100
        }
      );

      // Convert to camelCase
      const formattedTransactions = transactions.map(tx => ({
        id: tx.id,
        accountId: tx.account_id,
        accountName: tx.account_name,
        transactionType: tx.transaction_type,
        amount: parseFloat(tx.amount),
        transactionDate: tx.transaction_date,
        description: tx.description,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at
      }));

      res.json({
        success: true,
        data: formattedTransactions
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fetching transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions'
      });
    }
  },

  /**
   * Add a transaction (deposit/withdrawal)
   * POST /api/accounts/:accountId/transactions
   */
  async addTransaction(req, res) {
    try {
      const { transactionType, amount, transactionDate, description } = req.body;

      // Validation
      if (!transactionType || !['deposit', 'withdrawal'].includes(transactionType)) {
        return res.status(400).json({
          success: false,
          message: 'Transaction type must be "deposit" or "withdrawal"'
        });
      }

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number'
        });
      }

      if (!transactionDate) {
        return res.status(400).json({
          success: false,
          message: 'Transaction date is required'
        });
      }

      const transaction = await Account.addTransaction(
        req.user.id,
        req.params.accountId,
        {
          transactionType,
          amount: parseFloat(amount),
          transactionDate,
          description: description || null
        }
      );

      res.status(201).json({
        success: true,
        data: {
          id: transaction.id,
          accountId: transaction.account_id,
          transactionType: transaction.transaction_type,
          amount: parseFloat(transaction.amount),
          transactionDate: transaction.transaction_date,
          description: transaction.description,
          createdAt: transaction.created_at
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error adding transaction:', error);

      if (error.message === 'Account not found') {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to add transaction'
      });
    }
  },

  /**
   * Update a transaction
   * PUT /api/accounts/transactions/:transactionId
   */
  async updateTransaction(req, res) {
    try {
      const transaction = await Account.updateTransaction(
        req.params.transactionId,
        req.user.id,
        req.body
      );

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        data: {
          id: transaction.id,
          accountId: transaction.account_id,
          transactionType: transaction.transaction_type,
          amount: parseFloat(transaction.amount),
          transactionDate: transaction.transaction_date,
          description: transaction.description,
          updatedAt: transaction.updated_at
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error updating transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update transaction'
      });
    }
  },

  /**
   * Delete a transaction
   * DELETE /api/accounts/transactions/:transactionId
   */
  async deleteTransaction(req, res) {
    try {
      const result = await Account.deleteTransaction(
        req.params.transactionId,
        req.user.id
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        message: 'Transaction deleted successfully'
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error deleting transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete transaction'
      });
    }
  },

  /**
   * Get cashflow for an account
   * GET /api/accounts/:accountId/cashflow
   */
  async getCashflow(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const cashflow = await Account.getCashflow(
        req.user.id,
        req.params.accountId,
        { startDate, endDate }
      );

      if (!cashflow) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      res.json({
        success: true,
        data: cashflow
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fetching cashflow:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cashflow'
      });
    }
  }
};

module.exports = accountController;
