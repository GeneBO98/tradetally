const OperationalAlert = require('../models/OperationalAlert');
const HttpSecurityEvent = require('../models/HttpSecurityEvent');
const ExecutionRun = require('../models/ExecutionRun');
const Account = require('../models/Account');
const ExecutionRetentionService = require('../services/executionRetentionService');
const OperationalMetricsService = require('../services/operationalMetricsService');
const AlertEscalationDeliveryService = require('../services/alertEscalationDeliveryService');
const { getRedisHealth } = require('../services/redisClient');
const { reportToPdf, reportToPdfVisualSnapshot } = require('../utils/executionRunReportFormatters');
const { withRequestMetricsContext } = require('../utils/requestMetricsContext');

async function trackEndpoint(endpointKey, req, res, callback) {
  const startedAt = Date.now();
  try {
    return await withRequestMetricsContext({ endpointKey }, callback);
  } finally {
    const durationMs = Date.now() - startedAt;
    setImmediate(() => {
      ExecutionRun.recordPerformanceMeasurement(endpointKey, durationMs, {
        requestId: req.requestId,
        statusCode: res.statusCode
      }).catch(error => {
        console.error('[PERFORMANCE_BUDGET] record failed:', error.message);
      });
    });
  }
}

function sampleReportForTemplate(template) {
  return {
    generatedAt: new Date().toISOString(),
    template: template.templateKey,
    templateConfig: template,
    watermark: template.shareDefaults?.watermark || 'Preview',
    recipient: template.shareDefaults?.recipient || 'Preview Recipient',
    provenanceHash: 'preview-provenance-hash',
    eventChain: { valid: true, lastEventHash: 'preview-event-hash', checkedEventCount: 3 },
    run: {
      id: 'preview-run',
      userId: 'preview-user',
      userEmail: 'preview@example.com',
      mode: 'backtest',
      status: 'completed',
      source: 'trade-management',
      config: { strategy: 'ORB', accountId: 'SIM-001' },
      metrics: { totalR: 3.2, expectancy: 0.42, winRate: 0.58, maxDrawdownR: -1.1 },
      confidence: { totalR: { count: 24, intervals: { p95: { lower: 1.2, upper: 4.8 } } } },
      parentRunId: 'preview-replay',
      lineageType: 'backtest_of',
      marketDataSnapshotId: 'preview-snapshot',
      marketDataSnapshot: { symbol: 'AAPL', strategy: 'ORB', accountId: 'SIM-001' },
      shareScope: template.shareDefaults || {},
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      endedAt: new Date().toISOString()
    },
    events: [
      { eventType: 'run.created', payload: { mode: 'backtest' }, createdAt: new Date().toISOString() },
      { eventType: 'analysis.filters_changed', payload: { symbol: 'AAPL' }, createdAt: new Date().toISOString() },
      { eventType: 'run.status_changed', payload: { to: 'completed' }, createdAt: new Date().toISOString() }
    ],
    reportAccesses: [],
    shareAudits: [],
    summary: {
      mode: 'backtest',
      status: 'completed',
      source: 'trade-management',
      metrics: { totalR: 3.2, expectancy: 0.42 },
      confidence: {},
      eventCount: 3,
      provenanceHash: 'preview-provenance-hash',
      eventChain: { valid: true, lastEventHash: 'preview-event-hash', checkedEventCount: 3 }
    }
  };
}

const operationalMetricsController = {
  async getSlo(req, res, next) {
    try {
      await trackEndpoint('admin.observability.slo', req, res, async () => {
        const slo = await OperationalMetricsService.getSloDashboard();
        res.json({ slo });
      });
    } catch (error) {
      next(error);
    }
  },

  async scanAlerts(req, res, next) {
    try {
      await trackEndpoint('admin.alerts.scan', req, res, async () => {
        const result = await OperationalMetricsService.scanOperationalAlerts();
        res.json({
          success: true,
          metrics: result.metrics,
          leaseAlerts: result.leaseAlerts,
          reportAccessAnomalies: result.reportAccessAnomalies,
          performanceBudgetBurn: result.performanceBudgetBurn,
          eventChainTamper: result.eventChainTamper,
          escalationDestinations: result.escalationDestinations,
          escalationDeliveries: result.escalationDeliveries,
          alerts: result.alerts,
          resolved: result.resolved
        });
      });
    } catch (error) {
      next(error);
    }
  },

  async listAlerts(req, res, next) {
    try {
      const alerts = await OperationalAlert.list(req.query || {});
      res.json({ alerts });
    } catch (error) {
      next(error);
    }
  },

  async listAlertActionAudits(req, res, next) {
    try {
      const audits = await OperationalAlert.listActionAudits(req.query || {});
      res.json({ audits });
    } catch (error) {
      next(error);
    }
  },

  async runAlertAction(req, res, next) {
    try {
      const result = await OperationalMetricsService.runAlertAction(
        req.params.id,
        req.body?.action || 'resolve',
        req.user?.id || null,
        req.body || {}
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listWorkflowSettings(req, res, next) {
    try {
      const settings = await ExecutionRun.listWorkflowSettings();
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  },

  async updateWorkflowSettings(req, res, next) {
    try {
      const settings = await ExecutionRun.updateWorkflowSettings(req.params.source || 'default', req.body || {});
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  },

  async requestWorkflowSettingsUpdate(req, res, next) {
    try {
      const revision = await ExecutionRun.requestWorkflowSettingsUpdate(
        req.params.source || req.body?.source || 'default',
        req.body || {},
        req.user?.id || null
      );
      res.status(201).json({ success: true, revision });
    } catch (error) {
      next(error);
    }
  },

  async listWorkflowSettingRevisions(req, res, next) {
    try {
      const revisions = await ExecutionRun.listWorkflowSettingRevisions(req.query || {});
      res.json({ revisions });
    } catch (error) {
      next(error);
    }
  },

  async runWorkflowSettingRevisionAction(req, res, next) {
    try {
      const result = await ExecutionRun.runWorkflowSettingRevisionAction(
        req.params.id,
        req.body?.action || 'approve',
        req.user?.id || null
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listStrategyAnomalySettings(req, res, next) {
    try {
      const settings = await ExecutionRun.listStrategyAnomalySettings(req.query || {});
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  },

  async upsertStrategyAnomalySettings(req, res, next) {
    try {
      const settings = await ExecutionRun.upsertStrategyAnomalySettings(
        req.body?.source || req.query?.source || 'trade-management',
        req.body?.strategy || req.query?.strategy,
        req.body || {}
      );
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  },

  async listAlertSuppressionRules(req, res, next) {
    try {
      const rules = await OperationalAlert.listSuppressionRules(req.query || {});
      res.json({ rules });
    } catch (error) {
      next(error);
    }
  },

  async upsertAlertSuppressionRule(req, res, next) {
    try {
      const rule = await OperationalAlert.upsertSuppressionRule(req.body || {}, req.user?.id || null);
      res.status(201).json({ success: true, rule });
    } catch (error) {
      next(error);
    }
  },

  async listAlertEscalationDestinations(req, res, next) {
    try {
      const destinations = await OperationalAlert.listEscalationDestinations(req.query || {});
      res.json({ destinations });
    } catch (error) {
      next(error);
    }
  },

  async upsertAlertEscalationDestination(req, res, next) {
    try {
      const destination = await OperationalAlert.upsertEscalationDestination(req.body || {}, req.user?.id || null);
      res.status(201).json({ success: true, destination });
    } catch (error) {
      next(error);
    }
  },

  async runAlertEscalationDestinationAction(req, res, next) {
    try {
      const action = req.body?.action;
      const payload = {
        reason: req.body?.reason,
        actorUserId: req.user?.id || null
      };
      let destination;
      if (action === 'enable') {
        destination = await OperationalAlert.setEscalationDestinationEnabled(req.params.id, true, payload);
      } else if (action === 'disable') {
        destination = await OperationalAlert.setEscalationDestinationEnabled(req.params.id, false, payload);
      } else if (action === 'delete') {
        destination = await OperationalAlert.deleteEscalationDestination(req.params.id, payload);
      } else {
        const error = new Error('Escalation destination action must be enable, disable, or delete');
        error.status = 400;
        throw error;
      }
      res.json({ success: true, destination });
    } catch (error) {
      next(error);
    }
  },

  async listAlertEscalationDestinationRequests(req, res, next) {
    try {
      const requests = await OperationalAlert.listEscalationDestinationChangeRequests(req.query || {});
      res.json({ requests });
    } catch (error) {
      next(error);
    }
  },

  async requestAlertEscalationDestinationAction(req, res, next) {
    try {
      const request = await OperationalAlert.requestEscalationDestinationChange(req.body || {}, req.user?.id || null);
      res.status(201).json({ success: true, request });
    } catch (error) {
      next(error);
    }
  },

  async runAlertEscalationDestinationRequestAction(req, res, next) {
    try {
      const result = await OperationalAlert.runEscalationDestinationChangeRequestAction(
        req.params.id,
        req.body?.action || 'approve',
        req.user?.id || null
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listAlertEscalationDestinationAudits(req, res, next) {
    try {
      const audits = await OperationalAlert.listEscalationDestinationAudits(req.query || {});
      res.json({ audits });
    } catch (error) {
      next(error);
    }
  },

  async listAlertEscalationDeliveries(req, res, next) {
    try {
      const deliveries = await OperationalAlert.listEscalationDeliveries(req.query || {});
      res.json({ deliveries });
    } catch (error) {
      next(error);
    }
  },

  async retryAlertEscalationDelivery(req, res, next) {
    try {
      const delivery = await AlertEscalationDeliveryService.retryDelivery(req.params.id, req.user?.id || null);
      res.json({ success: true, delivery });
    } catch (error) {
      next(error);
    }
  },

  async listAlertEscalationDeliveryReplayRequests(req, res, next) {
    try {
      const requests = await OperationalAlert.listEscalationDeliveryReplayRequests(req.query || {});
      res.json({ requests });
    } catch (error) {
      next(error);
    }
  },

  async requestAlertEscalationDeliveryReplay(req, res, next) {
    try {
      const request = await OperationalAlert.requestEscalationDeliveryReplay(
        req.params.id,
        req.body || {},
        req.user?.id || null
      );
      res.status(201).json({ success: true, request });
    } catch (error) {
      next(error);
    }
  },

  async runAlertEscalationDeliveryReplayRequestAction(req, res, next) {
    try {
      const action = req.body?.action || 'approve';
      if (action === 'reject') {
        const request = await OperationalAlert.rejectEscalationDeliveryReplayRequest(
          req.params.id,
          req.user?.id || null,
          req.body?.reviewNote || req.body?.reason || null
        );
        res.json({ success: true, request, delivery: null });
        return;
      }
      if (action !== 'approve') {
        const error = new Error('Dead-letter replay request action must be approve or reject');
        error.status = 400;
        throw error;
      }

      const request = await OperationalAlert.getPendingEscalationDeliveryReplayRequestForReview(
        req.params.id,
        req.user?.id || null
      );
      const delivery = await AlertEscalationDeliveryService.retryDelivery(request.deliveryId, req.user?.id || null);
      const applied = await OperationalAlert.markEscalationDeliveryReplayRequestApplied(
        request.id,
        req.user?.id || null,
        delivery?.id || null,
        req.body?.reviewNote || req.body?.reason || null
      );
      res.json({ success: true, request: applied, delivery });
    } catch (error) {
      next(error);
    }
  },

  async listImportAccountReconciliations(req, res, next) {
    try {
      const reconciliations = await Account.listImportReconciliationsForAdmin(req.query || {});
      res.json({ reconciliations });
    } catch (error) {
      next(error);
    }
  },

  async runImportAccountReconciliationAction(req, res, next) {
    try {
      const reconciliation = await Account.runImportReconciliationAction(
        req.params.id,
        req.body?.action || 'ignore',
        req.body || {},
        req.user?.id || null
      );
      res.json({ success: true, reconciliation });
    } catch (error) {
      next(error);
    }
  },

  async runImportAccountReconciliationBulkAction(req, res, next) {
    try {
      const result = await Account.runBulkImportReconciliationAction(req.body || {}, req.user?.id || null);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listImportAccountReconciliationAudits(req, res, next) {
    try {
      const audits = await Account.listImportReconciliationAudits(req.query || {});
      res.json({ audits });
    } catch (error) {
      next(error);
    }
  },

  async rollbackImportAccountReconciliationAudit(req, res, next) {
    try {
      const result = await Account.rollbackImportReconciliationAudit(
        req.params.id,
        req.user?.id || null,
        req.body?.reason || null
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listReportTemplates(req, res, next) {
    try {
      const templates = await ExecutionRun.listReportTemplates(req.query || {});
      res.json({ templates });
    } catch (error) {
      next(error);
    }
  },

  async listReportTemplateRevisions(req, res, next) {
    try {
      const revisions = await ExecutionRun.listReportTemplateRevisions(req.query || {});
      res.json({ revisions });
    } catch (error) {
      next(error);
    }
  },

  async requestReportTemplateUpdate(req, res, next) {
    try {
      const revision = await ExecutionRun.requestReportTemplateUpdate(
        req.params.templateKey || req.body?.templateKey || req.body?.template_key || 'trader',
        req.body || {},
        req.user?.id || null
      );
      res.status(201).json({ success: true, revision });
    } catch (error) {
      next(error);
    }
  },

  async runReportTemplateRevisionAction(req, res, next) {
    try {
      const result = await ExecutionRun.runReportTemplateRevisionAction(
        req.params.id,
        req.body?.action || 'approve',
        req.user?.id || null
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async upsertReportTemplate(req, res, next) {
    try {
      const template = await ExecutionRun.upsertReportTemplate(
        req.params.templateKey || req.body?.templateKey || req.body?.template_key || 'trader',
        req.body || {},
        req.user?.id || null
      );
      res.status(201).json({ success: true, template });
    } catch (error) {
      next(error);
    }
  },

  async previewReportTemplate(req, res, next) {
    try {
      const validation = ExecutionRun.validateReportTemplateDraft(
        req.params.templateKey || req.body?.templateKey || req.body?.template_key || 'trader',
        req.body || {}
      );
      const visualSnapshot = validation.valid
        ? reportToPdfVisualSnapshot(sampleReportForTemplate(validation.template))
        : [];
      const pdfBuffer = validation.valid
        ? reportToPdf(sampleReportForTemplate(validation.template))
        : null;
      res.json({
        success: true,
        validation,
        visualSnapshot,
        pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null
      });
    } catch (error) {
      next(error);
    }
  },

  async backfillExecutionEventHashes(req, res, next) {
    try {
      await trackEndpoint('admin.execution_events.backfill_hashes', req, res, async () => {
        const result = await ExecutionRun.backfillEventHashes(req.body || {});
        res.json({ success: true, ...result });
      });
    } catch (error) {
      next(error);
    }
  },

  async listPerformanceBudgets(req, res, next) {
    try {
      const budgets = await OperationalMetricsService.getPerformanceBudgets(req.query || {});
      res.json({ budgets });
    } catch (error) {
      next(error);
    }
  },

  async listHttpSecurityEvents(req, res, next) {
    try {
      const events = await HttpSecurityEvent.list(req.query || {});
      res.json({ events });
    } catch (error) {
      next(error);
    }
  },

  async getRedisHealth(req, res, next) {
    try {
      const redis = await getRedisHealth();
      res.json({ redis });
    } catch (error) {
      next(error);
    }
  },

  async getRetentionPolicy(req, res, next) {
    try {
      await trackEndpoint('admin.retention', req, res, async () => {
        const policy = await ExecutionRetentionService.getDefaultPolicy();
        res.json({ policy });
      });
    } catch (error) {
      next(error);
    }
  },

  async previewRetentionPolicy(req, res, next) {
    try {
      const result = await ExecutionRetentionService.previewDefaultPolicy();
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async runRetentionPolicy(req, res, next) {
    try {
      const result = await ExecutionRetentionService.runDefaultPolicy();
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async requestRetentionPolicyUpdate(req, res, next) {
    try {
      const revision = await ExecutionRetentionService.requestDefaultPolicyUpdate(req.body || {}, req.user?.id || null);
      res.status(201).json({ success: true, revision });
    } catch (error) {
      next(error);
    }
  },

  async listRetentionPolicyRevisions(req, res, next) {
    try {
      const revisions = await ExecutionRetentionService.listPolicyRevisions(req.query || {});
      res.json({ revisions });
    } catch (error) {
      next(error);
    }
  },

  async runRetentionPolicyRevisionAction(req, res, next) {
    try {
      const result = await ExecutionRetentionService.runRevisionAction(
        req.params.id,
        req.body?.action || 'approve',
        req.user?.id || null
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = operationalMetricsController;
