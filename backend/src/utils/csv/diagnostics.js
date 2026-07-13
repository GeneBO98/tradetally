const { localToUTC } = require('../timezone');
const { convertTradeDatetimesToUTC, normalizeExecutionCollections, normalizeParsedTradeInstrumentData, repairTradeReversals } = require('./grouping');
const { parseTimeOnly } = require('./shared');


function formatDiagnosticList(items = []) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function hasDateLikeHeader(headers = []) {
  return headers.some((header) => {
    const normalized = String(header || '').toLowerCase().trim();
    return normalized.includes('date') || normalized.includes('t/d');
  });
}

function hasTimeLikeHeader(headers = []) {
  return headers.some((header) => {
    const normalized = String(header || '').toLowerCase().trim();
    return normalized.includes('time') || normalized.includes('timestamp');
  });
}

function buildReasonBreakdown(skippedReasons = []) {
  if (!Array.isArray(skippedReasons) || skippedReasons.length === 0) {
    return [];
  }

  const counts = new Map();
  for (const item of skippedReasons) {
    const reason = String(item?.reason || 'Unknown issue').trim();
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

function buildGenericValidationReason(trade, record, context = {}) {
  const missingFields = [];
  const rawTimeValue =
    record?.['Entry Time'] || record?.['Exec Time'] || record?.['Execution Time'] ||
    record?.['Fill Time'] || record?.['Trade Time'] || record?.Timestamp ||
    record?.order_execution_time || record?.['order_execution_time'] ||
    record?.['Date and time'] || record?.Time || record?.time ||
    record?.['Opening time (UTC-4)'] || record?.['Opening Time'] || record?.['Open Time'] ||
    record?.['Opened Time'];

  if (!trade?.symbol) missingFields.push('symbol');
  if (!(trade?.entryPrice > 0)) missingFields.push('price');
  if (!(Number(trade?.quantity) > 0)) missingFields.push('quantity');

  if (!trade?.tradeDate) {
    if (parseTimeOnly(rawTimeValue)) {
      if (context.importDate) {
        missingFields.push('trade date');
      } else {
        return 'Could not import this row: time was present, but no trade date was found in the CSV or filename.';
      }
    } else {
      missingFields.push('trade date');
    }
  }

  if (missingFields.length === 0) {
    return 'Could not import this row: required trade values were missing or invalid.';
  }

  return `Could not import this row: missing or invalid ${formatDiagnosticList(missingFields)}.`;
}

function buildDiagnosticSummary(diagnostics, context = {}) {
  if (!diagnostics || diagnostics.totalRows === 0) {
    return null;
  }

  const headers = diagnostics.headerAnalysis?.foundHeaders || [];
  const reasonBreakdown = buildReasonBreakdown(diagnostics.skippedReasons);
  const topReason = reasonBreakdown[0]?.reason || '';
  const actionableSkippedRows = Math.max(
    0,
    diagnostics.skippedRows - (diagnostics.expected_skipped_rows || 0)
  );
  const allRowsSkipped = diagnostics.parsedRows === 0 && (diagnostics.invalidRows + diagnostics.skippedRows) >= diagnostics.totalRows;
  const skipRate = diagnostics.totalRows > 0
    ? ((actionableSkippedRows + diagnostics.invalidRows) / diagnostics.totalRows) * 100
    : 0;
  const recognizedBroker = diagnostics.detectedBroker || diagnostics.headerAnalysis?.recognizedAs || 'generic';
  const dateHeadersPresent = hasDateLikeHeader(headers);
  const timeHeadersPresent = hasTimeLikeHeader(headers);
  const importDateFromFilename = context.importDate || null;

  if (allRowsSkipped && recognizedBroker === 'generic' && timeHeadersPresent && !dateHeadersPresent) {
    return {
      title: 'Headers were recognized, but every row is missing a trade date.',
      body: importDateFromFilename
        ? `TradeTally recognized this as Generic CSV and recovered the date from the filename (${importDateFromFilename}), but the rows still could not be turned into complete trades.`
        : 'TradeTally recognized this as Generic CSV. The file includes time values, but there is no date column and no date in the filename for TradeTally to use.',
      steps: importDateFromFilename
        ? [
            'Confirm the file only contains executions from that single trade date.',
            'Add a Date column if the CSV mixes multiple trading days.',
            'Re-import after exporting a trade activity or fills report when available.'
          ]
        : [
            'Export a CSV that includes a Date or Trade Date column.',
            'If the file is for a single trading day, include that date in the filename, for example AXIL-2026-05-02.csv.',
            'Use a broker trade activity or fills export instead of an account summary.'
          ]
    };
  }

  if (allRowsSkipped && topReason) {
    return {
      title: 'TradeTally could not build trades from this file.',
      body: `The most common row issue was: ${topReason}`,
      steps: [
        'Open skipped row details below to inspect the first few failures.',
        'Confirm the CSV contains executions or trade activity rather than balances or positions.',
        'Use Generic CSV mapping or broker-specific export instructions if the layout differs.'
      ]
    };
  }

  if (skipRate >= 50 && diagnostics.parsedRows > 0) {
    return {
      title: 'Import completed, but many rows could not be used.',
      body: `TradeTally imported ${diagnostics.parsedRows} trades, but could not use ${(actionableSkippedRows + diagnostics.invalidRows)} of ${diagnostics.totalRows} rows.`,
      steps: [
        'Review skipped row details to see whether non-trade rows are mixed into the file.',
        'Filter the export to executions, fills, or transactions only.',
        'Check the top skipped reasons before importing a larger file.'
      ]
    };
  }

  return null;
}

function wrapResultWithDiagnostics(trades, diagnostics, unresolvedCusips = [], userTimezone = null) {
  // Convert naive datetimes to UTC using the user's timezone
  if (userTimezone && userTimezone !== 'UTC') {
    console.log(`[TIMEZONE] Converting trade datetimes from ${userTimezone} to UTC`);
    convertTradeDatetimesToUTC(trades, userTimezone);
  }

  normalizeExecutionCollections(trades);
  trades = trades.map(trade => normalizeParsedTradeInstrumentData(trade));
  trades = repairTradeReversals(trades, diagnostics);

  // Update diagnostics with final counts
  diagnostics.parsedRows = trades.length;

  // Calculate skip rate
  if (diagnostics.totalRows > 0) {
    const actionableSkippedRows = Math.max(
      0,
      diagnostics.skippedRows - (diagnostics.expected_skipped_rows || 0)
    );
    const skipRate = ((actionableSkippedRows + diagnostics.invalidRows) / diagnostics.totalRows) * 100;
    if (skipRate > 50) {
      diagnostics.warnings.push(`High skip rate: ${skipRate.toFixed(1)}% of rows were skipped or invalid`);
    }
  }

  diagnostics.reason_breakdown = buildReasonBreakdown(diagnostics.skippedReasons);
  diagnostics.user_summary = buildDiagnosticSummary(diagnostics, {
    importDate: diagnostics.importDate
  });

  // Log diagnostics summary
  console.log(`[DIAGNOSTICS] Total: ${diagnostics.totalRows}, Parsed: ${diagnostics.parsedRows}, Skipped: ${diagnostics.skippedRows}, Invalid: ${diagnostics.invalidRows}`);
  if (diagnostics.skippedReasons.length > 0) {
    console.log(`[DIAGNOSTICS] Skip reasons (first 5): ${JSON.stringify(diagnostics.skippedReasons.slice(0, 5))}`);
  }

  return {
    trades,
    diagnostics,
    unresolvedCusips
  };
}

function convertManualReviewDatetimesToUTC(manualReviewItems, timezone) {
  if (!timezone || timezone === 'UTC' || !Array.isArray(manualReviewItems) || manualReviewItems.length === 0) {
    return manualReviewItems;
  }

  for (const item of manualReviewItems) {
    if (item.datetime && typeof item.datetime === 'string') {
      item.datetime = localToUTC(item.datetime, timezone);
    }
  }

  return manualReviewItems;
}

function attachManualReviewDiagnostics(result, diagnostics, manualReviewItems = [], userTimezone = null) {
  if (!Array.isArray(manualReviewItems) || manualReviewItems.length === 0) {
    return result;
  }

  convertManualReviewDatetimesToUTC(manualReviewItems, userTimezone);
  result.manualReviewItems = manualReviewItems;
  diagnostics.manual_review_items = manualReviewItems;
  diagnostics.manual_review_count = manualReviewItems.length;
  diagnostics.warnings.push(
    `${manualReviewItems.length} sell-only stock execution${manualReviewItems.length === 1 ? '' : 's'} require manual review before importing.`
  );

  return result;
}

module.exports = {
  formatDiagnosticList,
  hasDateLikeHeader,
  hasTimeLikeHeader,
  buildReasonBreakdown,
  buildGenericValidationReason,
  buildDiagnosticSummary,
  wrapResultWithDiagnostics,
  convertManualReviewDatetimesToUTC,
  attachManualReviewDiagnostics
};
