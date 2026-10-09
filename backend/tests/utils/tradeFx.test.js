const { tradeBaseCurrency, normalizeRowToUsd, fxUsd } = require('../../src/utils/tradeFx');

describe('tradeBaseCurrency', () => {
  test('a row rewritten at import is USD, whatever original_currency says', () => {
    expect(tradeBaseCurrency({
      original_currency: 'EUR',
      original_entry_price_currency: 90.5
    })).toBe('USD');
  });

  test('exchange_rate alone does not mark a row as converted', () => {
    // Manual/API/OAuth trades carry a rate beside an unconverted price
    expect(tradeBaseCurrency({ original_currency: 'EUR', exchange_rate: 1.1 })).toBe('EUR');
  });

  test('defaults to USD when nothing is recorded', () => {
    expect(tradeBaseCurrency({})).toBe('USD');
    expect(tradeBaseCurrency(null)).toBe('USD');
  });
});

describe('normalizeRowToUsd', () => {
  const rates = { EUR: 0.5 };

  test('converts excursions alongside the P&L they are compared against', () => {
    const row = {
      original_currency: 'EUR',
      pnl: 100,
      entry_price: 20,
      mae: 10,
      mfe: 40,
      post_exit_mae: 5,
      post_exit_mfe: 30
    };
    normalizeRowToUsd(row, rates);

    // Exit efficiency divides one of these by the other, so they must move
    // together or the ratio silently compares EUR to USD.
    expect(row.pnl).toBe(200);
    expect(row.mae).toBe(20);
    expect(row.mfe).toBe(80);
    expect(row.post_exit_mae).toBe(10);
    expect(row.post_exit_mfe).toBe(60);
    expect(row.mfe / row.pnl).toBe(40 / 100);
  });

  test('leaves USD-base rows untouched', () => {
    const row = { original_currency: 'USD', pnl: 100, mae: 10 };
    expect(normalizeRowToUsd(row, rates)).toBe(1);
    expect(row).toEqual({ original_currency: 'USD', pnl: 100, mae: 10 });
  });

  test('leaves rows untouched when no rate map is available', () => {
    const row = { original_currency: 'EUR', pnl: 100, mae: 10 };
    expect(normalizeRowToUsd(row, null)).toBe(1);
    expect(row.pnl).toBe(100);
  });

  test('scales money inside the executions JSONB too', () => {
    const row = {
      original_currency: 'EUR',
      pnl: 100,
      executions: [{ price: 20, pnl: 50, commission: 2, quantity: 10 }]
    };
    normalizeRowToUsd(row, rates);

    expect(row.executions[0].price).toBe(40);
    expect(row.executions[0].pnl).toBe(100);
    expect(row.executions[0].commission).toBe(4);
    // Share counts are not money
    expect(row.executions[0].quantity).toBe(10);
  });
});

describe('fxUsd SQL fragment', () => {
  test('passes the companion columns the SQL function needs', () => {
    expect(fxUsd('pnl', 't')).toBe(
      'trade_amount_usd(t.pnl, t.original_currency, t.exchange_rate, t.original_entry_price_currency)'
    );
  });

  test('supports an unaliased trades scan', () => {
    expect(fxUsd('pnl', '')).toBe(
      'trade_amount_usd(pnl, original_currency, exchange_rate, original_entry_price_currency)'
    );
  });
});
