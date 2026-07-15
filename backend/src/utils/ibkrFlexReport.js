const cheerio = require('cheerio');
const { parse } = require('csv-parse/sync');

const TRADE_HEADER_FIELDS = new Set([
  'buysell', 'datetime', 'tradeprice', 'ibcommission', 'tradeid', 'ibexecid',
  'levelofdetail', 'transactiontype', 'orderid'
]);
const OPEN_POSITION_HEADER_FIELDS = new Set([
  'position', 'positionquantity', 'openquantity', 'costbasisprice',
  'costbasismoney', 'markprice', 'positionvalue'
]);

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvLine(line) {
  try {
    const rows = parse(line, {
      delimiter: ',',
      relax: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true
    });
    return rows[0] || [];
  } catch (_) {
    return [];
  }
}

function classifyHeaders(headers, sectionName = '') {
  const normalizedSection = normalizeHeader(sectionName);
  if (normalizedSection === 'trades' || normalizedSection === 'trade') return 'trades';
  if (normalizedSection === 'openpositions' || normalizedSection === 'openposition') return 'open_positions';

  const normalized = headers.map(normalizeHeader);
  if (!normalized.includes('symbol')) return null;
  if (normalized.some(field => TRADE_HEADER_FIELDS.has(field))) return 'trades';
  if (normalized.some(field => OPEN_POSITION_HEADER_FIELDS.has(field))) return 'open_positions';
  return null;
}

function recordFromFields(headers, fields) {
  return headers.reduce((record, header, index) => {
    record[header] = fields[index] ?? '';
    return record;
  }, {});
}

function canonicalTradeRecord(attributes) {
  const get = (...names) => {
    for (const name of names) {
      if (attributes[name] !== undefined) return attributes[name];
    }
    return '';
  };

  return {
    Account: get('accountId', 'accountID'),
    AccountAlias: get('acctAlias'),
    Currency: get('currency'),
    AssetClass: get('assetCategory', 'assetClass'),
    Symbol: get('symbol'),
    Description: get('description'),
    Conid: get('conid'),
    UnderlyingSymbol: get('underlyingSymbol'),
    Strike: get('strike'),
    Expiry: get('expiry'),
    'Put/Call': get('putCall'),
    Multiplier: get('multiplier'),
    DateTime: get('dateTime'),
    TradeDate: get('tradeDate'),
    Quantity: get('quantity'),
    TradePrice: get('tradePrice', 'price'),
    IBCommission: get('ibCommission', 'commission'),
    IBCommissionCurrency: get('ibCommissionCurrency'),
    'Buy/Sell': get('buySell'),
    LevelOfDetail: get('levelOfDetail'),
    Code: get('notes', 'code'),
    Notes: get('notes', 'code'),
    OrderID: get('ibOrderID', 'orderID', 'orderId'),
    TradeID: get('tradeID', 'tradeId'),
    IBExecID: get('ibExecID', 'executionID', 'executionId'),
    ExtExecID: get('extExecID'),
    OpenCloseIndicator: get('openCloseIndicator'),
    FifoPnlRealized: get('fifoPnlRealized'),
    Proceeds: get('proceeds'),
    ...attributes
  };
}

function canonicalOpenPositionRecord(attributes) {
  const get = (...names) => {
    for (const name of names) {
      if (attributes[name] !== undefined) return attributes[name];
    }
    return '';
  };

  return {
    Account: get('accountId', 'accountID'),
    AccountAlias: get('acctAlias'),
    Currency: get('currency'),
    AssetClass: get('assetCategory', 'assetClass'),
    Symbol: get('symbol'),
    Description: get('description'),
    Conid: get('conid'),
    UnderlyingSymbol: get('underlyingSymbol'),
    Strike: get('strike'),
    Expiry: get('expiry'),
    'Put/Call': get('putCall'),
    Multiplier: get('multiplier'),
    ReportDate: get('reportDate'),
    Position: get('position'),
    CostBasisPrice: get('costBasisPrice', 'openPrice'),
    CostBasisMoney: get('costBasisMoney'),
    MarkPrice: get('markPrice'),
    Side: get('side'),
    LevelOfDetail: get('levelOfDetail'),
    ...attributes
  };
}

function assertStrictXmlStructure(content) {
  const stack = [];
  const tagPattern = /<([^<>]+)>/g;
  let match;
  let lastIndex = 0;

  while ((match = tagPattern.exec(content)) !== null) {
    if (content.slice(lastIndex, match.index).includes('<')) {
      throw new Error('IBKR returned malformed XML');
    }
    lastIndex = tagPattern.lastIndex;
    const token = match[1].trim();
    if (!token || token.startsWith('?') || token.startsWith('!')) continue;

    if (token.startsWith('/')) {
      const closingName = token.slice(1).trim().split(/\s+/)[0];
      const openingName = stack.pop();
      if (!openingName || openingName !== closingName) {
        throw new Error(`IBKR returned malformed XML near closing tag ${closingName}`);
      }
      continue;
    }

    if (token.endsWith('/')) continue;
    const openingName = token.split(/\s+/)[0];
    if (!/^[A-Za-z_][\w:.-]*$/.test(openingName)) {
      throw new Error('IBKR returned malformed XML');
    }
    stack.push(openingName);
  }

  if (content.slice(lastIndex).includes('<') || stack.length > 0) {
    throw new Error('IBKR returned malformed or incomplete XML');
  }
}

function decodeXmlReport(content) {
  if (/<!DOCTYPE/i.test(content)) {
    const error = new Error('IBKR XML reports containing DOCTYPE declarations are not supported');
    error.errorCode = 'INVALID_REPORT_FORMAT';
    error.transient = false;
    throw error;
  }
  if (!/<FlexQueryResponse\b/i.test(content) || !/<\/FlexQueryResponse>\s*$/i.test(content.trim())) {
    const error = new Error('IBKR returned malformed or incomplete XML');
    error.errorCode = 'INVALID_REPORT_FORMAT';
    error.transient = false;
    throw error;
  }

  try {
    assertStrictXmlStructure(content);
  } catch (cause) {
    const error = new Error(cause.message);
    error.errorCode = 'INVALID_REPORT_FORMAT';
    error.transient = false;
    throw error;
  }

  let $;
  try {
    $ = cheerio.load(content, { xml: true });
  } catch (cause) {
    const error = new Error(`Unable to parse IBKR XML report: ${cause.message}`);
    error.errorCode = 'INVALID_REPORT_FORMAT';
    error.transient = false;
    throw error;
  }

  const statements = [];
  $('FlexStatement').each((_, element) => {
    const attrs = $(element).attr() || {};
    statements.push({
      account_id: attrs.accountId || null,
      from_date: attrs.fromDate || null,
      to_date: attrs.toDate || null,
      period: attrs.period || null,
      when_generated: attrs.whenGenerated || null
    });
  });

  const trade_records = [];
  $('Trades > Trade').each((_, element) => {
    trade_records.push(canonicalTradeRecord($(element).attr() || {}));
  });

  const open_position_records = [];
  $('OpenPositions > OpenPosition').each((_, element) => {
    open_position_records.push(canonicalOpenPositionRecord($(element).attr() || {}));
  });

  return {
    recognized: true,
    format: 'xml',
    statements,
    trade_records,
    open_position_records,
    sections: {
      trades: $('Trades').length > 0,
      open_positions: $('OpenPositions').length > 0
    },
    row_counts: {
      trades: trade_records.length,
      open_positions: open_position_records.length
    },
    warnings: []
  };
}

function decodeCsvReport(content) {
  const lines = String(content || '').split(/\r?\n/);
  const trade_records = [];
  const open_position_records = [];
  let active = null;
  let headers = null;
  let hasTradesSection = false;
  let hasOpenPositionsSection = false;

  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const fields = parseCsvLine(line);
    if (fields.length === 0) continue;

    const rowType = normalizeHeader(fields[1]);
    if (rowType === 'header') {
      const candidateHeaders = fields.slice(2);
      const type = classifyHeaders(candidateHeaders, fields[0]);
      active = type;
      headers = type ? candidateHeaders : null;
      if (type === 'trades') hasTradesSection = true;
      if (type === 'open_positions') hasOpenPositionsSection = true;
      continue;
    }

    if (rowType === 'data' && active && headers) {
      const record = recordFromFields(headers, fields.slice(2));
      if (active === 'trades') trade_records.push(record);
      if (active === 'open_positions') open_position_records.push(record);
      continue;
    }

    const selfDescribingType = classifyHeaders(fields);
    if (selfDescribingType) {
      active = selfDescribingType;
      headers = fields;
      if (selfDescribingType === 'trades') hasTradesSection = true;
      if (selfDescribingType === 'open_positions') hasOpenPositionsSection = true;
      continue;
    }

    if (active && headers) {
      const record = recordFromFields(headers, fields);
      if (active === 'trades') trade_records.push(record);
      if (active === 'open_positions') open_position_records.push(record);
    }
  }

  return {
    recognized: trade_records.length > 0 || open_position_records.length > 0 || Boolean(headers),
    format: 'csv',
    statements: [],
    trade_records,
    open_position_records,
    sections: {
      trades: hasTradesSection,
      open_positions: hasOpenPositionsSection
    },
    row_counts: {
      trades: trade_records.length,
      open_positions: open_position_records.length
    },
    warnings: []
  };
}

function decodeIBKRFlexReport(content) {
  const normalized = String(content || '').replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    const error = new Error('IBKR returned an empty report');
    error.errorCode = 'INVALID_REPORT_FORMAT';
    error.transient = false;
    throw error;
  }
  if (normalized.startsWith('<')) return decodeXmlReport(normalized);
  return decodeCsvReport(normalized);
}

module.exports = {
  decodeIBKRFlexReport,
  canonicalTradeRecord,
  canonicalOpenPositionRecord
};
