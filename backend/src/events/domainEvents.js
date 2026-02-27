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

module.exports = {
  publish,
  subscribe
};
