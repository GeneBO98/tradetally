jest.mock('../../src/services/aiSessionService', () => ({
  getAISettings: jest.fn(),
  buildClassifierSettings: jest.fn(),
  creditCost: jest.fn(),
  checkCredits: jest.fn(),
  chargeCredits: jest.fn()
}));

jest.mock('../../src/utils/aiProvider', () => ({
  generateResponse: jest.fn()
}));

const AISessionService = require('../../src/services/aiSessionService');
const AIProvider = require('../../src/utils/aiProvider');
const CsvMappingSuggestionService = require('../../src/services/csvMappingSuggestionService');
const { parseSuggestion, normalizeInput, buildPrompt, redactSample } = CsvMappingSuggestionService;

const HEADERS = ['Instrument', 'Lots', 'Open', 'Close', 'Dir', 'Opened At', 'Order Ref'];

describe('parseSuggestion', () => {
  it('maps column indexes back to the file headers', () => {
    const result = parseSuggestion(
      'Here you go:\n```json\n{"columns": {"symbol_column": 0, "quantity_column": 1, "entry_price_column": 2, "exit_price_column": 3, "side_column": 4, "entry_date_column": 5}, "date_format": "DD/MM/YYYY"}\n```',
      HEADERS
    );

    expect(result.mapping).toMatchObject({
      symbol_column: 'Instrument',
      quantity_column: 'Lots',
      entry_price_column: 'Open',
      exit_price_column: 'Close',
      side_column: 'Dir',
      entry_date_column: 'Opened At',
      pnl_column: null
    });
    expect(result.date_format).toBe('DD/MM/YYYY');
    expect(result.matched).toBe(6);
    expect(result.missing_required).toEqual([]);
  });

  it('accepts header names in place of indexes, case-insensitively', () => {
    const result = parseSuggestion('{"columns": {"symbol_column": "instrument", "quantity_column": "1"}}', HEADERS);

    expect(result.mapping.symbol_column).toBe('Instrument');
    expect(result.mapping.quantity_column).toBe('Lots');
  });

  it('drops columns that are not in the file', () => {
    const result = parseSuggestion(
      '{"columns": {"symbol_column": "Ticker", "quantity_column": 99, "entry_price_column": -1, "side_column": 4}, "date_format": "YYYY/MM/DD"}',
      HEADERS
    );

    expect(result.mapping.symbol_column).toBeNull();
    expect(result.mapping.quantity_column).toBeNull();
    expect(result.mapping.entry_price_column).toBeNull();
    expect(result.mapping.side_column).toBe('Dir');
    expect(result.date_format).toBeNull();
    expect(result.missing_required).toEqual(['symbol_column', 'quantity_column', 'entry_price_column']);
  });

  it('gives a column claimed by two fields to the more important one', () => {
    const result = parseSuggestion('{"columns": {"entry_price_column": 2, "exit_price_column": 2}}', HEADERS);

    expect(result.mapping.entry_price_column).toBe('Open');
    expect(result.mapping.exit_price_column).toBeNull();
  });

  it('returns null for a reply that is not JSON', () => {
    expect(parseSuggestion('I could not read this file.', HEADERS)).toBeNull();
    expect(parseSuggestion('{"columns": ', HEADERS)).toBeNull();
    expect(parseSuggestion('{"symbol_column": 0}', HEADERS)).toBeNull();
  });
});

describe('normalizeInput', () => {
  it('rejects input without usable headers', () => {
    expect(() => normalizeInput('Symbol,Qty', {})).toThrow(/array/);
    expect(() => normalizeInput(['Symbol'], {})).toThrow(/two column headers/);
  });

  it('clips samples and drops duplicate or oversized headers', () => {
    const { headers, samples } = normalizeInput(
      ['Symbol', 'Symbol', 'Qty', 'x'.repeat(200), 42],
      { Symbol: ['AAPL', '', 'MSFT', 'TSLA', 'NVDA'], Qty: ['1'.repeat(200)] }
    );

    expect(headers).toEqual(['Symbol', 'Qty']);
    expect(samples.Symbol).toEqual(['AAPL', 'MSFT', 'TSLA']);
    expect(samples.Qty[0]).toHaveLength(60);
  });
});

describe('redactSample', () => {
  it('hides every value in an account-like column', () => {
    expect(redactSample('Account Number', '4471')).toBe('[redacted]');
    expect(redactSample('Acct', 'U1234567')).toBe('[redacted]');
    expect(redactSample('Client ID', 'abc')).toBe('[redacted]');
  });

  it('masks account-style identifiers found in other columns', () => {
    expect(redactSample('Description', 'Transfer from U1234567')).toBe('Transfer from U#######');
    expect(redactSample('Ref', '123-456789-001')).toBe('###-######-###');
    expect(redactSample('Order Ref', '987654321012')).toBe('############');
  });

  it('leaves symbols, prices, quantities and dates readable', () => {
    expect(redactSample('Instrument', 'EURUSD')).toBe('EURUSD');
    expect(redactSample('Price', '1,234,567.89')).toBe('1,234,567.89');
    expect(redactSample('Qty', '1500000')).toBe('1500000');
    expect(redactSample('Opened At', '14/03/2026 09:30')).toBe('14/03/2026 09:30');
    expect(redactSample('Date', '2026-03-14T09:30:00Z')).toBe('2026-03-14T09:30:00Z');
    expect(redactSample('Date', '20260314')).toBe('20260314');
  });

  it('masks an identifier even when the same cell holds a date', () => {
    expect(redactSample('Memo', 'Transfer from U1234567 on 2026-03-14')).toBe('Transfer from U####### on 2026-03-14');
    expect(redactSample('Memo', '14/03/2026 09:30 acct 987654321')).toBe('14/03/2026 09:30 acct #########');
  });

  it('does not mistake a date-shaped identifier for a date', () => {
    expect(redactSample('Ref', '123-45-6789')).toBe('###-##-####');
    expect(redactSample('Ref', '45-67-8912')).toBe('##-##-####');
  });

  it('recognises abbreviated and non-English account headers', () => {
    for (const header of ['Acc No', 'A/C', 'Acc #', 'Konto', 'Kontonummer', 'Compte', 'Cuenta', 'Account ID']) {
      expect(redactSample(header, '4471')).toBe('[redacted]');
    }
    expect(redactSample('Accumulated', '4471')).toBe('4471');
    expect(redactSample('Contact', 'x')).toBe('x');
  });

  it('masks header text in the prompt, since a headerless file has data there', () => {
    const prompt = buildPrompt(['U1234567', 'AAPL', '2026-03-14'], {});
    expect(prompt).toContain('"header":"U#######"');
    expect(prompt).toContain('"header":"AAPL"');
    expect(prompt).toContain('"header":"2026-03-14"');
    expect(prompt).not.toContain('1234567');
  });

  it('is applied to the samples that go into the prompt', () => {
    const { samples } = normalizeInput(
      ['Symbol', 'Account', 'Memo'],
      { Symbol: ['AAPL'], Account: ['DU7654321'], Memo: ['acct X12345678 fill'] }
    );
    expect(samples).toEqual({ Symbol: ['AAPL'], Account: ['[redacted]'], Memo: ['acct X######## fill'] });
    expect(buildPrompt(['Symbol', 'Account', 'Memo'], samples)).not.toMatch(/7654321|12345678/);
  });
});

describe('buildPrompt', () => {
  it('sends headers and samples as JSON data', () => {
    const prompt = buildPrompt(['Symbol', 'Qty'], { Symbol: ['AAPL'], Qty: ['10'] });

    expect(prompt).toContain('{"index":0,"header":"Symbol","samples":["AAPL"]}');
    expect(prompt).toContain('symbol_column');
  });
});

describe('CsvMappingSuggestionService.suggest', () => {
  const input = { headers: HEADERS, sampleRows: { Instrument: ['EURUSD'], Lots: ['0.5'] } };

  beforeEach(() => {
    jest.clearAllMocks();
    AISessionService.getAISettings.mockResolvedValue({ provider: 'gemini' });
    AISessionService.buildClassifierSettings.mockReturnValue({ provider: 'gemini', modelName: 'small' });
    AISessionService.creditCost.mockReturnValue(5);
    AISessionService.checkCredits.mockResolvedValue({ allowed: true, remaining: 200 });
    AISessionService.chargeCredits.mockResolvedValue({ remaining: 195 });
  });

  it('returns the mapping and charges credits once on success', async () => {
    AIProvider.generateResponse.mockResolvedValue(
      '{"columns": {"symbol_column": 0, "quantity_column": 1, "entry_price_column": 2}, "date_format": null}'
    );

    const result = await CsvMappingSuggestionService.suggest('user-1', input);

    expect(result.mapping.symbol_column).toBe('Instrument');
    expect(result.credits_used).toBe(5);
    expect(result.credits_remaining).toBe(195);
    expect(AISessionService.creditCost).toHaveBeenCalledWith('CSV_MAPPING_SUGGEST', { provider: 'gemini' });
    expect(AISessionService.chargeCredits).toHaveBeenCalledTimes(1);
  });

  it('reports AI as unavailable when no provider is configured', async () => {
    AISessionService.getAISettings.mockRejectedValue(new Error('No AI provider configured'));

    await expect(CsvMappingSuggestionService.suggest('user-1', input))
      .rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
    expect(AIProvider.generateResponse).not.toHaveBeenCalled();
  });

  it('does not call the model when the user is out of credits', async () => {
    AISessionService.checkCredits.mockRejectedValue(new Error('Insufficient credits. You have 2 credits'));

    await expect(CsvMappingSuggestionService.suggest('user-1', input))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS', status: 402 });
    expect(AIProvider.generateResponse).not.toHaveBeenCalled();
  });

  it('reports a tier without AI access separately from running out of credits', async () => {
    AISessionService.checkCredits.mockRejectedValue(new Error('AI features require a Pro subscription'));

    await expect(CsvMappingSuggestionService.suggest('user-1', input))
      .rejects.toMatchObject({ code: 'PRO_REQUIRED', status: 403 });
    expect(AIProvider.generateResponse).not.toHaveBeenCalled();
  });

  it('does not charge when the provider call fails', async () => {
    AIProvider.generateResponse.mockRejectedValue(new Error('upstream 500'));

    await expect(CsvMappingSuggestionService.suggest('user-1', input))
      .rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
    expect(AISessionService.chargeCredits).not.toHaveBeenCalled();
  });

  it('does not charge when the reply matches no columns', async () => {
    AIProvider.generateResponse.mockResolvedValue('{"columns": {"symbol_column": null}}');

    await expect(CsvMappingSuggestionService.suggest('user-1', input))
      .rejects.toMatchObject({ code: 'NO_SUGGESTION', status: 422 });
    expect(AISessionService.chargeCredits).not.toHaveBeenCalled();
  });

  it('does not charge when the caller stopped waiting for the reply', async () => {
    AIProvider.generateResponse.mockResolvedValue(
      '{"columns": {"symbol_column": 0, "quantity_column": 1, "entry_price_column": 2}, "date_format": null}'
    );

    await expect(CsvMappingSuggestionService.suggest('user-1', input, { isCancelled: () => true }))
      .rejects.toMatchObject({ code: 'CANCELLED' });
    expect(AISessionService.chargeCredits).not.toHaveBeenCalled();
  });
});
