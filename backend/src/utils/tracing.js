let trace = null;
let metrics = null;
let SpanStatusCode = null;

try {
  ({ trace, metrics, SpanStatusCode } = require('@opentelemetry/api'));
} catch (error) {
  trace = null;
  metrics = null;
  SpanStatusCode = { ERROR: 2 };
}

const noopTracer = {
  startActiveSpan(_name, _options, callback) {
    return callback({
      setAttribute() {},
      recordException() {},
      setStatus() {},
      end() {}
    });
  }
};

function getTracer() {
  return trace?.getTracer ? trace.getTracer('trade-journal') : noopTracer;
}

const histogramCache = new Map();

function getMeter() {
  return metrics?.getMeter ? metrics.getMeter('trade-journal') : null;
}

function getHistogram(name, options = {}) {
  if (histogramCache.has(name)) return histogramCache.get(name);
  const meter = getMeter();
  const histogram = meter?.createHistogram
    ? meter.createHistogram(name, options)
    : { record() {} };
  histogramCache.set(name, histogram);
  return histogram;
}

function recordHistogram(name, value, attributes = {}, options = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  getHistogram(name, options).record(numericValue, attributes || {});
}

async function withSpan(name, attributes, callback) {
  return getTracer().startActiveSpan(name, { attributes: attributes || {} }, async (span) => {
    try {
      return await callback(span);
    } catch (error) {
      span.recordException?.(error);
      span.setStatus?.({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end?.();
    }
  });
}

module.exports = {
  withSpan,
  recordHistogram
};
