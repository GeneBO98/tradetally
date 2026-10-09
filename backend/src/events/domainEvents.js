const { EventEmitter } = require('events');
const crypto = require('crypto');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

function createEventId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function subscribe(eventType, handler) {
  emitter.on(eventType, handler);
  return () => emitter.off(eventType, handler);
}

async function publish(eventType, payload = {}, metadata = {}) {
  const event = {
    id: createEventId(),
    type: eventType,
    occurredAt: new Date().toISOString(),
    payload,
    metadata
  };

  const listeners = [
    ...emitter.listeners(eventType),
    ...emitter.listeners('*')
  ];

  await Promise.allSettled(
    listeners.map((listener) => Promise.resolve().then(() => listener(event)))
  );

  return event;
}

// Fire-and-forget publish for request handlers and jobs: listeners (webhook
// delivery included) must never delay or fail the work that raised the event.
function publishInBackground(eventType, payload = {}, metadata = {}) {
  publish(eventType, payload, metadata).catch((error) => {
    console.error(`[WEBHOOK-EVENT] Failed to publish ${eventType}:`, error.message);
  });
}

module.exports = {
  publish,
  publishInBackground,
  subscribe
};
