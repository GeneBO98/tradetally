describe('plaidClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      PLAID_CLIENT_ID: 'client-id',
      PLAID_SECRET: 'secret',
      PLAID_ENV: 'sandbox'
    };
  });

  afterEach(() => {
    jest.dontMock('axios');
    process.env = originalEnv;
  });


  test('creates bank link token request with normalized country codes', async () => {
    process.env.PLAID_COUNTRY_CODES = 'us, ca,invalid';
    const axiosPost = jest.fn().mockResolvedValue({
      data: {
        link_token: 'link-token',
        expiration: '2026-06-03T00:00:00Z'
      }
    });
    jest.doMock('axios', () => ({ post: axiosPost }));

    const plaidClient = require('../../src/services/plaid/plaidClient');

    await plaidClient.createLinkToken({ userId: 'user-1', email: 'user@example.com' });

    expect(axiosPost).toHaveBeenCalledWith(
      'https://sandbox.plaid.com/link/token/create',
      expect.objectContaining({
        client_id: 'client-id',
        secret: 'secret',
        client_name: 'TradeTally',
        language: 'en',
        country_codes: ['US', 'CA'],
        products: ['transactions'],
        user: {
          client_user_id: 'user-1',
          email_address: 'user@example.com'
        },
        transactions: {
          days_requested: 730
        }
      }),
      expect.any(Object)
    );
  });

  test('falls back to US country code when Plaid country configuration is empty', async () => {
    process.env.PLAID_COUNTRY_CODES = ' , invalid ';
    const axiosPost = jest.fn().mockResolvedValue({ data: { link_token: 'link-token' } });
    jest.doMock('axios', () => ({ post: axiosPost }));

    const plaidClient = require('../../src/services/plaid/plaidClient');

    await plaidClient.createLinkToken({ userId: 'user-1' });

    expect(axiosPost).toHaveBeenCalledWith(
      'https://sandbox.plaid.com/link/token/create',
      expect.objectContaining({
        country_codes: ['US'],
        products: ['transactions']
      }),
      expect.any(Object)
    );
  });

  test('omits cursor on initial transactions sync', async () => {
    const axiosPost = jest.fn().mockResolvedValue({ data: { has_more: false } });
    jest.doMock('axios', () => ({ post: axiosPost }));

    const plaidClient = require('../../src/services/plaid/plaidClient');

    await plaidClient.syncTransactions('access-token');

    expect(axiosPost).toHaveBeenCalledWith(
      'https://sandbox.plaid.com/transactions/sync',
      {
        client_id: 'client-id',
        secret: 'secret',
        access_token: 'access-token',
        count: 100
      },
      expect.any(Object)
    );
  });

  test('includes cursor on subsequent transactions sync', async () => {
    const axiosPost = jest.fn().mockResolvedValue({ data: { has_more: false } });
    jest.doMock('axios', () => ({ post: axiosPost }));

    const plaidClient = require('../../src/services/plaid/plaidClient');

    await plaidClient.syncTransactions('access-token', 'cursor-1');

    expect(axiosPost).toHaveBeenCalledWith(
      'https://sandbox.plaid.com/transactions/sync',
      expect.objectContaining({ cursor: 'cursor-1' }),
      expect.any(Object)
    );
  });

  test('surfaces Plaid API error details', async () => {
    const axiosPost = jest.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          error_type: 'INVALID_REQUEST',
          error_code: 'INVALID_FIELD',
          error_message: 'cursor must be a string',
          request_id: 'request-1'
        }
      }
    });
    jest.doMock('axios', () => ({ post: axiosPost }));

    const plaidClient = require('../../src/services/plaid/plaidClient');

    await expect(plaidClient.syncTransactions('access-token')).rejects.toMatchObject({
      message: 'Plaid request failed: INVALID_FIELD - cursor must be a string',
      status: 400,
      plaid: {
        errorType: 'INVALID_REQUEST',
        errorCode: 'INVALID_FIELD',
        requestId: 'request-1'
      }
    });
  });
});
