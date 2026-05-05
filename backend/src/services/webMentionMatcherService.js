const crypto = require('crypto');

class WebMentionMatcherService {
  static normalizeSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase().replace(/^\$/, '');
  }

  static normalizeTerm(term) {
    return String(term || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  static normalizeSymbols(symbols = []) {
    return [...new Set((symbols || []).map(this.normalizeSymbol).filter(Boolean))];
  }

  static normalizeTerms(terms = []) {
    return [...new Set((terms || []).map(this.normalizeTerm).filter(Boolean))];
  }

  static hashUrl(url) {
    return crypto.createHash('sha256').update(String(url || '').trim()).digest('hex');
  }

  static buildSearchText(item) {
    return `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  }

  static matchesPhrase(text, phrase) {
    const normalized = this.normalizeTerm(phrase);
    if (!normalized) return false;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
  }

  static matchesSymbol(text, symbol) {
    const normalized = this.normalizeSymbol(symbol);
    if (!normalized) return false;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Z0-9])\\$?${escaped}([^A-Z0-9]|$)`, 'i').test(text);
  }

  static matchItem(item, symbols = [], terms = []) {
    const text = this.buildSearchText(item);
    const matched_symbols = this.normalizeSymbols(symbols).filter(symbol => this.matchesSymbol(text, symbol));
    const matched_terms = this.normalizeTerms(terms).filter(term => this.matchesPhrase(text, term));
    return {
      matched_symbols,
      matched_terms,
      matched: matched_symbols.length > 0 || matched_terms.length > 0
    };
  }
}

module.exports = WebMentionMatcherService;
