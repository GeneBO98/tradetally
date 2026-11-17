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
const { parseSuggestion, normalizeInput, buildPrompt } = CsvMappingSuggestionService;

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
});
