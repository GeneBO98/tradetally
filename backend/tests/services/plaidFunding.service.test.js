jest.mock('../../src/models/Account', () => ({
  addTransaction: jest.fn()
}));

jest.mock('../../src/models/PlaidConnection', () => ({
  findTransactionById: jest.fn(),
  markTransactionApproved: jest.fn(),
  markTransactionRejected: jest.fn(),
  resetApprovedTransactionByAccountTransactionId: jest.fn()
}));

jest.mock('../../src/services/plaid/plaidClient', () => ({
  isConfigured: jest.fn(() => true)
}));

const Account = require('../../src/models/Account');
const PlaidConnection = require('../../src/models/PlaidConnection');
const plaidFundingService = require('../../src/services/plaid/plaidFundingService');

describe('plaidFundingService approveTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a plaid-backed account transaction using absolute amount', async () => {
    PlaidConnection.findTransactionById.mockResolvedValue({
      id: 'plaid-tx-1',
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
});
