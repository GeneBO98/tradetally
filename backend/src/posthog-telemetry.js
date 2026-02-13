const logger = require('./utils/logger');
const os = require('os');
const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { SeverityNumber } = require('@opentelemetry/api-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');

let otelLogger = null;
let loggerProvider = null;
let isInitialized = false;

const SERVER_ID = `${os.hostname()}-${process.pid}-${Date.now()}`;

// Map log level strings to OpenTelemetry SeverityNumber
const SEVERITY_MAP = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

// Minimum log level to send (default: warn)
// Set POSTHOG_LOG_LEVEL=info or =debug to capture more
const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel() {
  const envLevel = (process.env.POSTHOG_LOG_LEVEL || 'warn').toLowerCase();
  return LEVEL_PRIORITY[envLevel] ?? LEVEL_PRIORITY.warn;
}

async function initializePostHogTelemetry() {
  try {
    const posthogKey = process.env.VITE_POSTHOG_KEY || process.env.POSTHOG_KEY;
    const posthogHost = process.env.VITE_POSTHOG_HOST || process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!posthogKey) {
      logger.info('PostHog telemetry disabled - no API key configured', 'telemetry');
      return;
    }

    const endpoint = `${posthogHost}/i/v1/logs`;

    const exporter = new OTLPLogExporter({
      url: endpoint,
      headers: {
        'Authorization': `Bearer ${posthogKey}`,
      },
    });

    loggerProvider = new LoggerProvider({
      resource: resourceFromAttributes({
        'service.name': 'tradetally-backend',
        'service.version': process.env.npm_package_version || 'unknown',
        'host.name': os.hostname(),
        'process.pid': process.pid,
        'deployment.environment': process.env.NODE_ENV || 'development',
        'server.id': SERVER_ID,
      }),
      processors: [new BatchLogRecordProcessor(exporter)],
    });

    otelLogger = loggerProvider.getLogger('tradetally-backend');

    isInitialized = true;

    // Hook into the existing logger
    hookIntoLogger();

    logger.info(`PostHog OpenTelemetry logs initialized (endpoint: ${endpoint})`, 'telemetry');
  } catch (error) {
    console.error('Failed to initialize PostHog telemetry:', error);
  }
}

function hookIntoLogger() {
  const originalMethods = {};
  ['error', 'warn', 'info', 'debug'].forEach(method => {
    if (logger[method] && typeof logger[method] === 'function') {
      originalMethods[method] = logger[method].bind(logger);
    }
  });

  // Preserve original signature: error(message, error, type)
  logger.error = function(message, error, type) {
    originalMethods.error && originalMethods.error(message, error, type);
    emitLog('error', message, type || 'general', error);
  };

  // Preserve original signature: warn(message, type)
  logger.warn = function(message, type) {
    originalMethods.warn && originalMethods.warn(message, type);
    emitLog('warn', message, type);
  };

  // Preserve original signature: info(message, type)
  logger.info = function(message, type) {
    originalMethods.info && originalMethods.info(message, type);
    emitLog('info', message, type);
  };

  // Preserve original signature: debug(message, type)
  logger.debug = function(message, type) {
    originalMethods.debug && originalMethods.debug(message, type);
    emitLog('debug', message, type);
  };
}

function emitLog(level, message, category = 'general', errorObj = null) {
  if (!isInitialized || !otelLogger) return;

  // Filter by minimum log level
  const levelNum = LEVEL_PRIORITY[level] ?? 0;
  if (levelNum < getMinLevel()) return;

  const attributes = {
    'log.category': typeof category === 'string' ? category : 'general',
    'server.id': SERVER_ID,
    'host.name': os.hostname(),
    'process.pid': process.pid,
  };

  if (errorObj && errorObj instanceof Error) {
    attributes['error.message'] = errorObj.message;
    attributes['error.stack'] = errorObj.stack;
    attributes['error.type'] = errorObj.constructor.name;
  }

  const body = typeof message === 'object' ? JSON.stringify(message) : String(message);

  otelLogger.emit({
    severityNumber: SEVERITY_MAP[level] || SeverityNumber.INFO,
    severityText: level,
    body,
    attributes,
  });
}

async function shutdown() {
  if (!isInitialized || !loggerProvider) return;

  try {
    await loggerProvider.shutdown();
    isInitialized = false;
    console.log('PostHog telemetry shut down successfully');
  } catch (error) {
    console.error('Error shutting down PostHog telemetry:', error);
  }
}

module.exports = {
  initializePostHogTelemetry,
  shutdown,
};
