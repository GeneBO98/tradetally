const TaxReportService = require('../services/tax/taxReportService');
const { toCsv, toTxf, TXF_CODES } = require('../services/tax/taxExport');
const { convertForDisplay } = require('../utils/displayCurrency');
const logger = require('../utils/logger');

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function parseYear(value) {
  if (value === undefined || value === null || value === '') return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : NaN;
}

function parseAccounts(value) {
  if (!value) return null;
  const list = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

const taxReportController = {
  // GET /api/tax-report?year=2025&accounts=a,b&page=1&pageSize=100&term=short|long&washOnly=true
  async getReport(req, res, next) {
    try {
      const year = parseYear(req.query.year);
      if (Number.isNaN(year)) {
        return res.status(400).json({ error: 'year must be a four-digit year' });
      }
      const report = await TaxReportService.generate(req.user.id, {
        year,
        accounts: parseAccounts(req.query.accounts)
      });

      let rows = report.rows;
      if (req.query.term === 'short' || req.query.term === 'long') {
        rows = rows.filter((row) => row.term === req.query.term);
      }
      if (req.query.washOnly === 'true') {
        rows = rows.filter((row) => row.adjustmentCode === 'W');
      }

      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));
      const totalRows = rows.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const page = Math.min(totalPages, Math.max(1, parseInt(req.query.page, 10) || 1));

      // Tax figures are US dollar amounts for a US return; they are not
      // converted to the user's display currency.
      res.json(await convertForDisplay(req, {
        ...report,
        rows: rows.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, totalRows, totalPages }
      }, { skip: true }));
    } catch (error) {
      logger.logError('Error building tax report:', error);
      next(error);
    }
  },

  // GET /api/tax-report/export?year=2025&format=csv|txf&box=A|B|C
  async exportReport(req, res, next) {
    try {
      const year = parseYear(req.query.year);
      if (!year) {
        return res.status(400).json({ error: 'year is required' });
      }
      const format = String(req.query.format || 'csv').toLowerCase();
      if (!['csv', 'txf'].includes(format)) {
        return res.status(400).json({ error: 'format must be csv or txf' });
      }
      const box = String(req.query.box || 'A').toUpperCase();
      if (!TXF_CODES[box]) {
        return res.status(400).json({ error: 'box must be A, B or C' });
      }

      const report = await TaxReportService.generate(req.user.id, {
        year,
        accounts: parseAccounts(req.query.accounts)
      });

      const body = format === 'txf' ? toTxf(report, { box }) : toCsv(report);
      res.setHeader('Content-Type', format === 'txf' ? 'text/plain; charset=utf-8' : 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tradetally-form-8949-${year}.${format}"`);
      res.send(body);
    } catch (error) {
      logger.logError('Error exporting tax report:', error);
      next(error);
    }
  }
};

module.exports = taxReportController;
