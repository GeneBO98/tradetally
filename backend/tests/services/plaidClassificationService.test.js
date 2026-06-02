const plaidClassificationService = require('../../src/services/plaid/plaidClassificationService');

describe('plaidClassificationService', () => {
  test('maps tracked account inflow to a deposit suggestion', () => {
    const result = plaidClassificationService.classify({
      amount: -1500,
      description: 'ACH transfer from Schwab brokerage',
      merchantName: 'Charles Schwab',
      metadata: {
        categoryPrimary: 'TRANSFER_IN'
      }
    }, {
      trackingMode: 'tracked_account',
      accountType: 'investment',
      accountSubtype: 'brokerage'
    });

    expect(result.directionGuess).toBe('deposit');
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  test('inverts direction for funding source accounts', () => {
    const result = plaidClassificationService.classify({
      amount: 500,
      description: 'ACH transfer to Robinhood',
      merchantName: 'Robinhood',
      metadata: {
        categoryPrimary: 'TRANSFER_OUT'
      }
    }, {
      trackingMode: 'funding_source',
      accountType: 'depository',
      accountSubtype: 'checking'
    });

    expect(result.directionGuess).toBe('deposit');
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });
});
