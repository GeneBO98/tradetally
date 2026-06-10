const EdgeReportService = require('../services/edgeReportService');

const edgeReportController = {
  // GET /api/edge-reports - most recent reports first (max 12)
  async listReports(req, res, next) {
    try {
      const reports = await EdgeReportService.listForUser(req.user.id, 12);
      res.json({ reports });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/edge-reports/latest
  async getLatestReport(req, res, next) {
    try {
      const report = await EdgeReportService.getLatestForUser(req.user.id);
      if (!report) {
        return res.status(404).json({ error: 'No edge report available yet' });
      }
      res.json({ report });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/edge-reports/generate - on-demand report for the current week
  async generateReport(req, res, next) {
    try {
      const row = await EdgeReportService.generateForUser(req.user.id, { force: true });
      if (!row) {
        return res.json({
          report: null,
          message: 'No completed trades in the report period, so no report was generated'
        });
      }
      res.status(201).json({ report: row });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = edgeReportController;
