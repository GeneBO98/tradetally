const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function withRequestMetricsContext(context, callback) {
  return storage.run(context || {}, callback);
}

function getRequestMetricsContext() {
  return storage.getStore() || {};
}

module.exports = {
  getRequestMetricsContext,
  withRequestMetricsContext
};
