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
  },

  /**
   * Fix trades with redacted account identifiers
   * POST /api/accounts/:accountId/fix-trades
   *
   * This endpoint fixes trades that were imported with redacted account identifiers
   * (e.g., "****5678") by updating them to use the account's full identifier.
   * It matches trades where the last 4 characters of the redacted identifier
   * match the last 4 characters of the account's identifier.
   */
  async fixRedactedTrades(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;

      // Get the account
      const account = await Account.findById(accountId, userId);
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      if (!account.account_identifier) {
        return res.status(400).json({
          success: false,
          message: 'Account does not have an identifier set'
        });
      }

      const fullIdentifier = account.account_identifier;
      const last4 = fullIdentifier.slice(-4);

      // Update trades with redacted identifiers that match this account's last 4 digits
      const db = require('../config/database');
      const result = await db.query(`
        UPDATE trades
        SET account_identifier = $1
        WHERE user_id = $2
          AND account_identifier LIKE '****%'
          AND RIGHT(account_identifier, 4) = $3
        RETURNING id
      `, [fullIdentifier, userId, last4]);

      const updatedCount = result.rowCount;

      console.log(`[ACCOUNTS] Fixed ${updatedCount} trades with redacted identifiers for account ${accountId}`);

      res.json({
        success: true,
        message: `Updated ${updatedCount} trades to use account identifier`,
        data: {
          updatedCount,
          accountIdentifier: fullIdentifier
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error fixing redacted trades:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fix trades'
      });
    }
  },

  /**
   * Link trades to an account by updating their account identifier
   * POST /api/accounts/:accountId/link-trades
   *
   * Body options:
   * - sourceIdentifier: Update trades with this specific identifier to use the account's identifier
   * - linkAll: If true, update ALL user's trades that don't have an identifier to use this account
   *
   * This is useful when:
   * 1. Trades have a different identifier than the account (e.g., from CSV import)
   * 2. Trades have no identifier and need to be linked to an account
   */
  async linkTradesToAccount(req, res) {
    try {
      const { accountId } = req.params;
      const { sourceIdentifier, linkAll } = req.body;
      const userId = req.user.id;

      // Get the account
      const account = await Account.findById(accountId, userId);
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const targetIdentifier = account.account_identifier;
      const db = require('../config/database');
      let result;

      if (sourceIdentifier) {
        // Update trades with a specific source identifier
        result = await db.query(`
          UPDATE trades
          SET account_identifier = $1
          WHERE user_id = $2
            AND account_identifier = $3
          RETURNING id
        `, [targetIdentifier, userId, sourceIdentifier]);

        console.log(`[ACCOUNTS] Linked ${result.rowCount} trades from "${sourceIdentifier}" to account ${accountId}`);
      } else if (linkAll) {
        // Update all trades without an identifier
        result = await db.query(`
          UPDATE trades
          SET account_identifier = $1
          WHERE user_id = $2
            AND (account_identifier IS NULL OR account_identifier = '')
          RETURNING id
        `, [targetIdentifier, userId]);

        console.log(`[ACCOUNTS] Linked ${result.rowCount} unlinked trades to account ${accountId}`);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Must provide sourceIdentifier or set linkAll to true'
        });
      }

      res.json({
        success: true,
        message: `Linked ${result.rowCount} trades to account`,
        data: {
          updatedCount: result.rowCount,
          targetIdentifier
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error linking trades:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to link trades'
      });
    }
  },

  /**
   * Get trade identifiers summary for debugging
   * GET /api/accounts/debug/trade-identifiers
   */
  async getTradeIdentifiersSummary(req, res) {
    try {
      const userId = req.user.id;
      const db = require('../config/database');

      // Get summary of account identifiers on trades
      const result = await db.query(`
        SELECT
          COALESCE(account_identifier, 'NULL') as identifier,
          COUNT(*) as trade_count,
          MIN(trade_date)::date as earliest_trade,
          MAX(trade_date)::date as latest_trade
        FROM trades
        WHERE user_id = $1
        GROUP BY account_identifier
        ORDER BY trade_count DESC
      `, [userId]);

      // Get account identifiers
      const accounts = await db.query(`
        SELECT id, account_name, account_identifier, initial_balance_date
        FROM user_accounts
        WHERE user_id = $1
      `, [userId]);

      res.json({
        success: true,
        data: {
          tradeIdentifiers: result.rows,
          accounts: accounts.rows
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error getting trade identifiers summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get trade identifiers summary'
      });
    }
  },

  /**
   * Debug cashflow calculation for an account
   * GET /api/accounts/:accountId/debug-cashflow
   */
  async debugCashflow(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;
      const db = require('../config/database');

      // Get account
      const account = await Account.findById(accountId, userId);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }

      // Get trades that match this account
      const tradesResult = await db.query(`
        SELECT
          id,
          symbol,
          trade_date,
          entry_time,
          exit_time,
          entry_price,
          exit_price,
          quantity,
          side,
          account_identifier,
          instrument_type,
          contract_size,
          commission
        FROM trades
        WHERE user_id = $1
          AND account_identifier = $2
        ORDER BY trade_date DESC
        LIMIT 20
      `, [userId, account.account_identifier]);

      // Get date range info
      const dateRangeResult = await db.query(`
        SELECT
          COUNT(*) as total_trades,
          MIN(trade_date)::date as earliest_trade_date,
          MAX(trade_date)::date as latest_trade_date,
          MIN(DATE(entry_time))::date as earliest_entry_time,
          MAX(DATE(entry_time))::date as latest_entry_time,
          COUNT(entry_time) as trades_with_entry_time,
          COUNT(exit_time) as trades_with_exit_time
        FROM trades
        WHERE user_id = $1
          AND account_identifier = $2
      `, [userId, account.account_identifier]);

      // Check instrument types distribution
      const instrumentTypesResult = await db.query(`
        SELECT
          COALESCE(instrument_type, 'NULL') as instrument_type,
          COUNT(*) as count,
          SUM(entry_price::numeric * quantity::numeric * COALESCE(contract_size, 1)) as total_entry_value
        FROM trades
        WHERE user_id = $1
          AND account_identifier = $2
        GROUP BY instrument_type
      `, [userId, account.account_identifier]);

      // Count trades within the cashflow date range
      const effectiveStartDate = account.initial_balance_date;
      const effectiveEndDate = new Date().toISOString().split('T')[0];

      const inRangeResult = await db.query(`
        SELECT
          COUNT(*) as trades_in_range,
          COUNT(CASE WHEN DATE(COALESCE(entry_time, trade_date)) >= $3 THEN 1 END) as entries_in_range,
          COUNT(CASE WHEN exit_time IS NOT NULL AND DATE(exit_time) >= $3 THEN 1 END) as exits_in_range
        FROM trades
        WHERE user_id = $1
          AND account_identifier = $2
      `, [userId, account.account_identifier, effectiveStartDate]);

      res.json({
        success: true,
        data: {
          account: {
            id: account.id,
            name: account.account_name,
            identifier: account.account_identifier,
            initialBalanceDate: account.initial_balance_date
          },
          dateRange: {
            effectiveStartDate,
            effectiveEndDate
          },
          tradeStats: dateRangeResult.rows[0],
          instrumentTypes: instrumentTypesResult.rows,
          tradesInRange: inRangeResult.rows[0],
          sampleTrades: tradesResult.rows
        }
      });
    } catch (error) {
      console.error('[ACCOUNTS] Error debugging cashflow:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to debug cashflow'
      });
    }
  }
};

module.exports = accountController;
