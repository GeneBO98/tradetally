// Post-registration side effects shared by the web (/api/auth/register) and
// public API (/api/v1/auth/register) flows, so both entry points produce the
// same account state.
const User = require('../models/User');
const TierService = require('./tierService');
const SampleDataService = require('./sampleDataService');
const jobQueue = require('../utils/jobQueue');

function queueVerificationEmail(email, token) {
  setImmediate(async () => {
    try {
      await jobQueue.addJob('verification_email', { email, token }, 2);
    } catch (error) {
      console.warn('[WARNING] Failed to send verification email after registration:', error.message);
    }
  });
}

/**
 * For new users on billing-enabled instances: seed sample data and grant a
 * 14-day Pro trial. Both are best-effort and never block registration.
 * The first user is skipped - they're an admin and get Pro tier permanently.
 */
async function applyNewUserTrial(user, { host, isFirstUser }) {
  let billingEnabled = false;
  try {
    billingEnabled = await TierService.isBillingEnabled(host);
    console.log(`[REGISTER] Billing check: billingEnabled=${billingEnabled}, isFirstUser=${isFirstUser}`);
  } catch (billingErr) {
    console.log('[REGISTER] Billing status check failed (non-blocking):', billingErr.message);
  }

  if (!billingEnabled || isFirstUser) {
    console.log(`[REGISTER] Skipping sample data + trial: billingEnabled=${billingEnabled}, isFirstUser=${isFirstUser}`);
    return;
  }

  try {
    await SampleDataService.createForUser(user.id);
    console.log(`[REGISTER] Sample data created for new user ${user.username}`);
  } catch (sampleErr) {
    console.log('[REGISTER] Sample data creation failed (non-blocking):', sampleErr.message);
  }

  // Reason matches the manual /billing/start-trial flow ('Free 14-day trial')
  // so trialScheduler picks it up for reminder and expiration emails. A DB
  // trigger sets users.trial_used = true when a tier_override with reason
  // ILIKE '%trial%' is inserted.
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);
    await User.createTierOverride(user.id, 'pro', 'Free 14-day trial', expiresAt, null);
    await User.setProOnboardingStep(user.id, 1);
    console.log(`[REGISTER] 14-day Pro trial granted for new user ${user.username} (expires ${expiresAt.toISOString()})`);
  } catch (trialErr) {
    console.log('[REGISTER] Trial grant failed (non-blocking):', trialErr.message);
  }
}

module.exports = {
  queueVerificationEmail,
  applyNewUserTrial
};
