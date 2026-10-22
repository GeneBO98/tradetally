/**
 * Account Routes
 * API endpoints for account management and cashflow
 * GitHub Issue: #135
 */

const express = require('express');
const router = express.Router();
const accountController = require('../controllers/account.controller');
const plaidController = require('../controllers/plaid.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { requiresTier } = require('../middleware/tierAuth');

// Plaid linking/syncing is Pro, like broker sync. Viewing an existing
// connection, its balance history and review queue, rejecting/reverting
// review items, and disconnecting or unlinking stay available so downgraded users can see and clean up their data.
// Plaid's own webhooks are mounted separately at /api/plaid/webhook.
const requirePro = requiresTier('pro');

// All routes require authentication
router.use(authenticate);

// Account CRUD - specific routes before parameterized routes
router.get('/primary', accountController.getPrimaryAccount);
router.get('/unlinked-identifiers', accountController.getUnlinkedIdentifiers);
router.get('/debug/trade-identifiers', accountController.getTradeIdentifiersSummary);

// Plaid funding sync
router.post('/plaid/link-token', requirePro, plaidController.createLinkToken);
router.post('/plaid/exchange', requirePro, plaidController.exchangePublicToken);
router.get('/plaid/connections', plaidController.getConnections);
router.get('/plaid/balances/history', plaidController.getBalanceHistory);
router.put('/plaid/connections/:connectionId', requirePro, plaidController.updateConnection);
router.delete('/plaid/connections/:connectionId', plaidController.deleteConnection);
router.post('/plaid/connections/:connectionId/sync', requirePro, plaidController.syncConnection);
router.post('/plaid/connections/:connectionId/reconnect-token', requirePro, plaidController.createReconnectToken);
router.put('/plaid/accounts/:plaidAccountId/link', requirePro, plaidController.linkPlaidAccount);
router.delete('/plaid/accounts/:plaidAccountId/link', plaidController.unlinkPlaidAccount);
router.get('/:accountId/plaid/review', plaidController.getReviewQueue);
router.post('/:accountId/plaid/review/bulk-approve', requirePro, plaidController.bulkApproveTransactions);
router.post('/:accountId/plaid/review/bulk-reject', plaidController.bulkRejectTransactions);
router.post('/:accountId/plaid/review/bulk-revert', plaidController.bulkRevertTransactions);
router.post('/:accountId/plaid/review/:transactionId/approve', requirePro, plaidController.approveTransaction);
router.post('/:accountId/plaid/review/:transactionId/reject', plaidController.rejectTransaction);
router.post('/:accountId/plaid/review/:transactionId/revert', plaidController.revertTransaction);

// Transaction routes (must come before /:id to avoid conflicts)
router.get('/transactions/:transactionId', accountController.getTransactions);
router.put('/transactions/:transactionId', validate(schemas.accountTransactionUpdate), accountController.updateTransaction);
router.delete('/transactions/:transactionId', accountController.deleteTransaction);

// Account CRUD
router.get('/', accountController.getAccounts);
router.post('/', validate(schemas.accountCreate), accountController.createAccount);
router.get('/:id', accountController.getAccount);
router.put('/:id', validate(schemas.accountUpdate), accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);

// Account-specific transactions
router.get('/:accountId/transactions', accountController.getTransactions);
router.post('/:accountId/transactions', validate(schemas.accountTransaction), accountController.addTransaction);

// Cashflow
router.get('/:accountId/cashflow', accountController.getCashflow);
router.get('/:accountId/cashflow/day', accountController.getDayActivity);
router.get('/:accountId/debug-cashflow', accountController.debugCashflow);

// Fix trades with redacted account identifiers
router.post('/:accountId/fix-trades', accountController.fixRedactedTrades);

// Link trades to an account
router.post('/:accountId/link-trades', validate(schemas.accountLinkTrades), accountController.linkTradesToAccount);

module.exports = router;
