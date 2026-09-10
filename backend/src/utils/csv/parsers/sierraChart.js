/*
 * Sierra Chart binary decoding is based on sc_activity_data.py supplied with
 * issue #404. Copyright (c) 2026 electricar. Used under the MIT License:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const { computeTradePnl } = require('../../../services/pnlEngine');
const { getFuturesPointValue } = require('../../futuresUtils');
const { parseInstrumentData, parseNumeric, cleanString } = require('../shared');

const RECORD_TERMINATOR = 199;
const VERSION_FIELD = 1;
const PRICE_SCALE = 100;
const SC_EPOCH_MS = Date.UTC(1899, 11, 30);

function isSierraChartBinary(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length < 16) return false;
  try {
    return fileBuffer.readUInt32LE(0) === VERSION_FIELD &&
      fileBuffer.readUInt32LE(4) === 8 &&
      fileBuffer.readBigInt64LE(8) === 2n;
  } catch {
    return false;
  }
}

function decodeScDateTime(raw) {
  if (raw.length !== 8) return '';
  const micros = raw.readBigInt64LE(0);
  if (micros <= 0n) return '';
  const millis = Number(micros / 1000n);
  const date = new Date(SC_EPOCH_MS + millis);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function decodeSierraChartActivityData(fileBuffer) {
  if (!isSierraChartBinary(fileBuffer)) {
    throw new Error('Unrecognized Sierra Chart Trade Activity Log binary format');
  }

  const records = [];
  let record = {};
  let offset = 0;

  while (offset + 8 <= fileBuffer.length) {
    const fieldId = fileBuffer.readUInt32LE(offset);
    const length = fileBuffer.readUInt32LE(offset + 4);
    offset += 8;
    if (length > fileBuffer.length - offset) {
      throw new Error(`Truncated Sierra Chart field ${fieldId}`);
    }
    const raw = fileBuffer.subarray(offset, offset + length);
    offset += length;

    if (fieldId === RECORD_TERMINATOR && length === 0) {
      if (Object.keys(record).length > 0) records.push(record);
      record = {};
      continue;
    }
    if (fieldId === VERSION_FIELD) continue;

    switch (fieldId) {
      case 101:
        if (length === 4) record.ActivityType = raw.readInt32LE(0) === 2 ? 'Fills' : 'Orders';
        break;
      case 102:
        record.DateTime = decodeScDateTime(raw);
        break;
      case 103:
        record.Symbol = raw.toString('utf8');
        break;
      case 105:
        if (length === 8) record.InternalOrderID = raw.readBigInt64LE(0).toString();
        break;
      case 108:
        if (length === 8) record.Quantity = raw.readDoubleLE(0);
        break;
      case 109:
        record.BuySell = raw[0] === 1 ? 'Buy' : raw[0] === 2 ? 'Sell' : '';
        break;
      case 113:
        if (length === 8) record.FillPrice = raw.readDoubleLE(0) / PRICE_SCALE;
        break;
      case 114:
        if (length === 8) record.FilledQuantity = raw.readDoubleLE(0);
        break;
      case 118:
        record.TradeAccount = raw.toString('utf8');
        break;
      case 120:
        record.OpenClose = raw[0] === 1 ? 'Open' : raw[0] === 2 ? 'Close' : '';
        break;
      case 124:
        record.FillExecutionServiceID = raw.toString('utf8');
        break;
      case 125:
        if (length === 8) record.PositionQuantity = raw.readDoubleLE(0);
        break;
      case 130:
        record.Note = raw.toString('utf8');
        break;
      case 160:
        record.TransDateTime = decodeScDateTime(raw);
        break;
      default:
        break;
    }
  }

  if (Object.keys(record).length > 0) records.push(record);
  return records;
}

function normalizeSierraSymbol(rawSymbol) {
  return cleanString(rawSymbol).toUpperCase().replace(/\.[A-Z0-9_-]+$/, '');
}

function hasSierraChartExportPriceScale(records) {
  const fillPrices = records
    .filter(record => cleanString(getField(record, 'ActivityType')) === 'Fills')
    .map(record => cleanString(getField(record, 'FillPrice')))
    .filter(Boolean);

  // Trade Activity Log > File > Export emits the internal x100 price with
  // seven decimal places. Save Log As emits display prices and local display
  // times, so accepting it would silently corrupt both price and timestamp.
  return fillPrices.length > 0 && fillPrices.some(value => /\.\d{4,}$/.test(value));
}

function parseUtcTimestamp(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    const normalized = raw.replace(/\s{2,}/g, ' ').replace(' ', 'T');
    const date = new Date(`${normalized}Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getField(record, ...names) {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
}

function createTrade(transaction) {
  return {
    symbol: transaction.symbol,
    side: transaction.action === 'buy' ? 'long' : 'short',
    broker: 'sierrachart',
    accountIdentifier: transaction.accountIdentifier,
    executions: [],
    notes: transaction.note || '',
    openQuantity: 0,
    maxQuantity: 0
  };
}

function appendExecution(trade, transaction, quantity) {
  const previous = trade.executions[trade.executions.length - 1];
  const canAggregate = previous &&
    previous.action === transaction.action &&
    previous.datetime === transaction.datetime &&
    Math.abs(Number(previous.price) - Number(transaction.price)) < 1e-9;

  if (canAggregate) {
    previous.quantity += quantity;
    previous.execution_ids = [
      ...(previous.execution_ids || [previous.execution_id].filter(Boolean)),
      transaction.executionId
    ].filter(Boolean);
    previous.order_ids = [
      ...(previous.order_ids || [previous.order_id].filter(Boolean)),
      transaction.orderId
    ].filter(Boolean);
    return;
  }

  trade.executions.push({
    action: transaction.action,
    side: transaction.action,
    quantity,
    price: transaction.price,
    datetime: transaction.datetime,
    orderId: transaction.orderId || null,
    order_id: transaction.orderId || null,
    execution_id: transaction.executionId || null,
    execution_ids: transaction.executionId ? [transaction.executionId] : [],
    order_ids: transaction.orderId ? [transaction.orderId] : [],
    commission: 0,
    fees: 0
  });
}

function finalizeTrade(trade, instrumentData, timezone) {
  const result = computeTradePnl({
    side: trade.side,
    instrumentType: instrumentData.instrumentType,
    contractSize: instrumentData.contractSize,
    pointValue: instrumentData.pointValue,
    executions: trade.executions,
    fallbackCommission: 0,
    fallbackFees: 0,
    timezone: timezone || 'UTC'
  });
  const aggregate = result.aggregate;

  return {
    symbol: trade.symbol,
    tradeDate: aggregate.trade_date,
    entryTime: aggregate.entry_time,
    exitTime: aggregate.exit_time,
    entryPrice: aggregate.entry_price,
    exitPrice: aggregate.exit_price,
    quantity: aggregate.quantity || trade.maxQuantity,
    side: trade.side,
    commission: aggregate.commission || 0,
    entryCommission: 0,
    exitCommission: 0,
    fees: aggregate.fees || 0,
    pnl: aggregate.pnl,
    profitLoss: aggregate.pnl,
    pnlPercent: aggregate.pnl_percent,
    broker: 'sierrachart',
    accountIdentifier: trade.accountIdentifier,
    currency: 'USD',
    notes: trade.notes,
    executions: result.annotatedExecutions,
    executionData: result.annotatedExecutions,
    ...instrumentData
  };
}

function parseSierraChartTransactions(records, context = {}, options = {}) {
  const diagnostics = context.diagnostics;
  const pricesAreScaled = options.pricesAreScaled !== false;
  const transactions = [];

  records.forEach((record, index) => {
    if (cleanString(getField(record, 'ActivityType')) !== 'Fills') {
      if (diagnostics) diagnostics.expected_skipped_rows++;
      return;
    }

    const rawSymbol = getField(record, 'Symbol');
    const symbol = normalizeSierraSymbol(rawSymbol);
    const action = cleanString(getField(record, 'BuySell')).toLowerCase();
    const rawPrice = parseNumeric(getField(record, 'FillPrice'), NaN);
    const price = pricesAreScaled ? rawPrice / PRICE_SCALE : rawPrice;
    const quantity = Math.abs(parseNumeric(getField(record, 'Quantity', 'FilledQuantity'), 0));
    const datetime = parseUtcTimestamp(getField(record, 'DateTime', 'TransDateTime'));

    if (!symbol || !['buy', 'sell'].includes(action) || !Number.isFinite(price) || price <= 0 || quantity <= 0 || !datetime) {
      if (diagnostics) {
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: index + 1, reason: 'Invalid Sierra Chart fill row' });
      }
      return;
    }

    transactions.push({
      symbol,
      action,
      price,
      quantity,
      datetime,
      orderId: cleanString(getField(record, 'InternalOrderID')),
      executionId: cleanString(getField(record, 'FillExecutionServiceID')),
      accountIdentifier: context.selectedAccountId || cleanString(getField(record, 'TradeAccount')) || null,
      note: cleanString(getField(record, 'Note')),
      rowIndex: index
    });
  });

  transactions.sort((left, right) => {
    const timeDiff = new Date(left.datetime) - new Date(right.datetime);
    return timeDiff || left.rowIndex - right.rowIndex;
  });

  const states = new Map();
  const completedTrades = [];

  for (const transaction of transactions) {
    const key = `${transaction.accountIdentifier || ''}::${transaction.symbol}`;
    let state = states.get(key) || { position: 0, trade: null };
    let remaining = transaction.quantity;
    const direction = transaction.action === 'buy' ? 1 : -1;
    const instrumentData = parseInstrumentData(transaction.symbol);
    if (instrumentData.instrumentType !== 'future') {
      instrumentData.instrumentType = 'future';
      instrumentData.underlyingAsset = transaction.symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '');
      instrumentData.pointValue = getFuturesPointValue(instrumentData.underlyingAsset);
    }
    instrumentData.underlyingSymbol = instrumentData.underlyingSymbol || instrumentData.underlyingAsset || null;

    while (remaining > 0) {
      if (state.position === 0) {
        state.trade = createTrade(transaction);
        appendExecution(state.trade, transaction, remaining);
        state.position = direction * remaining;
        state.trade.openQuantity = Math.abs(state.position);
        state.trade.maxQuantity = Math.max(state.trade.maxQuantity, Math.abs(state.position));
        remaining = 0;
        continue;
      }

      if (Math.sign(state.position) === direction) {
        appendExecution(state.trade, transaction, remaining);
        state.position += direction * remaining;
        state.trade.openQuantity = Math.abs(state.position);
        state.trade.maxQuantity = Math.max(state.trade.maxQuantity, Math.abs(state.position));
        remaining = 0;
        continue;
      }

      const closingQuantity = Math.min(Math.abs(state.position), remaining);
      appendExecution(state.trade, transaction, closingQuantity);
      state.position += direction * closingQuantity;
      state.trade.openQuantity = Math.abs(state.position);
      remaining -= closingQuantity;

      if (Math.abs(state.position) < 1e-9) {
        completedTrades.push(finalizeTrade(state.trade, instrumentData, context.userTimezone));
        state.position = 0;
        state.trade = null;
      }
    }

    states.set(key, state);
  }

  if (diagnostics) {
    diagnostics.parsedRows = transactions.length;
    diagnostics.skippedRows = diagnostics.totalRows - transactions.length;
  }
  return completedTrades;
}

module.exports = {
  decodeSierraChartActivityData,
  hasSierraChartExportPriceScale,
  isSierraChartBinary,
  normalizeSierraSymbol,
  parseSierraChartTransactions
};
