require('dotenv').config();

const AlertEscalationDeliveryService = require('../src/services/alertEscalationDeliveryService');

function destinationList() {
  const destinations = [];
  if (process.env.ALERT_SMOKE_EMAIL_TARGET) {
    destinations.push({
      id: null,
      destinationType: 'email',
      target: process.env.ALERT_SMOKE_EMAIL_TARGET,
      severity: 'info',
      isEnabled: true,
      metadata: { smoke: true }
    });
  }
  if (process.env.ALERT_SMOKE_SLACK_WEBHOOK_URL) {
    destinations.push({
      id: null,
      destinationType: 'slack',
      target: process.env.ALERT_SMOKE_SLACK_WEBHOOK_URL,
      severity: 'info',
      isEnabled: true,
      metadata: { smoke: true }
    });
  }
  if (process.env.ALERT_SMOKE_WEBHOOK_URL) {
    destinations.push({
      id: null,
      destinationType: 'webhook',
      target: process.env.ALERT_SMOKE_WEBHOOK_URL,
      severity: 'info',
      isEnabled: true,
      metadata: {
        smoke: true,
        headers: process.env.ALERT_SMOKE_WEBHOOK_AUTH_HEADER
          ? { Authorization: process.env.ALERT_SMOKE_WEBHOOK_AUTH_HEADER }
          : undefined
      }
    });
  }
  return destinations;
}

async function main() {
  const destinations = destinationList();
  const requiredTypes = (process.env.ALERT_SMOKE_REQUIRE_TYPES || '')
    .split(',')
    .map(type => type.trim())
    .filter(Boolean);
  if (destinations.length === 0) {
    if (process.env.ALERT_SMOKE_REQUIRE_DESTINATIONS === 'true') {
      throw new Error('No ALERT_SMOKE_* destination configured');
    }
    console.log(JSON.stringify({ skipped: true, reason: 'No ALERT_SMOKE_* destination configured' }));
    return;
  }

  const destinationTypes = new Set(destinations.map(destination => destination.destinationType));
  const missingTypes = requiredTypes.filter(type => !destinationTypes.has(type));
  if (missingTypes.length > 0) {
    throw new Error(`Missing required alert smoke destination types: ${missingTypes.join(', ')}`);
  }

  if (process.env.ALERT_ESCALATION_DELIVERY_ENABLED !== 'true' && process.env.ALERT_SMOKE_ALLOW_DRY_RUN !== 'true') {
    throw new Error('Set ALERT_ESCALATION_DELIVERY_ENABLED=true for real staging alert delivery smoke tests');
  }

  const alert = {
    id: null,
    alertType: 'staging_escalation_smoke_test',
    severity: 'info',
    status: 'active',
    entityType: 'deployment',
    entityId: null,
    message: `TradeTally alert escalation smoke test ${new Date().toISOString()}`,
    payload: {
      source: 'smoke-alert-escalations',
      commit: process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null
    }
  };
  const deliveries = await AlertEscalationDeliveryService.deliverAlerts([alert], destinations);
  const failed = deliveries.filter(delivery => delivery.status === 'failed');
  console.log(JSON.stringify({
    destinationCount: destinations.length,
    requiredTypes,
    deliveries: deliveries.map(delivery => ({
      destinationType: delivery.destinationType,
      status: delivery.status,
      dryRun: delivery.dryRun,
      responseStatus: delivery.responseStatus,
      errorMessage: delivery.errorMessage || null
    }))
  }, null, 2));
  if (failed.length > 0) {
    throw new Error(`Alert escalation smoke failed for ${failed.map(item => item.destinationType).join(', ')}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
