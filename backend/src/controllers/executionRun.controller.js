const ExecutionRun = require('../models/ExecutionRun');
const { reportToCsv, reportToPdf } = require('../utils/executionRunReportFormatters');
const { withRequestMetricsContext } = require('../utils/requestMetricsContext');
const { withSpan } = require('../utils/tracing');

function reportFormat(req) {
  return ['csv', 'pdf'].includes(req.query.format) ? req.query.format : 'json';
}

async function recordReportAccess(req, run, accessType) {
  await ExecutionRun.recordReportAccess(run.id, {
    shareToken: accessType === 'shared' ? run.shareToken : null,
    userId: req.user?.id || null,
    accessType,
    format: reportFormat(req),
    requestId: req.requestId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null
  });
}

function reportWithScope(report, scope = {}) {
  const scoped = {
    ...report,
    run: { ...report.run },
    summary: { ...report.summary },
    events: Array.isArray(report.events) ? [...report.events] : [],
    reportAccesses: Array.isArray(report.reportAccesses) ? [...report.reportAccesses] : [],
    shareAudits: Array.isArray(report.shareAudits) ? [...report.shareAudits] : []
  };

  if (scope.includeEvents === false) {
    scoped.events = [];
    scoped.summary.eventCount = 0;
  }

  if (scope.includeMetrics === false) {
    scoped.run.metrics = {};
    scoped.run.confidence = {};
    scoped.summary.metrics = {};
    scoped.summary.confidence = {};
  }

  if (scope.includeReportAccesses !== true) {
    scoped.reportAccesses = [];
    scoped.shareAudits = [];
  }

  scoped.summary.shareScope = {
    formats: Array.isArray(scope.formats) ? scope.formats : ['json'],
    accountIds: Array.isArray(scope.accountIds) ? scope.accountIds : []
  };

  return scoped;
}

function assertShareFormatAllowed(scope, format) {
  const formats = Array.isArray(scope?.formats) ? scope.formats : ['json'];
  if (!formats.includes(format)) {
    const error = new Error(`Shared report link does not allow ${format.toUpperCase()} access`);
    error.status = 403;
    throw error;
  }
}

async function trackEndpoint(endpointKey, req, res, callback) {
    const startedAt = Date.now();
  try {
    return await withRequestMetricsContext({ endpointKey }, () => withSpan(`http.${endpointKey}`, {
      'app.endpoint_key': endpointKey,
      'http.method': req.method,
      'http.route': req.route?.path || req.path
    }, callback));
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

const executionRunController = {
  async list(req, res, next) {
    try {
      const runs = await ExecutionRun.findByUser(req.user.id, req.query);
      res.json({ runs });
    } catch (error) {
      next(error);
    }
  },

  async create(req, res, next) {
    try {
      const run = await ExecutionRun.create(req.user.id, req.body || {});
      res.status(201).json({ run });
    } catch (error) {
      next(error);
    }
  },

  async listAdmin(req, res, next) {
    try {
      await trackEndpoint('admin.execution_runs', req, res, async () => {
        const runs = await ExecutionRun.findAllForAdmin(req.query);
        res.json({ runs });
      });
    } catch (error) {
      next(error);
    }
  },

  async adminSummary(req, res, next) {
    try {
      const summary = await ExecutionRun.getAdminSummary();
      res.json({ summary });
    } catch (error) {
      next(error);
    }
  },

  async get(req, res, next) {
    try {
      const run = await ExecutionRun.findById(req.user.id, req.params.id);
      if (!run) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.json({ run });
    } catch (error) {
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const run = await ExecutionRun.update(req.user.id, req.params.id, req.body || {});
      if (!run) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.json({ run });
    } catch (error) {
      next(error);
    }
  },

  async compare(req, res, next) {
    try {
      await trackEndpoint('execution.compare', req, res, async () => {
        const comparison = await ExecutionRun.compareByModes(req.user.id, req.query || {});
        res.json({ comparison });
      });
    } catch (error) {
      next(error);
    }
  },

  async getReport(req, res, next) {
    try {
      await trackEndpoint('execution.report', req, res, async () => {
        const report = await withSpan('execution_run.report.build', {
          'execution_run.id': req.params.id,
          'execution_run.report.format': reportFormat(req),
          'execution_run.report.admin': Boolean(req.adminReport)
        }, () => ExecutionRun.getReport(req.user.id, req.params.id, {
          admin: Boolean(req.adminReport),
          template: req.query.template,
          watermark: req.query.watermark,
          recipient: req.query.recipient
        }));
        if (!report) {
          return res.status(404).json({ error: 'Execution run not found' });
        }
        await recordReportAccess(req, report.run, req.adminReport ? 'admin' : 'owner');

        if (req.query.format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="execution-run-${req.params.id}.csv"`);
          return res.send(reportToCsv(report));
        }

        if (req.query.format === 'pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="execution-run-${req.params.id}.pdf"`);
          return res.send(reportToPdf(report));
        }

        res.json({ report });
      });
    } catch (error) {
      next(error);
    }
  },

  async share(req, res, next) {
    try {
      const run = await ExecutionRun.share(req.user.id, req.params.id, req.body || {});
      if (!run) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.json({ run, shareUrl: `/api/execution-runs/shared/${run.shareToken}` });
    } catch (error) {
      next(error);
    }
  },

  async unshare(req, res, next) {
    try {
      const reason = req.body?.reason || req.query.reason || null;
      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'Revocation reason is required' });
      }
      const run = await ExecutionRun.unshare(req.user.id, req.params.id, {
        reason
      });
      if (!run) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.json({ run });
    } catch (error) {
      next(error);
    }
  },

  async listShareAudits(req, res, next) {
    try {
      const run = await ExecutionRun.findById(req.user.id, req.params.id);
      if (!run) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      const audits = await ExecutionRun.listShareAudits(req.params.id, req.query || {});
      res.json({ audits });
    } catch (error) {
      next(error);
    }
  },

  async listShareScopeAccounts(req, res, next) {
    try {
      const accountScope = await ExecutionRun.listShareScopeAccounts(req.user.id, req.params.id);
      if (!accountScope) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.json(accountScope);
    } catch (error) {
      next(error);
    }
  },

  async getShared(req, res, next) {
    try {
      const run = await ExecutionRun.findByShareToken(req.params.token);
      if (!run) {
        return res.status(404).json({ error: 'Shared execution run not found' });
      }
      const format = reportFormat(req);
      assertShareFormatAllowed(run.verifiedShareScope || run.shareScope, format);

      const report = reportWithScope(
        await withSpan('execution_run.report.shared', {
          'execution_run.id': run.id,
          'execution_run.report.format': format
        }, () => ExecutionRun.getReport(run.userId, run.id, {
          template: (run.verifiedShareScope || run.shareScope)?.template,
          watermark: (run.verifiedShareScope || run.shareScope)?.watermark,
          recipient: (run.verifiedShareScope || run.shareScope)?.recipient
        })),
        run.verifiedShareScope || run.shareScope
      );
      await recordReportAccess(req, run, 'shared');

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="execution-run-${run.id}.csv"`);
        return res.send(reportToCsv(report));
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="execution-run-${run.id}.pdf"`);
        return res.send(reportToPdf(report));
      }

      res.json({ report });
    } catch (error) {
      next(error);
    }
  },

  async appendEvent(req, res, next) {
    try {
      const { eventType, payload } = req.body || {};
      if (!eventType) {
        return res.status(400).json({ error: 'eventType is required' });
      }

      const event = await ExecutionRun.appendEvent(req.user.id, req.params.id, eventType, payload || {});
      if (!event) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  },

  async listEvents(req, res, next) {
    try {
      const events = await ExecutionRun.listEvents(req.user.id, req.params.id);
      if (!events) {
        return res.status(404).json({ error: 'Execution run not found' });
      }
      res.json({ events });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = executionRunController;
