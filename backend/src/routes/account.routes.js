/**
 * Account Routes
 * API endpoints for account management and cashflow
 * GitHub Issue: #135
 */

const express = require('express');
const router = express.Router();
const accountController = require('../controllers/account.controller');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Account CRUD - specific routes before parameterized routes
router.get('/primary', accountController.getPrimaryAccount);
router.get('/unlinked-identifiers', accountController.getUnlinkedIdentifiers);

// Transaction routes (must come before /:id to avoid conflicts)
router.get('/transactions/:transactionId', accountController.getTransactions);
router.put('/transactions/:transactionId', accountController.updateTransaction);
router.delete('/transactions/:transactionId', accountController.deleteTransaction);

// Account CRUD
router.get('/', accountController.getAccounts);
router.post('/', accountController.createAccount);
router.get('/:id', accountController.getAccount);
router.put('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);

// Account-specific transactions
router.get('/:accountId/transactions', accountController.getTransactions);
router.post('/:accountId/transactions', accountController.addTransaction);

// Cashflow
router.get('/:accountId/cashflow', accountController.getCashflow);

module.exports = router;
