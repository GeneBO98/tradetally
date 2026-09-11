const {
  detectBrokerFormat,
  findLikelyDelimitedHeaderLine,
  ACCOUNT_FIELD_PATTERNS
} = require('./csv/detect');
const {
  decodeSierraChartActivityData,
  extractSierraChartAccountFromFilename,
  isSierraChartBinary
} = require('./csv/parsers/sierraChart');

function normalizeAccountValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '');
}

function findAccountColumnIndex(fields) {
  const normalizedPatterns = ACCOUNT_FIELD_PATTERNS.map(normalizeHeader);
  for (let index = 0; index < fields.length; index++) {
    const normalized = normalizeHeader(fields[index]);
    if (!normalized) continue;
    if (normalizedPatterns.some(pattern => normalized === pattern || normalized.includes(pattern))) {
      return index;
    }
  }
  return -1;
}

function splitRow(line, delimiter) {
  return line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''));
}

function scanCsvAccountIdentifiers(fileBuffer, { maxRows = 5000 } = {}) {
  let csvString = fileBuffer.toString('utf-8');
  if (csvString.charCodeAt(0) === 0xFEFF) csvString = csvString.slice(1);

  const lines = csvString.split(/\r?\n/);
  const headerInfo = findLikelyDelimitedHeaderLine(lines);
  if (!headerInfo) return [];

  const fields = splitRow(headerInfo.line, headerInfo.delimiter);
  const accountIndex = findAccountColumnIndex(fields);
  if (accountIndex < 0) return [];

  const identifiers = new Set();
  let scanned = 0;
  for (let i = headerInfo.index + 1; i < lines.length && scanned < maxRows; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    scanned++;
    const columns = splitRow(line, headerInfo.delimiter);
    const account = normalizeAccountValue(columns[accountIndex]);
    if (account) identifiers.add(account);
  }

  return [...identifiers];
}

/**
 * Best-effort account-identifier detection for the import pre-check.
 * Per-record identifiers are authoritative; the Sierra filename is a fallback.
 */
function detectImportAccounts(fileBuffer, fileName, options = {}) {
  const detectedBroker = detectBrokerFormat(fileBuffer);
  const identifiers = new Set();
  let source = null;

  if (isSierraChartBinary(fileBuffer)) {
    const records = decodeSierraChartActivityData(fileBuffer);
    for (const record of records) {
      const account = normalizeAccountValue(record.TradeAccount);
      if (account) identifiers.add(account);
    }
    if (identifiers.size > 0) source = 'record';
  } else {
    for (const account of scanCsvAccountIdentifiers(fileBuffer, options)) {
      identifiers.add(account);
    }
    if (identifiers.size > 0) source = 'record';
  }

  if (identifiers.size === 0) {
    const fromFilename = extractSierraChartAccountFromFilename(fileName);
    if (fromFilename) {
      identifiers.add(fromFilename);
      source = 'filename';
    }
  }

  return {
    detectedBroker,
    accountIdentifiers: [...identifiers],
    source,
    fileName: fileName || null
  };
}

const ACCOUNT_MODES = ['auto', 'none', 'override'];

function resolveAccountMode(accountMode, accountId) {
  const normalized = typeof accountMode === 'string' ? accountMode.trim().toLowerCase() : '';
  if (ACCOUNT_MODES.includes(normalized)) return normalized;
  return accountId ? 'override' : 'auto';
}

function applyAccountModeToTrades(trades, accountMode) {
  if (!Array.isArray(trades)) return trades;
  if (accountMode !== 'none') return trades;
  for (const trade of trades) {
    trade.account_identifier = null;
    trade.accountIdentifier = null;
  }
  return trades;
}

function buildImportAccountScope(accountMode, selectedAccountIdentifier, parameterPosition) {
  if (accountMode === 'none') {
    return {
      clause: ` AND (account_identifier IS NULL OR account_identifier = '')`,
      params: []
    };
  }

  if (selectedAccountIdentifier) {
    return {
      clause: ` AND account_identifier = $${parameterPosition}`,
      params: [selectedAccountIdentifier]
    };
  }

  return { clause: '', params: [] };
}

module.exports = {
  detectImportAccounts,
  scanCsvAccountIdentifiers,
  findAccountColumnIndex,
  resolveAccountMode,
  applyAccountModeToTrades,
  buildImportAccountScope
};
