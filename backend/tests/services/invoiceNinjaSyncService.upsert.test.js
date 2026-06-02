jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const invoiceNinjaSyncService = require('../../src/services/invoiceNinjaSyncService');

describe('InvoiceNinjaSyncService client reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invoiceNinjaSyncService.enabled = true;
    invoiceNinjaSyncService.apiUrl = 'https://billing.example.com';
    invoiceNinjaSyncService.apiKey = 'token';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('restores a deleted client before updating it', async () => {
    jest.spyOn(invoiceNinjaSyncService, 'findClientByEmail').mockResolvedValue({
      id: 'client_1',
      is_deleted: true,
      archived_at: 1775862092,
      contacts: [
        {
          id: 'contact_1',
          email: 'ben911t@gmail.com'
        }
      ]
    });

    const restoreSpy = jest.spyOn(invoiceNinjaSyncService, 'restoreClient').mockResolvedValue({
      data: [{ id: 'client_1' }]
    });
    const requestSpy = jest.spyOn(invoiceNinjaSyncService, 'request').mockResolvedValue({
      data: { id: 'client_1' }
    });

    await invoiceNinjaSyncService.upsertClient({
      id: 'user-1',
      email: 'ben911t@gmail.com',
      username: 'ben911t',
      full_name: 'Ben Tester',
      tier: 'pro',
      subscription_status: 'active',
      stripe_customer_id: 'cus_123',
      trade_count: 12,
      created_at: '2026-04-18T12:21:32.000Z'
    });

    expect(restoreSpy).toHaveBeenCalledWith('client_1');
    expect(requestSpy).toHaveBeenCalledWith(
      'PUT',
      '/clients/client_1',
      expect.objectContaining({
        contacts: [
          expect.objectContaining({
            id: 'contact_1',
            email: 'ben911t@gmail.com'
          })
        ]
      })
    );
  });

  it('deletes managed Invoice Ninja clients that are no longer in the local sync set', async () => {
    jest.spyOn(invoiceNinjaSyncService, 'syncProducts').mockResolvedValue(undefined);
    jest.spyOn(invoiceNinjaSyncService, 'fetchBillableUsers').mockResolvedValue([
      {
        id: 'user-1',
        email: 'active@example.com',
        username: 'active-user',
        full_name: 'Active User',
        tier: 'pro',
        subscription_status: 'active',
        stripe_customer_id: 'cus_123',
        trade_count: 4,
        created_at: '2026-04-18T12:21:32.000Z'
      }
    ]);
    jest.spyOn(invoiceNinjaSyncService, 'upsertClient').mockResolvedValue({ data: { id: 'client_1' } });
    jest.spyOn(invoiceNinjaSyncService, 'listClients').mockResolvedValue([
      {
        id: 'client_keep',
        is_deleted: false,
        private_notes: 'TradeTally User ID: user-1\nUsername: active-user',
        contacts: [{ email: 'active@example.com' }]
      },
      {
        id: 'client_delete',
        is_deleted: false,
        private_notes: 'TradeTally User ID: user-2\nUsername: old-user',
        contacts: [{ email: 'old@example.com' }]
      }
    ]);
    const deleteSpy = jest.spyOn(invoiceNinjaSyncService, 'deleteClient').mockResolvedValue({
      data: [{ id: 'client_delete' }]
    });

    const result = await invoiceNinjaSyncService.syncAll();

    expect(deleteSpy).toHaveBeenCalledWith('client_delete');
    expect(result).toEqual({
      synced: 1,
      deleted: 1,
      errors: 0
    });
  });
});
