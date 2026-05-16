const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const stockSplitService = require('../services/stockSplitService');
const StockSplit = require('../models/StockSplit');
const logger = require('../utils/logger');
const BrokerConnection = require('../models/BrokerConnection');
const executionRunController = require('../controllers/executionRun.controller');
const operationalMetricsController = require('../controllers/operationalMetrics.controller');

router.get('/execution-runs', requireAdmin, executionRunController.listAdmin);
router.get('/execution-runs/summary', requireAdmin, executionRunController.adminSummary);
router.get('/execution-runs/:id/report', requireAdmin, (req, res, next) => {
  req.adminReport = true;
  return executionRunController.getReport(req, res, next);
});
router.get('/observability/slo', requireAdmin, operationalMetricsController.getSlo);
router.get('/alerts', requireAdmin, operationalMetricsController.listAlerts);
router.get('/alerts/audit', requireAdmin, operationalMetricsController.listAlertActionAudits);
router.get('/alerts/suppression-rules', requireAdmin, operationalMetricsController.listAlertSuppressionRules);
router.post('/alerts/suppression-rules', requireAdmin, operationalMetricsController.upsertAlertSuppressionRule);
router.get('/alerts/escalation-destinations', requireAdmin, operationalMetricsController.listAlertEscalationDestinations);
router.post('/alerts/escalation-destinations', requireAdmin, operationalMetricsController.upsertAlertEscalationDestination);
router.get('/alerts/escalation-destinations/audits', requireAdmin, operationalMetricsController.listAlertEscalationDestinationAudits);
router.get('/alerts/escalation-destinations/requests', requireAdmin, operationalMetricsController.listAlertEscalationDestinationRequests);
router.post('/alerts/escalation-destinations/requests', requireAdmin, operationalMetricsController.requestAlertEscalationDestinationAction);
router.post('/alerts/escalation-destinations/requests/:id/actions', requireAdmin, operationalMetricsController.runAlertEscalationDestinationRequestAction);
router.post('/alerts/escalation-destinations/:id/actions', requireAdmin, operationalMetricsController.runAlertEscalationDestinationAction);
router.get('/alerts/escalation-deliveries', requireAdmin, operationalMetricsController.listAlertEscalationDeliveries);
router.post('/alerts/escalation-deliveries/:id/retry', requireAdmin, operationalMetricsController.retryAlertEscalationDelivery);
router.get('/alerts/escalation-delivery-replay-requests', requireAdmin, operationalMetricsController.listAlertEscalationDeliveryReplayRequests);
router.post('/alerts/escalation-deliveries/:id/replay-requests', requireAdmin, operationalMetricsController.requestAlertEscalationDeliveryReplay);
router.post('/alerts/escalation-delivery-replay-requests/:id/actions', requireAdmin, operationalMetricsController.runAlertEscalationDeliveryReplayRequestAction);
router.post('/alerts/scan', requireAdmin, operationalMetricsController.scanAlerts);
router.post('/alerts/:id/actions', requireAdmin, operationalMetricsController.runAlertAction);
router.get('/import-account-reconciliations', requireAdmin, operationalMetricsController.listImportAccountReconciliations);
router.post('/import-account-reconciliations/bulk-actions', requireAdmin, operationalMetricsController.runImportAccountReconciliationBulkAction);
router.post('/import-account-reconciliations/:id/actions', requireAdmin, operationalMetricsController.runImportAccountReconciliationAction);
router.get('/import-account-reconciliation-audits', requireAdmin, operationalMetricsController.listImportAccountReconciliationAudits);
router.post('/import-account-reconciliation-audits/:id/rollback', requireAdmin, operationalMetricsController.rollbackImportAccountReconciliationAudit);
router.get('/report-templates', requireAdmin, operationalMetricsController.listReportTemplates);
router.get('/report-templates/revisions', requireAdmin, operationalMetricsController.listReportTemplateRevisions);
router.post('/report-templates/revisions/:id/actions', requireAdmin, operationalMetricsController.runReportTemplateRevisionAction);
router.post('/report-templates/:templateKey/revisions', requireAdmin, operationalMetricsController.requestReportTemplateUpdate);
router.post('/report-templates/:templateKey/preview', requireAdmin, operationalMetricsController.previewReportTemplate);
router.post('/report-templates/:templateKey', requireAdmin, operationalMetricsController.upsertReportTemplate);
router.post('/execution-runs/events/backfill-hashes', requireAdmin, operationalMetricsController.backfillExecutionEventHashes);
router.get('/workflow-settings', requireAdmin, operationalMetricsController.listWorkflowSettings);
router.get('/workflow-settings/revisions', requireAdmin, operationalMetricsController.listWorkflowSettingRevisions);
router.post('/workflow-settings/:source/revisions', requireAdmin, operationalMetricsController.requestWorkflowSettingsUpdate);
router.post('/workflow-settings/revisions/:id/actions', requireAdmin, operationalMetricsController.runWorkflowSettingRevisionAction);
router.patch('/workflow-settings/:source', requireAdmin, operationalMetricsController.updateWorkflowSettings);
router.get('/strategy-anomaly-settings', requireAdmin, operationalMetricsController.listStrategyAnomalySettings);
router.post('/strategy-anomaly-settings', requireAdmin, operationalMetricsController.upsertStrategyAnomalySettings);
router.get('/performance-budgets', requireAdmin, operationalMetricsController.listPerformanceBudgets);
router.get('/retention-policy', requireAdmin, operationalMetricsController.getRetentionPolicy);
router.get('/retention-policy/preview', requireAdmin, operationalMetricsController.previewRetentionPolicy);
router.get('/retention-policy/revisions', requireAdmin, operationalMetricsController.listRetentionPolicyRevisions);
router.post('/retention-policy/revisions', requireAdmin, operationalMetricsController.requestRetentionPolicyUpdate);
router.post('/retention-policy/revisions/:id/actions', requireAdmin, operationalMetricsController.runRetentionPolicyRevisionAction);
router.post('/retention-policy/run', requireAdmin, operationalMetricsController.runRetentionPolicy);

// Check for stock splits manually
router.post('/stock-splits/check', requireAdmin, async (req, res, next) => {
  try {
    const { symbol, fromDate, toDate } = req.body;
    
    if (symbol) {
      // Check specific symbol
      const splits = await stockSplitService.checkSymbolForSplits(symbol, fromDate, toDate);
      res.json({ 
        message: `Checked ${symbol} for splits`,
        symbol,
        splits,
        count: splits.length
      });
    } else {
      // Check all open positions
      const result = await stockSplitService.checkForStockSplits();
      res.json({ 
        message: 'Stock split check completed',
        ...result
      });
    }
  } catch (error) {
    next(error);
  }
});

// Broker sync lease visibility across all users.
router.get('/broker-sync/leases', requireAdmin, async (req, res, next) => {
  try {
    const metrics = await BrokerConnection.getSyncLeaseMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
});

// Get stock split history
router.get('/stock-splits', requireAdmin, async (req, res, next) => {
  try {
    const { symbol, processed } = req.query;
    
    let query = 'SELECT * FROM stock_splits';
    const conditions = [];
    const values = [];
    
    if (symbol) {
      conditions.push(`symbol = $${values.length + 1}`);
      values.push(symbol);
    }
    
    if (processed !== undefined) {
      conditions.push(`processed = $${values.length + 1}`);
      values.push(processed === 'true');
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY split_date DESC, symbol';
    
    const db = require('../config/database');
    const result = await db.query(query, values);
    
    res.json({ splits: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get split adjustments for a specific trade
router.get('/trades/:tradeId/split-adjustments', requireAdmin, async (req, res, next) => {
  try {
    const { tradeId } = req.params;
    const adjustments = await StockSplit.getAdjustmentsForTrade(tradeId);
    res.json({ adjustments });
  } catch (error) {
    next(error);
  }
});

// Get stock split check log
router.get('/stock-splits/check-log', requireAdmin, async (req, res, next) => {
  try {
    const db = require('../config/database');
    const query = `
      SELECT * FROM stock_split_check_log
      ORDER BY last_checked_at DESC
      LIMIT 100
    `;

    const result = await db.query(query);
    res.json({ log: result.rows });
  } catch (error) {
    next(error);
  }
});

// Database health check - verifies critical column types
router.get('/database/health', requireAdmin, async (req, res, next) => {
  try {
    const db = require('../config/database');

    // Check critical numeric columns that have had precision issues
    const columnChecks = await db.query(`
      SELECT
        column_name,
        data_type,
        numeric_precision,
        numeric_scale,
        CASE
          WHEN column_name = 'strategy_confidence' AND numeric_precision < 5 THEN 'WARN: Should be DECIMAL(5,2) to hold percentage values (0-100)'
          WHEN column_name = 'pnl' AND numeric_precision < 20 THEN 'WARN: Should be NUMERIC(20,6) to handle large trade values'
          WHEN column_name = 'pnl_percent' AND numeric_precision < 15 THEN 'WARN: Should be NUMERIC(15,6) for accuracy'
          ELSE 'OK'
        END as status
      FROM information_schema.columns
      WHERE table_name = 'trades'
        AND column_name IN ('strategy_confidence', 'pnl', 'pnl_percent', 'entry_price', 'exit_price', 'quantity', 'commission')
      ORDER BY column_name
    `);

    // Count migrations run
    const migrationCount = await db.query(`
      SELECT COUNT(*) as count FROM migrations
    `);

    // Check for any columns with warnings
    const warnings = columnChecks.rows.filter(col => col.status !== 'OK');
    const hasIssues = warnings.length > 0;

    res.json({
      status: hasIssues ? 'warning' : 'healthy',
      migrationsRun: migrationCount.rows[0].count,
      columns: columnChecks.rows,
      warnings: warnings.length > 0 ? warnings : null,
      recommendations: hasIssues ? [
        'Run pending migrations to fix column precision issues',
        'Ensure migrations 058, 064 have been applied for numeric field fixes'
      ] : null
    });
  } catch (error) {
    next(error);
  }
});

// Get list of log files
router.get('/logs/files', requireAdmin, async (req, res, next) => {
  try {
    const { showAll = false, page = 1, limit = 10 } = req.query;
    const result = logger.getLogFiles(showAll === 'true', parseInt(page), parseInt(limit));
    res.json(result);
  } catch (error) {
    if (error.code === 'INVALID_LOG_FILENAME') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// Read a specific log file
router.get('/logs/files/:filename', requireAdmin, async (req, res, next) => {
  try {
    const { filename } = req.params;
    const { page = 1, limit = 100, showAll = false, search = '' } = req.query;

    const result = logger.readLogFile(
      filename,
      parseInt(page),
      parseInt(limit),
      showAll === 'true',
      search
    );

    if (!result) {
      return res.status(404).json({ error: 'Log file not found' });
    }

    res.json(result);
  } catch (error) {
    if (error.code === 'INVALID_LOG_FILENAME') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// Get recent logs (latest entries from today's app log)
router.get('/logs/recent', requireAdmin, async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const appLogFilename = `app_${today}.log`;

    const result = logger.readLogFile(appLogFilename, 1, parseInt(limit), false, '');

    if (!result) {
      return res.json({ content: '', pagination: { total: 0 } });
    }

    res.json(result);
  } catch (error) {
    if (error.code === 'INVALID_LOG_FILENAME') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
