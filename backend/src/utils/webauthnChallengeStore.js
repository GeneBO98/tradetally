/**
 * In-memory challenge store for WebAuthn registration/authentication flows.
 * Challenges expire after 60 seconds. Cleanup runs every 5 minutes.
 */

const challenges = new Map();
const TTL_MS = 60 * 1000; // 60 seconds
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function set(key, challenge) {
  challenges.set(key, {
    challenge,
    expires: Date.now() + TTL_MS
  });
}

function get(key) {
  const entry = challenges.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    challenges.delete(key);
    return null;
  }
  return entry.challenge;
}

function remove(key) {
  challenges.delete(key);
}

// Periodic cleanup of expired challenges
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (now > entry.expires) {
      challenges.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Prevent timer from keeping the process alive
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

module.exports = { set, get, remove };
