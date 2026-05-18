const { randomUUID } = require('crypto');
const logger = require('../utils/logger');
const {
  createRedisDuplicate,
  getRedisClient,
  getRedisNamespace,
  isRedisConfigured
} = require('./redisClient');

const instanceId = process.env.INSTANCE_ID || randomUUID();
let subscriber = null;
let subscribed = false;
let subscribePromise = null;
let localMessageHandler = null;

function getChannelName() {
  return `${getRedisNamespace()}:sse:notifications`;
}

function isFanoutEnabled() {
  return process.env.SSE_REDIS_FANOUT_ENABLED !== 'false' && isRedisConfigured();
}

async function startSseFanout(onMessage) {
  localMessageHandler = onMessage;
  if (!isFanoutEnabled()) {
    return getSseFanoutStatus();
  }

  if (subscribed || subscribePromise) {
    return subscribePromise || getSseFanoutStatus();
  }

  subscribePromise = createRedisDuplicate()
    .then(async (redis) => {
      if (!redis) {
        subscribePromise = null;
        return getSseFanoutStatus();
      }

      subscriber = redis;
      await subscriber.subscribe(getChannelName(), async (rawMessage) => {
        try {
          const payload = JSON.parse(rawMessage);
          if (!payload || payload.originInstanceId === instanceId) return;
          await localMessageHandler?.(payload);
        } catch (error) {
          logger.logError(`Failed to process Redis SSE fanout message: ${error.message}`);
        }
      });
      subscribed = true;
      return getSseFanoutStatus();
    })
    .catch((error) => {
      subscribePromise = null;
      logger.logError(`Failed to subscribe to Redis SSE fanout: ${error.message}`);
      return getSseFanoutStatus();
    });

  return subscribePromise;
}

async function publishSseNotification(userId, message) {
  if (!isFanoutEnabled()) {
    return false;
  }

  const redis = await getRedisClient();
  if (!redis?.isReady) {
    return false;
  }

  await redis.publish(getChannelName(), JSON.stringify({
    originInstanceId: instanceId,
    userId,
    message,
    publishedAt: new Date().toISOString()
  }));
  return true;
}

function getSseFanoutStatus() {
  return {
    configured: isRedisConfigured(),
    enabled: isFanoutEnabled(),
    subscribed,
    channel: getChannelName(),
    instanceId
  };
}

async function stopSseFanout() {
  const activeSubscriber = subscriber;
  subscriber = null;
  subscribed = false;
  subscribePromise = null;
  if (activeSubscriber?.isOpen) {
    await activeSubscriber.unsubscribe(getChannelName()).catch(() => {});
    await activeSubscriber.quit().catch(() => activeSubscriber.disconnect());
  }
}

module.exports = {
  getSseFanoutStatus,
  publishSseNotification,
  startSseFanout,
  stopSseFanout
};
