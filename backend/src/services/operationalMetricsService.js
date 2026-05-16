const db = require('../config/database');
const BrokerConnection = require('../models/BrokerConnection');
const ExecutionRun = require('../models/ExecutionRun');
const OperationalAlert = require('../models/OperationalAlert');
const AlertEscalationDeliveryService = require('./alertEscalationDeliveryService');
const ExecutionRetentionService = require('./executionRetentionService');
const { withSpan } = require('../utils/tracing');

function intValue(value) {
  return Number.parseInt(value || 0, 10);
}

function numberValue(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

class OperationalMetricsService {
  static async getSloDashboard() {
    const [
      apiLatency,
      clientErrorTotals,
      clientErrorsByContext,
      brokerSync,
      executionRunTotals,
      leases,
      retentionPolicy
    ] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::integer AS total_requests,
          COUNT(response_time_ms)::integer AS measured_requests,
          COALESCE(ROUND(AVG(response_time_ms))::integer, 0) AS avg_response_time_ms,
          COALESCE(ROUND(
            percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)
            FILTER (WHERE response_time_ms IS NOT NULL)
          )::integer, 0) AS p95_response_time_ms
        FROM user_activity_events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      db.query(`
        SELECT
          COUNT(*)::integer AS total_errors,
          COUNT(*) FILTER (
            WHERE context ILIKE '%chart%' OR COALESCE(component, '') ILIKE '%chart%'
          )::integer AS chart_errors
        FROM client_error_events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      db.query(`
        SELECT COALESCE(jsonb_object_agg(context, count), '{}'::jsonb) AS by_context
        FROM (
          SELECT context, COUNT(*)::integer AS count
          FROM client_error_events
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY context
          ORDER BY count DESC, context ASC
          LIMIT 20
        ) contexts
      `),
      db.query(`
        SELECT
          COUNT(*)::integer AS total_syncs,
          COUNT(*) FILTER (WHERE status = 'completed')::integer AS completed_syncs,
          COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed_syncs,
          COALESCE(ROUND(AVG(duration_ms))::integer, 0) AS avg_duration_ms,
          COALESCE(ROUND(
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
            FILTER (WHERE duration_ms IS NOT NULL)
          )::integer, 0) AS p95_duration_ms
        FROM broker_sync_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      db.query(`
        SELECT
          (SELECT COUNT(*)::integer FROM execution_runs WHERE created_at >= NOW() - INTERVAL '24 hours') AS total_runs,
          (SELECT COUNT(*)::integer FROM execution_runs WHERE created_at >= NOW() - INTERVAL '24 hours' AND status IN ('created', 'running', 'paused')) AS active_runs,
          (SELECT COUNT(*)::integer FROM execution_runs WHERE created_at >= NOW() - INTERVAL '24 hours' AND status = 'failed') AS failed_runs,
          COALESCE(jsonb_object_agg(mode, mode_count), '{}'::jsonb) AS by_mode
        FROM (
          SELECT mode, COUNT(*)::integer AS mode_count
          FROM execution_runs
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY mode
        ) mode_counts
      `),
      BrokerConnection.getSyncLeaseMetrics(),
      ExecutionRetentionService.getDefaultPolicy()
    ]);

    const apiRow = apiLatency.rows[0] || {};
    const clientErrorRow = clientErrorTotals.rows[0] || {};
    const brokerSyncRow = brokerSync.rows[0] || {};
    const executionRunRow = executionRunTotals.rows[0] || {};

    return {
      window: '24h',
      generatedAt: new Date().toISOString(),
      apiLatency: {
        totalRequests: intValue(apiRow.total_requests),
        measuredRequests: intValue(apiRow.measured_requests),
        avgResponseTimeMs: intValue(apiRow.avg_response_time_ms),
        p95ResponseTimeMs: intValue(apiRow.p95_response_time_ms)
      },
      clientErrors: {
        totalErrors: intValue(clientErrorRow.total_errors),
        chartErrors: intValue(clientErrorRow.chart_errors),
        byContext: clientErrorsByContext.rows[0]?.by_context || {}
      },
      brokerSync: {
        totalSyncs: intValue(brokerSyncRow.total_syncs),
        completedSyncs: intValue(brokerSyncRow.completed_syncs),
        failedSyncs: intValue(brokerSyncRow.failed_syncs),
        avgDurationMs: intValue(brokerSyncRow.avg_duration_ms),
        p95DurationMs: intValue(brokerSyncRow.p95_duration_ms)
      },
      executionRuns: {
        totalRuns: intValue(executionRunRow.total_runs),
        activeRuns: intValue(executionRunRow.active_runs),
        failedRuns: intValue(executionRunRow.failed_runs),
        byMode: executionRunRow.by_mode || {}
      },
      brokerSyncLeases: {
        ttlMinutes: leases.ttlMinutes,
        total: numberValue(leases.total),
        active: numberValue(leases.active),
        expired: numberValue(leases.expired)
      },
      retentionPolicy
    };
  }

  static async scanExpiredBrokerLeaseAlerts() {
    const metrics = await BrokerConnection.getSyncLeaseMetrics();
    const expiredLeases = metrics.leases.filter(lease => lease.isExpired);

    const alerts = await Promise.all(expiredLeases.map(lease => OperationalAlert.upsertActive({
      alertType: 'broker_sync_lease_expired',
      severity: 'critical',
      entityType: 'broker_connection',
      entityId: lease.id,
      message: `Broker sync lease expired for ${lease.brokerType} connection ${lease.accountLabel || lease.id}`,
      payload: {
        brokerType: lease.brokerType,
        accountLabel: lease.accountLabel,
        syncClaimedBy: lease.syncClaimedBy,
        leaseAgeSeconds: lease.leaseAgeSeconds,
        heartbeatAgeSeconds: lease.heartbeatAgeSeconds,
        ttlMinutes: metrics.ttlMinutes,
        lastSyncStatus: lease.lastSyncStatus,
        lastErrorMessage: lease.lastErrorMessage
      }
    })));

    const resolved = await OperationalAlert.resolveMissing(
      'broker_sync_lease_expired',
      'broker_connection',
      expiredLeases.map(lease => lease.id)
    );

    return {
      metrics,
      alerts,
      resolved
    };
  }

  static async scanReportAccessAnomalyAlerts(source = 'trade-management') {
    const settings = await ExecutionRun.getWorkflowSettings(source);
    const strategySettings = typeof ExecutionRun.listStrategyAnomalySettings === 'function'
      ? await ExecutionRun.listStrategyAnomalySettings({ source })
      : [];
    const strategySettingsByName = new Map(strategySettings.map(setting => [String(setting.strategy || '').toLowerCase(), setting]));
    const minThreshold = Math.min(
      settings.sharedReportAccessThreshold,
      ...strategySettings.map(setting => Number(setting.sharedReportAccessThreshold || settings.sharedReportAccessThreshold))
    );
    const maxWindowMinutes = Math.max(
      settings.sharedReportAccessWindowMinutes,
      ...strategySettings.map(setting => Number(setting.sharedReportAccessWindowMinutes || settings.sharedReportAccessWindowMinutes))
    );
    const result = await db.query(
      `
        SELECT
          era.run_id,
          er.name,
          er.mode,
          er.source,
          COALESCE(NULLIF(er.config->>'strategy', ''), NULLIF(er.market_data_snapshot->>'strategy', ''), 'unclassified') AS strategy,
          COUNT(*)::integer AS access_count,
          MIN(era.created_at) AS first_access_at,
          MAX(era.created_at) AS last_access_at,
          COUNT(DISTINCT era.ip_address)::integer AS distinct_ip_count,
          COUNT(DISTINCT era.user_agent)::integer AS distinct_user_agent_count
        FROM execution_run_report_accesses era
        JOIN execution_runs er ON er.id = era.run_id
        WHERE era.access_type = 'shared'
          AND era.created_at >= NOW() - ($1::text || ' minutes')::interval
          AND ($3::text IS NULL OR er.source = $3)
        GROUP BY era.run_id, er.name, er.mode, er.source, strategy
        HAVING COUNT(*) >= $2
        ORDER BY access_count DESC, last_access_at DESC
        LIMIT 50
      `,
      [
        maxWindowMinutes,
        minThreshold,
        source || null
      ]
    );

    const candidates = result.rows.map(row => {
      const strategySetting = strategySettingsByName.get(String(row.strategy || '').toLowerCase());
      const threshold = Number(strategySetting?.sharedReportAccessThreshold || settings.sharedReportAccessThreshold);
      const windowMinutes = Number(strategySetting?.sharedReportAccessWindowMinutes || settings.sharedReportAccessWindowMinutes);
      return {
        runId: row.run_id,
        name: row.name,
        mode: row.mode,
        source: row.source,
        strategy: row.strategy,
        accessCount: row.access_count,
        threshold,
        windowMinutes,
        settingScope: strategySetting ? 'strategy' : 'source',
        firstAccessAt: row.first_access_at,
        lastAccessAt: row.last_access_at,
        distinctIpCount: row.distinct_ip_count,
        distinctUserAgentCount: row.distinct_user_agent_count
      };
    }).filter(candidate => candidate.accessCount >= candidate.threshold);

    const alerts = await Promise.all(candidates.map(candidate => OperationalAlert.upsertActive({
      alertType: 'execution_report_access_anomaly',
      severity: candidate.accessCount >= candidate.threshold * 2 ? 'critical' : 'warning',
      entityType: 'execution_run',
      entityId: candidate.runId,
      message: `Shared report for ${candidate.name || candidate.runId} was accessed ${candidate.accessCount} times in ${candidate.windowMinutes} minutes`,
      payload: {
        source: candidate.source,
        mode: candidate.mode,
        strategy: candidate.strategy,
        accessCount: candidate.accessCount,
        threshold: candidate.threshold,
        windowMinutes: candidate.windowMinutes,
        settingScope: candidate.settingScope,
        firstAccessAt: candidate.firstAccessAt,
        lastAccessAt: candidate.lastAccessAt,
        distinctIpCount: candidate.distinctIpCount,
        distinctUserAgentCount: candidate.distinctUserAgentCount
      }
    })));

    const resolved = await OperationalAlert.resolveMissing(
      'execution_report_access_anomaly',
      'execution_run',
      candidates.map(candidate => candidate.runId)
    );

    return {
      settings,
      strategySettings,
      alerts,
      resolved,
      candidates
    };
  }

  static async scanPerformanceBudgetBurnAlerts() {
    const budgets = typeof ExecutionRun.listPerformanceBudgets === 'function'
      ? await ExecutionRun.listPerformanceBudgets({ hours: 1 })
      : [];
    const breached = budgets.filter(budget => budget.isEnabled && budget.sampleCount > 0 && budget.status === 'breached');

    if (breached.length === 0) {
      const resolved = await OperationalAlert.resolveMissing(
        'performance_budget_burn_rate',
        'performance_budget',
        []
      );
      return { alerts: [], resolved, breached };
    }

    const alert = await OperationalAlert.upsertActive({
      alertType: 'performance_budget_burn_rate',
      severity: breached.some(budget => budget.p95DurationMs > budget.p95BudgetMs * 1.5) ? 'critical' : 'warning',
      entityType: 'performance_budget',
      entityId: '00000000-0000-0000-0000-000000000001',
      message: `${breached.length} endpoint performance budget${breached.length === 1 ? '' : 's'} breached in the last hour`,
      payload: {
        breached: breached.map(budget => ({
          endpointKey: budget.endpointKey,
          p95DurationMs: budget.p95DurationMs,
          p95BudgetMs: budget.p95BudgetMs,
          sampleCount: budget.sampleCount,
          dbQueryLatency: budget.dbQueryLatency || null
        }))
      }
    });

    return { alerts: [alert], resolved: [], breached };
  }

  static async scanEventChainTamperAlerts() {
    const violations = typeof ExecutionRun.findEventChainViolations === 'function'
      ? await ExecutionRun.findEventChainViolations({ limit: 250 })
      : [];

    const alerts = await Promise.all(violations.map(violation => OperationalAlert.upsertActive({
      alertType: 'execution_event_chain_tamper',
      severity: 'critical',
      entityType: 'execution_run',
      entityId: violation.runId,
      message: `Execution event chain verification failed for ${violation.name || violation.runId}`,
      payload: {
        mode: violation.mode,
        source: violation.source,
        eventCount: violation.eventCount,
        verification: violation.verification
      }
    })));

    const resolved = await OperationalAlert.resolveMissing(
      'execution_event_chain_tamper',
      'execution_run',
      violations.map(violation => violation.runId)
    );

    return { alerts, resolved, violations };
  }

  static async scanOperationalAlerts() {
    const [leaseResult, reportAccessResult, performanceBudgetBurn, eventChainTamper] = await withSpan('operational_alerts.scan', {
      'app.alert_scan.sources': 'broker_lease,report_access,performance_budget_burn,event_chain_tamper'
    }, () => Promise.all([
      this.scanExpiredBrokerLeaseAlerts(),
      this.scanReportAccessAnomalyAlerts('trade-management'),
      this.scanPerformanceBudgetBurnAlerts(),
      this.scanEventChainTamperAlerts()
    ]));
    const escalationDestinations = typeof OperationalAlert.listEscalationDestinations === 'function'
      ? await OperationalAlert.listEscalationDestinations({ enabled: 'true' })
      : [];
    const alerts = [...leaseResult.alerts, ...reportAccessResult.alerts, ...performanceBudgetBurn.alerts, ...eventChainTamper.alerts];
    const escalationDeliveries = await AlertEscalationDeliveryService.deliverAlerts(alerts, escalationDestinations);

    return {
      metrics: leaseResult.metrics,
      leaseAlerts: leaseResult.alerts,
      reportAccessAnomalies: reportAccessResult,
      performanceBudgetBurn,
      eventChainTamper,
      escalationDestinations,
      escalationDeliveries,
      alerts,
      resolved: [...leaseResult.resolved, ...reportAccessResult.resolved, ...performanceBudgetBurn.resolved, ...eventChainTamper.resolved]
    };
  }

  static async runAlertAction(alertId, action, actorUserId = null, options = {}) {
    const alert = await OperationalAlert.findById(alertId);
    if (!alert) {
      const error = new Error('Operational alert not found');
      error.status = 404;
      throw error;
    }

    if (action === 'release_lease') {
      if (alert.alertType !== 'broker_sync_lease_expired' || alert.entityType !== 'broker_connection') {
        const error = new Error('Release lease action is only valid for expired broker sync lease alerts');
        error.status = 400;
        throw error;
      }
      await BrokerConnection.releaseSyncClaim(alert.entityId);
      const resolved = await OperationalAlert.resolveById(alertId, {
        action,
        actorUserId,
        actedAt: new Date().toISOString()
      });
      const audit = await OperationalAlert.recordActionAudit(alert, {
        action,
        actorUserId,
        statusAfter: resolved?.status || null,
        payload: { resolvedAt: resolved?.resolvedAt || null }
      });
      return { alert: resolved, action, audit };
    }

    if (action === 'resolve') {
      const resolved = await OperationalAlert.resolveById(alertId, {
        action,
        actorUserId,
        actedAt: new Date().toISOString()
      });
      const audit = await OperationalAlert.recordActionAudit(alert, {
        action,
        actorUserId,
        statusAfter: resolved?.status || null,
        payload: { resolvedAt: resolved?.resolvedAt || null }
      });
      return { alert: resolved, action, audit };
    }

    if (action === 'acknowledge') {
      const acknowledged = await OperationalAlert.acknowledgeById(alertId, actorUserId);
      const audit = await OperationalAlert.recordActionAudit(alert, {
        action,
        actorUserId,
        statusAfter: acknowledged?.status || null,
        payload: { acknowledgedAt: acknowledged?.acknowledgedAt || null }
      });
      return { alert: acknowledged, action, audit };
    }

    if (action === 'suppress') {
      const suppressed = await OperationalAlert.suppressById(alertId, {
        actorUserId,
        minutes: options.minutes,
        reason: options.reason || null
      });
      let suppressionRule = null;
      if (options.recurrenceRule || options.recurrence_rule) {
        suppressionRule = await OperationalAlert.upsertSuppressionRule({
          alertType: alert.alertType,
          entityType: alert.entityType,
          entityId: alert.entityId,
          recurrenceRule: options.recurrenceRule || options.recurrence_rule,
          reason: options.reason || null,
          isEnabled: true
        }, actorUserId);
      }
      const audit = await OperationalAlert.recordActionAudit(alert, {
        action,
        actorUserId,
        statusAfter: suppressed?.status || null,
        payload: {
          suppressedUntil: suppressed?.suppressedUntil || null,
          reason: suppressed?.suppressionReason || null,
          suppressionRuleId: suppressionRule?.id || null
        }
      });
      return { alert: suppressed, action, audit, suppressionRule };
    }

    {
      const error = new Error('Unsupported alert action');
      error.status = 400;
      throw error;
    }
  }

  static async getPerformanceBudgets(options = {}) {
    return ExecutionRun.listPerformanceBudgets(options);
  }
}

module.exports = OperationalMetricsService;
