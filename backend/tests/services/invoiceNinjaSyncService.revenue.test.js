jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const invoiceNinjaSyncService = require('../../src/services/invoiceNinjaSyncService');

describe('InvoiceNinjaSyncService.syncStripeInvoiceRevenue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invoiceNinjaSyncService.enabled = true;
    invoiceNinjaSyncService.apiUrl = 'https://billing.example.com';
    invoiceNinjaSyncService.apiKey = 'token';
  });

  it('creates a paid Invoice Ninja invoice and stores an idempotent sync record', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          username: 'user1',
          full_name: 'User Example',
          tier: 'pro',
          created_at: '2026-04-06T00:00:00.000Z',
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
          subscription_status: 'active',
          trade_count: 10
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          stripe_invoice_id: 'in_123',
          status: 'synced',
          invoice_ninja_invoice_id: 'inv_ninja_1'
        }]
      });

    jest.spyOn(invoiceNinjaSyncService, 'upsertClient').mockResolvedValue({
      data: { id: 'client_1' }
    });
    jest.spyOn(invoiceNinjaSyncService, 'request').mockResolvedValue({
      data: { id: 'inv_ninja_1' }
    });

    const result = await invoiceNinjaSyncService.syncStripeInvoiceRevenue('user-1', {
      id: 'in_123',
      customer: 'cus_123',
      subscription: 'sub_123',
      payment_intent: 'pi_123',
      amount_paid: 800,
      currency: 'usd',
      created: 1775683200,
      status_transitions: { paid_at: 1775683200 },
      lines: {
        data: [{
          description: 'TradeTally Pro Monthly',
          price: { recurring: { interval: 'month' } }
        }]
      }
    });

    expect(invoiceNinjaSyncService.upsertClient).toHaveBeenCalled();
    expect(invoiceNinjaSyncService.request).toHaveBeenCalledWith(
      'POST',
      '/invoices?paid=true&amount_paid=8.00',
      expect.objectContaining({
        client_id: 'client_1',
        custom_value1: 'in_123',
        custom_value2: 'sub_123',
        custom_value3: 'pi_123',
        line_items: [
          expect.objectContaining({
            cost: 8,
            product_key: 'tradetally_pro_monthly'
          })
        ]
      })
    );
    expect(result.invoice.id).toBe('inv_ninja_1');
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO invoice_ninja_revenue_syncs'),
      expect.arrayContaining([
        'in_123',
        'pi_123',
        'cus_123',
        'sub_123',
        'user-1',
        'client_1',
        'inv_ninja_1',
        8,
        'usd',
        'synced'
      ])
    );
  });

  it('skips creating revenue when the Stripe invoice was already synced', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        stripe_invoice_id: 'in_123',
        status: 'synced',
        invoice_ninja_invoice_id: 'inv_ninja_1'
      }]
    });

    const upsertSpy = jest.spyOn(invoiceNinjaSyncService, 'upsertClient');
    const requestSpy = jest.spyOn(invoiceNinjaSyncService, 'request');

    const result = await invoiceNinjaSyncService.syncStripeInvoiceRevenue('user-1', {
      id: 'in_123',
      amount_paid: 800,
      currency: 'usd'
    });

    expect(result).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'already_synced'
    }));
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
