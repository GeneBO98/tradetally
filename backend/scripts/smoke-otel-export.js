#!/usr/bin/env node

const http = require('http');

async function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received.push({
        url: req.url,
        method: req.method,
        bytes: Buffer.concat(chunks).length,
        contentType: req.headers['content-type']
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  process.env.ENABLE_OTEL_SDK = 'true';
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${port}/v1/traces`;
  process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = `http://127.0.0.1:${port}/v1/metrics`;
  process.env.OTEL_METRIC_EXPORT_INTERVAL_MS = process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || '200';
  process.env.OTEL_BSP_SCHEDULE_DELAY = process.env.OTEL_BSP_SCHEDULE_DELAY || '100';
  process.env.OTEL_BSP_EXPORT_TIMEOUT = process.env.OTEL_BSP_EXPORT_TIMEOUT || '3000';
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'tradetally-otel-smoke';

  const { initializeOpenTelemetry, shutdownOpenTelemetry } = require('../src/otel-bootstrap');
  const { withSpan, recordHistogram } = require('../src/utils/tracing');

  try {
    initializeOpenTelemetry();
    await withSpan('smoke.otel_export', {
      'smoke.component': 'otel-exporter'
    }, async span => {
      span.setAttribute?.('smoke.result', 'ok');
      recordHistogram('smoke.otel.duration_ms', 12, { route: 'smoke' });
    });

    await shutdownOpenTelemetry();
    const sawTrace = await waitFor(() => received.some(item => item.url === '/v1/traces' && item.bytes > 0));
    if (!sawTrace) {
      throw new Error('OpenTelemetry smoke collector did not receive a trace export');
    }
    console.log(JSON.stringify({
      success: true,
      received
    }, null, 2));
  } finally {
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
