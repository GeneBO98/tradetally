jest.mock('../../src/utils/currencyConverter', () => ({
  getForexRate: jest.fn()
}));

const currencyConverter = require('../../src/utils/currencyConverter');
const { convertQuoteCurrency, normaliseMinorUnit } = require('../../src/utils/quoteCurrency');

function quote(overrides = {}) {
  return { c: 100, pc: 80, d: 20, dp: 25, h: 110, l: 90, o: null, currency: 'EUR', ...overrides };
}

describe('convertQuoteCurrency', () => {
  beforeEach(() => jest.clearAllMocks());

  test('restates a EUR quote in the USD the position is booked in', async () => {
    currencyConverter.getForexRate.mockResolvedValue(1.5);

    const converted = await convertQuoteCurrency(quote(), 'USD');

    expect(converted.c).toBeCloseTo(150, 2);
    expect(converted.pc).toBeCloseTo(120, 2);
    expect(converted.currency).toBe('USD');
    expect(converted.converted_from).toBe('EUR');
  });

  test('leaves the percentage change alone, since it is currency-invariant', async () => {
    currencyConverter.getForexRate.mockResolvedValue(1.5);
    const converted = await convertQuoteCurrency(quote(), 'USD');
    expect(converted.dp).toBe(25);
  });

  test('does not call the converter when the currencies already agree', async () => {
    const converted = await convertQuoteCurrency(quote({ currency: 'USD' }), 'USD');
    expect(currencyConverter.getForexRate).not.toHaveBeenCalled();
    expect(converted.c).toBe(100);
  });

  test('treats GBp as pence, not pounds', async () => {
    currencyConverter.getForexRate.mockResolvedValue(2);

    // 1000 pence = GBP 10 = USD 20, not USD 2000.
    const converted = await convertQuoteCurrency(quote({ c: 1000, pc: 900, d: 100, currency: 'GBp' }), 'USD');

    expect(converted.c).toBeCloseTo(20, 3);
    expect(currencyConverter.getForexRate).toHaveBeenCalledWith('GBP', 'USD');
  });

  test('handles the GBX spelling of pence too', async () => {
    currencyConverter.getForexRate.mockResolvedValue(2);
    const converted = await convertQuoteCurrency(quote({ c: 1000, currency: 'GBX' }), 'USD');
    expect(converted.c).toBeCloseTo(20, 3);
  });

  test('converts pence to pounds without a rate lookup', async () => {
    const converted = await convertQuoteCurrency(quote({ c: 1000, currency: 'GBp' }), 'GBP');
    expect(converted.c).toBeCloseTo(10, 3);
    expect(currencyConverter.getForexRate).not.toHaveBeenCalled();
  });

  test('throws rather than returning an unconvertible number', async () => {
    currencyConverter.getForexRate.mockRejectedValue(new Error('no rate'));
    await expect(convertQuoteCurrency(quote(), 'USD')).rejects.toThrow('no rate');
  });

  test('throws when the converter returns nonsense', async () => {
    currencyConverter.getForexRate.mockResolvedValue(0);
    await expect(convertQuoteCurrency(quote(), 'USD')).rejects.toThrow(/invalid rate/);
  });

  test('normaliseMinorUnit distinguishes the major and minor forms', () => {
    expect(normaliseMinorUnit('GBp')).toEqual({ code: 'GBP', divisor: 100 });
    expect(normaliseMinorUnit('GBP')).toEqual({ code: 'GBP', divisor: 1 });
    expect(normaliseMinorUnit('EUR')).toEqual({ code: 'EUR', divisor: 1 });
  });
});

describe('quotes the converter must refuse', () => {
  test('throws when the quote carries no currency', async () => {
    await expect(convertQuoteCurrency(quote({ currency: null }), 'USD'))
      .rejects.toThrow(/no currency/);
    expect(currencyConverter.getForexRate).not.toHaveBeenCalled();
  });

  test('throws on an empty currency rather than assuming the target', async () => {
    await expect(convertQuoteCurrency(quote({ currency: '' }), 'USD'))
      .rejects.toThrow(/no currency/);
  });
});

describe('fields the provider did not supply', () => {
  test('leaves null OHLC null instead of converting it to zero', async () => {
    currencyConverter.getForexRate.mockResolvedValue(1.5);

    const converted = await convertQuoteCurrency(
      quote({ h: null, l: null, o: null }),
      'USD'
    );

    expect(converted.h).toBeNull();
    expect(converted.l).toBeNull();
    expect(converted.o).toBeNull();
    // The fields that were present are still converted.
    expect(converted.c).toBeCloseTo(150, 2);
  });

  test('leaves an undefined field undefined', async () => {
    currencyConverter.getForexRate.mockResolvedValue(1.5);
    const converted = await convertQuoteCurrency(quote({ h: undefined }), 'USD');
    expect(converted.h).toBeUndefined();
  });
});

describe('one raw quote converted for two currency-split positions', () => {
  test('each position gets its own target, not whichever ran last', async () => {
    // Positions are split by stored currency, so the same symbol can appear
    // twice. Converting once per SYMBOL would give both the same result.
    const raw = { c: 100, pc: 100, d: 0, dp: 0, h: 100, l: 100, o: null, currency: 'EUR' };

    currencyConverter.getForexRate.mockResolvedValue(1.5);
    const asUsd = await convertQuoteCurrency({ ...raw }, 'USD');

    currencyConverter.getForexRate.mockClear();
    const asEur = await convertQuoteCurrency({ ...raw }, 'EUR');

    expect(asUsd.c).toBeCloseTo(150, 2);
    expect(asUsd.currency).toBe('USD');
    // Already in EUR: passed through untouched, with no rate lookup.
    expect(asEur.c).toBe(100);
    expect(asEur.currency).toBe('EUR');
    expect(currencyConverter.getForexRate).not.toHaveBeenCalled();
  });
});
