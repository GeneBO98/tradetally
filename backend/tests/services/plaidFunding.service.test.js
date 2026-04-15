jest.mock('../../src/models/Account', () => ({
  addTransaction: jest.fn(),
  deleteTransaction: jest.fn()
}));

jest.mock('../../src/models/PlaidConnection', () => ({
  findTransactionById: jest.fn(),
  markTransactionApproved: jest.fn(),
  markTransactionRejected: jest.fn(),
  markTransactionPending: jest.fn(),
  upsertTransactionRule: jest.fn(),
  deleteTransactionRule: jest.fn(),
  upsertTransaction: jest.fn(),
  findTransactionRule: jest.fn(),
  markTransactionRuleApplied: jest.fn(),
  markTransactionsRemoved: jest.fn(),
  resetApprovedTransactionByAccountTransactionId: jest.fn()
}));

jest.mock('../../src/services/plaid/plaidClient', () => ({
  isConfigured: jest.fn(() => true),
  syncTransactions: jest.fn()
}));

const Account = require('../../src/models/Account');
const PlaidConnection = require('../../src/models/PlaidConnection');
const plaidClient = require('../../src/services/plaid/plaidClient');
const plaidFundingService = require('../../src/services/plaid/plaidFundingService');

describe('plaidFundingService approveTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a plaid-backed account transaction using absolute amount', async () => {
    PlaidConnection.findTransactionById.mockResolvedValue({
      id: 'plaid-tx-1',
      plaid_account_row_id: 'plaid-account-row-1',
      linked_account_id: 'acct-1',
      review_status: 'pending',
      pending: false,
      direction_guess: 'deposit',
      amount: '-1250.55',
      transaction_date: '2026-04-10',
      description: 'Transfer from bank',
      external_transaction_id: 'external-1'
    });

    Account.addTransaction.mockResolvedValue({ id: 'account-tx-1' });
    PlaidConnection.markTransactionApproved.mockResolvedValue({ id: 'plaid-tx-1' });
    PlaidConnection.upsertTransactionRule.mockResolvedValue({ id: 'rule-1' });

    await plaidFundingService.approveTransaction('user-1', 'acct-1', 'plaid-tx-1', {});

    expect(Account.addTransaction).toHaveBeenCalledWith('user-1', 'acct-1', expect.objectContaining({
      transactionType: 'deposit',
      amount: 1250.55,
      sourceType: 'plaid',
      sourceReferenceId: 'external-1'
    }));
    expect(PlaidConnection.markTransactionApproved).toHaveBeenCalledWith(
      'plaid-tx-1',
      'account-tx-1',
      'deposit'
    );
    expect(PlaidConnection.upsertTransactionRule).toHaveBeenCalledWith('user-1', expect.objectContaining({
      plaidAccountRowId: 'plaid-account-row-1',
      linkedAccountId: 'acct-1',
      matchDescription: 'Transfer from bank',
      matchDescriptionNormalized: 'transfer from bank',
      transactionType: 'deposit',
      descriptionOverride: null
    }));
  });

  test('rejects ambiguous approvals without an override transaction type', async () => {
    PlaidConnection.findTransactionById.mockResolvedValue({
      id: 'plaid-tx-2',
      linked_account_id: 'acct-1',
      review_status: 'pending',
      pending: false,
      direction_guess: 'ambiguous',
      amount: '500.00',
      transaction_date: '2026-04-10',
      description: 'External transfer',
      external_transaction_id: 'external-2'
    });

    await expect(
      plaidFundingService.approveTransaction('user-1', 'acct-1', 'plaid-tx-2', {})
    ).rejects.toThrow('A transaction type is required for approval');

    expect(Account.addTransaction).not.toHaveBeenCalled();
  });

  test('persists an override description in the auto-approval rule', async () => {
    PlaidConnection.findTransactionById.mockResolvedValue({
      id: 'plaid-tx-3',
      plaid_account_row_id: 'plaid-account-row-1',
      linked_account_id: 'acct-1',
      review_status: 'pending',
      pending: false,
      direction_guess: 'deposit',
      amount: '99.99',
      transaction_date: '2026-04-10',
      description: 'ACH CREDIT',
      external_transaction_id: 'external-3'
    });

    Account.addTransaction.mockResolvedValue({ id: 'account-tx-3' });
    PlaidConnection.markTransactionApproved.mockResolvedValue({ id: 'plaid-tx-3' });
    PlaidConnection.upsertTransactionRule.mockResolvedValue({ id: 'rule-3' });

    await plaidFundingService.approveTransaction('user-1', 'acct-1', 'plaid-tx-3', {
      transactionType: 'deposit',
      description: 'Recurring ACH deposit'
    });

    expect(PlaidConnection.upsertTransactionRule).toHaveBeenCalledWith('user-1', expect.objectContaining({
      plaidAccountRowId: 'plaid-account-row-1',
      linkedAccountId: 'acct-1',
      matchDescription: 'ACH CREDIT',
      matchDescriptionNormalized: 'ach credit',
      transactionType: 'deposit',
      descriptionOverride: 'Recurring ACH deposit'
    }));
  });
});

describe('plaidFundingService sync auto-approval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('automatically imports future matching bank transactions using the saved rule', async () => {
    plaidClient.syncTransactions.mockResolvedValue({
      added: [
        {
          transaction_id: 'external-bank-1',
          pending_transaction_id: null,
          account_id: 'plaid-acct-1',
          amount: -250,
          iso_currency_code: 'USD',
          date: '2026-04-12',
          authorized_date: '2026-04-12',
          name: 'ACH CREDIT',
          merchant_name: 'My Bank',
          pending: false,
          payment_channel: 'online'
        }
      ],
      modified: [],
      removed: [],
      next_cursor: 'cursor-2',
      has_more: false
    });

    PlaidConnection.upsertTransaction.mockResolvedValue({
      id: 'plaid-row-1',
      plaid_account_row_id: 'plaid-account-row-1',
      external_transaction_id: 'external-bank-1',
      amount: '-250.00',
      transaction_date: '2026-04-12',
      description: 'ACH CREDIT',
      pending: false,
      review_status: 'pending'
    });
    PlaidConnection.findTransactionRule.mockResolvedValue({
      id: 'rule-1',
      transactionType: 'deposit',
      descriptionOverride: 'Recurring ACH deposit'
    });
    Account.addTransaction.mockResolvedValue({ id: 'account-tx-4' });
    PlaidConnection.markTransactionApproved.mockResolvedValue({ id: 'plaid-row-1' });
    PlaidConnection.markTransactionRuleApplied.mockResolvedValue({ id: 'rule-1' });
    PlaidConnection.markTransactionsRemoved.mockResolvedValue(0);

    const result = await plaidFundingService.syncBankTransactions({
      id: 'connection-1',
      userId: 'user-1',
      accessToken: 'secret',
      lastSyncCursor: null
    }, new Map([
      ['plaid-acct-1', {
        id: 'plaid-account-row-1',
        plaidAccountId: 'plaid-acct-1',
        accountType: 'depository',
        accountSubtype: 'checking',
        trackingMode: 'funding_source',
        linkedAccountId: 'acct-1'
      }]
    ]));

    expect(result).toEqual({
      processedCount: 1,
      nextCursor: 'cursor-2'
    });
    expect(PlaidConnection.findTransactionRule).toHaveBeenCalledWith(
      'user-1',
      'plaid-account-row-1',
      'acct-1',
      'ach credit'
    );
    expect(Account.addTransaction).toHaveBeenCalledWith('user-1', 'acct-1', expect.objectContaining({
      transactionType: 'deposit',
      amount: 250,
      description: 'Recurring ACH deposit',
      sourceType: 'plaid',
      sourceReferenceId: 'external-bank-1'
    }));
    expect(PlaidConnection.markTransactionApproved).toHaveBeenCalledWith(
      'plaid-row-1',
      'account-tx-4',
      'deposit'
    );
    expect(PlaidConnection.markTransactionRuleApplied).toHaveBeenCalledWith('rule-1');
  });
});

describe('plaidFundingService revertTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('removes the saved approval rule when the transaction is untracked', async () => {
    PlaidConnection.findTransactionById.mockResolvedValue({
      id: 'plaid-tx-5',
      plaid_account_row_id: 'plaid-account-row-1',
      linked_account_id: 'acct-1',
      review_status: 'approved',
      pending: false,
      description: 'ACH CREDIT',
      account_transaction_id: 'account-tx-5'
    });
    Account.deleteTransaction.mockResolvedValue(true);
    PlaidConnection.deleteTransactionRule.mockResolvedValue({ id: 'rule-5' });
    PlaidConnection.markTransactionPending.mockResolvedValue({ id: 'plaid-tx-5' });

    await plaidFundingService.revertTransaction('user-1', 'acct-1', 'plaid-tx-5');

    expect(Account.deleteTransaction).toHaveBeenCalledWith('account-tx-5', 'user-1');
    expect(PlaidConnection.deleteTransactionRule).toHaveBeenCalledWith(
      'user-1',
      'plaid-account-row-1',
      'acct-1',
      'ach credit'
    );
    expect(PlaidConnection.markTransactionPending).toHaveBeenCalledWith('plaid-tx-5', 'user-1');
  });
});
