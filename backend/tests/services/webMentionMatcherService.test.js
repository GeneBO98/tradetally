const WebMentionMatcherService = require('../../src/services/webMentionMatcherService');

describe('WebMentionMatcherService', () => {
  test('matches symbols with optional dollar prefix and case normalization', () => {
    const item = {
      title: 'XOM and $URA rally as uranium supply tightens',
      snippet: 'Energy names are moving'
    };

    const result = WebMentionMatcherService.matchItem(item, ['xom', 'URA', 'AAPL'], []);

    expect(result.matched).toBe(true);
    expect(result.matched_symbols).toEqual(['XOM', 'URA']);
  });

  test('matches phrases without matching partial words', () => {
    const item = {
      title: 'Nuclear fusion funding rises as grid demand grows',
      snippet: 'Renewables remain part of the plan'
    };

    const result = WebMentionMatcherService.matchItem(item, [], ['nuclear fusion', 'grid', 'gas']);

    expect(result.matched_terms).toEqual(['nuclear fusion', 'grid']);
  });

  test('normalizes duplicate symbols and terms', () => {
    expect(WebMentionMatcherService.normalizeSymbols([' aapl ', '$AAPL', 'msft'])).toEqual(['AAPL', 'MSFT']);
    expect(WebMentionMatcherService.normalizeTerms(['Oil', ' oil ', 'natural   gas'])).toEqual(['oil', 'natural gas']);
  });

  test('hashes identical URLs consistently for dedupe', () => {
    const hash = WebMentionMatcherService.hashUrl('https://example.com/a');
    expect(hash).toBe(WebMentionMatcherService.hashUrl('https://example.com/a'));
    expect(hash).not.toBe(WebMentionMatcherService.hashUrl('https://example.com/b'));
  });
});
