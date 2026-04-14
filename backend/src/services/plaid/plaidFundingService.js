const db = require('../../config/database');
const Account = require('../../models/Account');
const PlaidConnection = require('../../models/PlaidConnection');
const plaidClient = require('./plaidClient');
const plaidClassificationService = require('./plaidClassificationService');

function formatDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date(value).toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

function normalizePlaidAccount(account) {
  return {
    id: account.id,
    plaidAccountId: account.plaidAccountId,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    trackingMode: account.trackingMode,
    linkedAccountId: account.linkedAccountId
  };
}

class PlaidFundingService {
  ensureConfigured() {
    if (!plaidClient.isConfigured()) {
      throw new Error('Plaid integration is not configured on this server');
    }
  }

  async createLinkToken(user, targetType = 'bank') {
    this.ensureConfigured();
    const response = await plaidClient.createLinkToken({
      userId: user.id,
      email: user.email,
      targetType
    });

    return {
      linkToken: response.link_token,
      expiration: response.expiration
    };
  }

  async exchangePublicToken(userId, payload) {
    this.ensureConfigured();

    const {
      publicToken,
      institution = {},
      targetType = 'bank',
      autoSyncEnabled = false,
      syncFrequency = 'daily',
      syncTime = '06:00:00'
    } = payload;

    const exchange = await plaidClient.exchangePublicToken(publicToken);
    const connection = await PlaidConnection.create(userId, {
      itemId: exchange.item_id,
      accessToken: exchange.access_token,
      institutionId: institution.id || null,
      institutionName: institution.name || null,
      targetType,
      autoSyncEnabled,
      syncFrequency,
      syncTime
    });

    await this.syncConnection(connection.id, { userId });
    return PlaidConnection.findById(connection.id, userId, false);
  }

  async listConnections(userId) {
    return PlaidConnection.findByUserId(userId);
  }

  async updateConnection(userId, connectionId, updates) {
    const connection = await PlaidConnection.findById(connectionId, userId, false);
    if (!connection) {
      throw new Error('Plaid connection not found');
    }

    const nextScheduledSync = updates.autoSyncEnabled && updates.syncFrequency !== 'manual'
      ? PlaidConnection.calculateNextSync(
          updates.syncFrequency || connection.syncFrequency,
          updates.syncTime || connection.syncTime
        )
      : null;

    return PlaidConnection.update(connectionId, {
      autoSyncEnabled: updates.autoSyncEnabled,
      syncFrequency: updates.syncFrequency,
      syncTime: updates.syncTime,
      nextScheduledSync
    });
  }

  async deleteConnection(userId, connectionId) {
    const deleted = await PlaidConnection.delete(connectionId, userId);
    if (!deleted) {
      throw new Error('Plaid connection not found');
    }
    return deleted;
  }

  async linkPlaidAccount(userId, plaidAccountId, payload) {
    const {
      linkedAccountId,
      trackingMode,
      newAccount
    } = payload;

    let targetAccountId = linkedAccountId || null;
    if (!targetAccountId && newAccount?.accountName) {
      const createdAccount = await Account.create(userId, {
        accountName: newAccount.accountName,
        accountIdentifier: newAccount.accountIdentifier || null,
        broker: newAccount.broker || 'other',
        initialBalance: parseFloat(newAccount.initialBalance) || 0,
        initialBalanceDate: newAccount.initialBalanceDate || formatDate(new Date()),
        isPrimary: Boolean(newAccount.isPrimary),
        notes: newAccount.notes || 'Created from Plaid funding connection'
      });
      targetAccountId = createdAccount.id;
    }

    if (!targetAccountId) {
      throw new Error('A TradeTally account must be selected or created');
    }

    const plaidAccount = await PlaidConnection.setAccountLink(
      plaidAccountId,
      userId,
      targetAccountId,
      trackingMode
    );

    if (!plaidAccount) {
      throw new Error('Plaid account not found');
    }

    await this.reclassifyTransactionsForPlaidAccount(userId, plaidAccount);
    return plaidAccount;
  }

  async unlinkPlaidAccount(userId, plaidAccountId) {
    const plaidAccount = await PlaidConnection.setAccountLink(
      plaidAccountId,
      userId,
      null,
      null
    );

    if (!plaidAccount) {
      throw new Error('Plaid account not found');
    }

    return plaidAccount;
  }

  async syncConnection(connectionId, { userId = null } = {}) {
    this.ensureConfigured();

    const connection = await PlaidConnection.findById(connectionId, userId, true);
    if (!connection) {
      throw new Error('Plaid connection not found');
    }

    try {
      const accountsResponse = await plaidClient.getAccounts(connection.accessToken);
      const syncedAccounts = await PlaidConnection.upsertAccounts(
        connection.id,
        connection.userId,
        accountsResponse.accounts || []
      );

      const plaidAccountMap = new Map(
        syncedAccounts.map(account => [account.plaidAccountId, normalizePlaidAccount(account)])
      );

      let processedCount = 0;
      let nextCursor = connection.lastSyncCursor;

      if (connection.targetType === 'bank') {
        const bankResult = await this.syncBankTransactions(connection, plaidAccountMap);
        processedCount = bankResult.processedCount;
        nextCursor = bankResult.nextCursor;
      } else {
        const investmentResult = await this.syncInvestmentTransactions(connection, plaidAccountMap);
        processedCount = investmentResult.processedCount;
      }

      await PlaidConnection.updateAfterSync(connection.id, {
        lastSyncCursor: nextCursor,
        message: `Processed ${processedCount} Plaid transaction update${processedCount === 1 ? '' : 's'}`
      });

      return {
        processedCount
      };
    } catch (error) {
      await PlaidConnection.updateAfterFailure(connection.id, error.message);
      throw error;
    }
  }

  async syncBankTransactions(connection, plaidAccountMap) {
    let cursor = connection.lastSyncCursor || null;
    let hasMore = true;
    let processedCount = 0;

    while (hasMore) {
      const response = await plaidClient.syncTransactions(connection.accessToken, cursor);
      const changedTransactions = [
        ...(response.added || []),
        ...(response.modified || [])
      ];

      for (const transaction of changedTransactions) {
        const plaidAccount = plaidAccountMap.get(transaction.account_id);
        if (!plaidAccount) continue;

        const unified = this.buildBankTransaction(connection, plaidAccount, transaction);
        await PlaidConnection.upsertTransaction(connection.userId, unified);
        processedCount += 1;
      }

      await PlaidConnection.markTransactionsRemoved(
        connection.userId,
        (response.removed || []).map(item => item.transaction_id)
      );

      cursor = response.next_cursor || cursor;
      hasMore = Boolean(response.has_more);
    }

    return {
      processedCount,
      nextCursor: cursor
    };
  }

  async syncInvestmentTransactions(connection, plaidAccountMap) {
    const startDate = daysAgo(730);
    const endDate = formatDate(new Date());
    let offset = 0;
    let processedCount = 0;
    const count = 100;

    while (true) {
      const response = await plaidClient.getInvestmentTransactions(
        connection.accessToken,
        startDate,
        endDate,
        offset,
        count
      );

      const transactions = response.investment_transactions || [];
      for (const transaction of transactions) {
        const plaidAccount = plaidAccountMap.get(transaction.account_id);
        if (!plaidAccount) continue;

        const unified = this.buildInvestmentTransaction(connection, plaidAccount, transaction);
        await PlaidConnection.upsertTransaction(connection.userId, unified);
        processedCount += 1;
      }

      offset += transactions.length;
      if (transactions.length < count) {
        break;
      }
    }

    return {
      processedCount
    };
  }

  buildBankTransaction(connection, plaidAccount, transaction) {
    const metadata = {
      categoryPrimary: transaction.personal_finance_category?.primary || null,
      categoryDetailed: transaction.personal_finance_category?.detailed || null,
      transactionCode: transaction.payment_channel || null,
      transactionSource: 'bank'
    };

    const classification = plaidClassificationService.classify({
      amount: transaction.amount,
      description: transaction.name,
      merchantName: transaction.merchant_name,
      metadata
    }, plaidAccount);

    return {
      connectionId: connection.id,
      plaidAccountRowId: plaidAccount.id,
      externalTransactionId: transaction.transaction_id,
      pendingTransactionId: transaction.pending_transaction_id || null,
      transactionSource: 'bank',
      amount: transaction.amount,
      isoCurrencyCode: transaction.iso_currency_code || transaction.unofficial_currency_code || null,
      transactionDate: formatDate(transaction.date),
      authorizedDate: formatDate(transaction.authorized_date),
      description: transaction.name || transaction.original_description || 'Plaid transaction',
      merchantName: transaction.merchant_name || null,
      pending: Boolean(transaction.pending),
      reviewStatus: 'pending',
      reviewReason: classification.reviewReason,
      directionGuess: classification.directionGuess,
      confidence: classification.confidence,
      metadata,
      rawPayload: transaction
    };
  }

  buildInvestmentTransaction(connection, plaidAccount, transaction) {
    const description = [transaction.name, transaction.subtype].filter(Boolean).join(' - ') || 'Investment transaction';
    const metadata = {
      investmentType: transaction.type || null,
      investmentSubtype: transaction.subtype || null,
      transactionSource: 'investment'
    };

    const classification = plaidClassificationService.classify({
      amount: transaction.amount,
      description,
      merchantName: transaction.name,
      metadata
    }, plaidAccount);

    return {
      connectionId: connection.id,
      plaidAccountRowId: plaidAccount.id,
      externalTransactionId: transaction.investment_transaction_id,
      pendingTransactionId: null,
      transactionSource: 'investment',
      amount: transaction.amount,
      isoCurrencyCode: transaction.iso_currency_code || transaction.unofficial_currency_code || null,
      transactionDate: formatDate(transaction.date),
      authorizedDate: null,
      description,
      merchantName: transaction.name || null,
      pending: false,
      reviewStatus: 'pending',
      reviewReason: classification.reviewReason,
      directionGuess: classification.directionGuess,
      confidence: classification.confidence,
      metadata,
      rawPayload: transaction
    };
  }

  async reclassifyTransactionsForPlaidAccount(userId, plaidAccount) {
    const rawTransactions = await PlaidConnection.listTransactionsByPlaidAccount(plaidAccount.id, userId);

    for (const transaction of rawTransactions) {
      if (transaction.review_status === 'approved') continue;

      const metadata = transaction.metadata || {};
      const classification = plaidClassificationService.classify({
        amount: parseFloat(transaction.amount),
        description: transaction.description,
        merchantName: transaction.merchant_name,
        metadata
      }, plaidAccount);

      await db.query(`
        UPDATE plaid_transactions
        SET direction_guess = $2,
            confidence = $3,
            review_reason = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [transaction.id, classification.directionGuess, classification.confidence, classification.reviewReason]);
    }
  }

  async getReviewData(userId, accountId) {
    const [pending, history, synced] = await Promise.all([
      PlaidConnection.listReviewQueue(userId, accountId, 50),
      PlaidConnection.listReviewedActivity(userId, accountId, 20),
      PlaidConnection.listSyncedActivity(userId, accountId, 100)
    ]);

    const summary = {
      total: synced.length,
      pending: synced.filter(item => item.reviewStatus === 'pending').length,
      approved: synced.filter(item => item.reviewStatus === 'approved').length,
      rejected: synced.filter(item => item.reviewStatus === 'rejected').length
    };

    return { pending, history, synced, summary };
  }

  async approveTransaction(userId, accountId, plaidTransactionId, payload = {}) {
    const record = await PlaidConnection.findTransactionById(plaidTransactionId, userId);
    if (!record || record.linked_account_id !== accountId) {
      throw new Error('Plaid transaction not found');
    }

    if (record.review_status === 'approved') {
      throw new Error('Plaid transaction already approved');
    }

    if (record.pending) {
      throw new Error('Pending Plaid transactions cannot be approved yet');
    }

    const transactionType = payload.transactionType || record.direction_guess;
    if (!['deposit', 'withdrawal'].includes(transactionType)) {
      throw new Error('A transaction type is required for approval');
    }

    const accountTransaction = await Account.addTransaction(userId, accountId, {
      transactionType,
      amount: Math.abs(parseFloat(record.amount)),
      transactionDate: formatDate(record.transaction_date),
      description: payload.description || record.description,
      sourceType: 'plaid',
      sourceReferenceId: record.external_transaction_id,
      approvedAt: new Date().toISOString()
    });

    await PlaidConnection.markTransactionApproved(
      plaidTransactionId,
      accountTransaction.id,
      transactionType
    );

    return accountTransaction;
  }

  async rejectTransaction(userId, accountId, plaidTransactionId) {
    const record = await PlaidConnection.findTransactionById(plaidTransactionId, userId);
    if (!record || record.linked_account_id !== accountId) {
      throw new Error('Plaid transaction not found');
    }

    return PlaidConnection.markTransactionRejected(plaidTransactionId, userId);
  }

  async bulkApproveTransactions(userId, accountId, transactionIds, transactionType) {
    const results = { approved: 0, skipped: 0, errors: [] };
    for (const id of transactionIds) {
      try {
        await this.approveTransaction(userId, accountId, id, { transactionType });
        results.approved += 1;
      } catch (err) {
        if (/already approved/i.test(err.message) || /cannot be approved/i.test(err.message)) {
          results.skipped += 1;
        } else {
          results.errors.push({ transactionId: id, message: err.message });
        }
      }
    }
    return results;
  }

  async bulkRejectTransactions(userId, accountId, transactionIds) {
    const results = { rejected: 0, errors: [] };
    for (const id of transactionIds) {
      try {
        await this.rejectTransaction(userId, accountId, id);
        results.rejected += 1;
      } catch (err) {
        results.errors.push({ transactionId: id, message: err.message });
      }
    }
    return results;
  }

  async revertTransaction(userId, accountId, plaidTransactionId) {
    const record = await PlaidConnection.findTransactionById(plaidTransactionId, userId);
    if (!record || record.linked_account_id !== accountId) {
      throw new Error('Plaid transaction not found');
    }

    if (record.review_status !== 'approved' && record.review_status !== 'rejected') {
      throw new Error('Only approved or rejected transactions can be reverted');
    }

    if (record.account_transaction_id) {
      await Account.deleteTransaction(record.account_transaction_id, userId);
    }

    return PlaidConnection.markTransactionPending(plaidTransactionId, userId);
  }

  async bulkRevertTransactions(userId, accountId, transactionIds) {
    const results = { reverted: 0, errors: [] };
    for (const id of transactionIds) {
      try {
        await this.revertTransaction(userId, accountId, id);
        results.reverted += 1;
      } catch (err) {
        results.errors.push({ transactionId: id, message: err.message });
      }
    }
    return results;
  }

  async resetApprovedImportForAccountTransaction(userId, accountTransactionId) {
    return PlaidConnection.resetApprovedTransactionByAccountTransactionId(userId, accountTransactionId);
  }
}

module.exports = new PlaidFundingService();
