# OpenTelemetry Exporter Examples

The backend already wraps execution report, retention, alert scan, and request-performance paths with OpenTelemetry spans/log context. Use these examples to point staging or production at an OTLP collector without changing application code.
Database query timings are also emitted as `db.query.duration_ms` histograms with `app.endpoint_key` and normalized `db.query_label` attributes, matching the performance-budget dashboard rollups.
`backend/src/otel-bootstrap.js` installs the Node SDK when `ENABLE_OTEL_SDK=true` or any OTLP endpoint is configured, wiring HTTP, Express, PostgreSQL, trace export, and metric export before the app imports routes.

## Backend environment

```bash
OTEL_SERVICE_NAME=tradetally-backend
ENABLE_OTEL_SDK=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://otel-collector:4318/v1/logs
OTEL_METRIC_EXPORT_INTERVAL_MS=60000
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=staging,service.namespace=tradetally
```

For production, set `deployment.environment=production` and route the collector to your managed destination. Keep API keys in the deployment secret store, not in this file.

## Staging collector

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 256

exporters:
  logging:
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
```

## Production collector

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  batch:
    timeout: 3s
    send_batch_size: 512
  resource:
    attributes:
      - key: service.namespace
        value: tradetally
        action: upsert

exporters:
  otlphttp:
    endpoint: ${OTEL_VENDOR_ENDPOINT}
    headers:
      api-key: ${OTEL_VENDOR_API_KEY}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
```
