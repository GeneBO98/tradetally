let sdk = null;
let started = false;

function endpointFor(kind) {
  const root = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (kind === 'traces') return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || (root ? `${root.replace(/\/$/, '')}/v1/traces` : undefined);
  if (kind === 'metrics') return process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || (root ? `${root.replace(/\/$/, '')}/v1/metrics` : undefined);
  return root;
}

function shouldStart() {
  if (process.env.OTEL_SDK_DISABLED === 'true') return false;
  return process.env.ENABLE_OTEL_SDK === 'true' ||
    Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT);
}

function initializeOpenTelemetry() {
  if (started || !shouldStart()) return null;

  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
    const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
    const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

    const metricReader = endpointFor('metrics')
      ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: endpointFor('metrics') }),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || 60000)
      })
      : undefined;

    sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'tradetally-backend',
      traceExporter: endpointFor('traces') ? new OTLPTraceExporter({ url: endpointFor('traces') }) : undefined,
      metricReader,
      instrumentations: [
        new HttpInstrumentation(),
        new ExpressInstrumentation(),
        new PgInstrumentation()
      ]
    });

    const startResult = sdk.start();
    if (startResult?.catch) {
      startResult.catch(error => {
        console.warn('[OTEL] SDK start failed:', error.message);
      });
    }
    started = true;
    console.log('[OTEL] SDK initialized');
    return sdk;
  } catch (error) {
    console.warn('[OTEL] SDK unavailable:', error.message);
    return null;
  }
}

async function shutdownOpenTelemetry() {
  if (!sdk || !started) return;
  try {
    await sdk.shutdown();
  } catch (error) {
    console.warn('[OTEL] SDK shutdown failed:', error.message);
  } finally {
    sdk = null;
    started = false;
  }
}

module.exports = {
  initializeOpenTelemetry,
  shutdownOpenTelemetry
};
