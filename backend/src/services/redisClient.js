const { createClient } = require('redis');
const logger = require('../utils/logger');

let client = null;
let clientPromise = null;
let lastError = null;

function getRedisUrl() {
  return process.env.REDIS_URL || '';
}

function getRedisNamespace() {
  return process.env.REDIS_NAMESPACE || 'tradetally';
}

function isRedisConfigured() {
  return Boolean(getRedisUrl()) && process.env.REDIS_ENABLED !== 'false';
}

function createRedisClient() {
  return createClient({
    url: getRedisUrl(),
    disableOfflineQueue: true,
    socket: {
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
      reconnectStrategy: false
    }
  });
}

async function getRedisClient() {
  if (!isRedisConfigured()) {
    return null;
  }

  if (client?.isReady) {
    return client;
  }

  if (!clientPromise) {
    client = createRedisClient();
    client.on('error', (error) => {
      lastError = error;
      logger.logError(`Redis client error: ${error.message}`);
    });
    clientPromise = client.connect()
      .then(() => client)
      .catch((error) => {
        lastError = error;
        clientPromise = null;
        logger.logError(`Redis connection failed: ${error.message}`);
        return null;
      });
  }

  return clientPromise;
}

async function createRedisDuplicate() {
  const baseClient = await getRedisClient();
  if (!baseClient) {
    return null;
  }

  const duplicate = baseClient.duplicate();
  duplicate.on('error', (error) => {
    lastError = error;
    logger.logError(`Redis duplicate client error: ${error.message}`);
  });
  await duplicate.connect();
  return duplicate;
}

async function getRedisHealth() {
  if (!isRedisConfigured()) {
    return {
      configured: false,
      status: 'not_configured',
      namespace: getRedisNamespace()
    };
  }

  const startedAt = Date.now();
  const redis = await getRedisClient();
  if (!redis?.isReady) {
    return {
      configured: true,
      status: 'down',
      namespace: getRedisNamespace(),
      error: lastError?.message || 'Redis client is not ready'
    };
  }

  try {
    const pong = await redis.ping();
    return {
      configured: true,
      status: pong === 'PONG' ? 'ok' : 'degraded',
      namespace: getRedisNamespace(),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    lastError = error;
    return {
      configured: true,
      status: 'down',
      namespace: getRedisNamespace(),
      error: error.message
    };
  }
}

async function closeRedisClient() {
  const closingClient = client;
  client = null;
  clientPromise = null;
  if (closingClient?.isOpen) {
    await closingClient.quit().catch(() => closingClient.disconnect());
  }
}

module.exports = {
  closeRedisClient,
  createRedisDuplicate,
  getRedisClient,
  getRedisHealth,
  getRedisNamespace,
  isRedisConfigured
};
