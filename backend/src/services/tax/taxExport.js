/**
 * File exports of the tax report.
 *
 *  - CSV laid out in Form 8949 column order, for a spreadsheet or a preparer.
 *  - TXF (Tax Exchange Format V042), the file TurboTax Desktop, H&R Block and
 *    TaxAct import. TurboTax has no API for third parties and TurboTax Online
 *    does not read TXF, so this file is the integration.
 */

const { escapeCsv } = require('../../utils/csvEscape');

// TXF reference numbers per Form 8949 box. Copy A = basis reported to the IRS,
// Copy B = basis not reported, Copy C = no Form 1099-B received.
const TXF_CODES = {
  A: { short: 321, long: 323 },
  B: { short: 711, long: 713 },
  C: { short: 712, long: 714 }
};

const money = (value) => (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);

// 2025-03-14 -> 03/14/2025
function usDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

function toCsv(report) {
  const header = [
    'Description of property', 'Date acquired', 'Date sold', 'Proceeds', 'Cost or other basis',
    'Adjustment code', 'Adjustment amount', 'Gain or loss', 'Term', 'Symbol', 'Account'
  ];
  const lines = [header.join(',')];
  for (const row of report.rows) {
    lines.push([
      escapeCsv(row.description),
      usDate(row.dateAcquired),
      usDate(row.dateSold),
      // Amounts are written bare: escapeCsv would quote-prefix a negative number.
      money(row.proceeds),
      money(row.costBasis),
      row.adjustmentCode,
      row.adjustmentAmount ? money(row.adjustmentAmount) : '',
      money(row.gainLoss),
      row.term === 'long' ? 'Long-term' : 'Short-term',
      escapeCsv(row.symbol),
      escapeCsv(row.account || '')
    ].join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {object} report - from TaxReportService
 * @param {{box?: 'A'|'B'|'C', createdOn?: Date}} options
 */
function toTxf(report, { box = 'A', createdOn = new Date() } = {}) {
  const codes = TXF_CODES[box] || TXF_CODES.A;
  const created = `${String(createdOn.getMonth() + 1).padStart(2, '0')}/${String(createdOn.getDate()).padStart(2, '0')}/${createdOn.getFullYear()}`;
  const lines = ['V042', 'ATradeTally', `D${created}`, '^'];

  for (const row of report.rows) {
    lines.push(
      'TD',
      `N${row.term === 'long' ? codes.long : codes.short}`,
      'C1',
      'L1',
      // One field per line: strip anything that would start a new one.
      `P${String(row.description).replace(/[\r\n^]+/g, ' ')}`,
      `D${usDate(row.dateAcquired)}`,
      `D${usDate(row.dateSold)}`,
      `$${money(row.costBasis)}`,
      `$${money(row.proceeds)}`
    );
    // Record format 5: a third amount carries the disallowed wash sale loss.
    if (row.adjustmentAmount > 0) lines.push(`$${money(row.adjustmentAmount)}`);
    lines.push('^');
  }
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { toCsv, toTxf, TXF_CODES };
