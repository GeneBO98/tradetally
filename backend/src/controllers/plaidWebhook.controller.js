const PlaidConnection = require('../models/PlaidConnection');
const plaidFundingService = require('../services/plaid/plaidFundingService');
const plaidWebhookVerifier = require('../services/plaid/plaidWebhookVerifier');

// Webhooks can burst (e.g. one per account on initial sync); only one sync
// per connection runs at a time.
const inFlightSyncs = new Set();

const SYNC_TRIGGER_CODES = new Set([
  'TRANSACTIONS:SYNC_UPDATES_AVAILABLE',
  'TRANSACTIONS:DEFAULT_UPDATE',
  'TRANSACTIONS:INITIAL_UPDATE',
  'TRANSACTIONS:HISTORICAL_UPDATE',
  'INVESTMENTS_TRANSACTIONS:DEFAULT_UPDATE',
  'HOLDINGS:DEFAULT_UPDATE'
]);

async function triggerSync(connection) {
  if (inFlightSyncs.has(connection.id)) {
    return;
  }

  inFlightSyncs.add(connection.id);
  try {
    await plaidFundingService.syncConnection(connection.id, { userId: connection.userId });
    console.log(`[INFO] [PLAID] Webhook-triggered sync completed for connection ${connection.id}`);
  } catch (error) {
    console.error(`[ERROR] [PLAID] Webhook-triggered sync failed for connection ${connection.id}:`, error.message);
  } finally {
    inFlightSyncs.delete(connection.id);
  }
}

async function handleItemEvent(connection, payload) {
  const code = payload.webhook_code;

  if (code === 'ERROR') {
    const errorCode = payload.error?.error_code || null;
    if (errorCode === 'ITEM_LOGIN_REQUIRED') {
      await PlaidConnection.setConnectionStatus(
        connection.id,
        'reauth_required',
        'Institution login expired. Reconnect the account to resume syncing.'
      );
    } else {
      await PlaidConnection.setConnectionStatus(
        connection.id,
        'error',
        payload.error?.error_message || `Plaid item error${errorCode ? ` (${errorCode})` : ''}`
      );
    }
    return;
  }

  if (code === 'PENDING_EXPIRATION' || code === 'PENDING_DISCONNECT') {
    await PlaidConnection.setConnectionStatus(
      connection.id,
      'reauth_required',
      'Institution access is expiring. Reconnect the account to keep syncing.'
    );
    return;
  }

  if (code === 'LOGIN_REPAIRED') {
    await PlaidConnection.setConnectionStatus(connection.id, 'active');
    return;
  }

  if (code === 'USER_PERMISSION_REVOKED' || code === 'USER_ACCOUNT_REVOKED') {
    await PlaidConnection.setConnectionStatus(
      connection.id,
      'revoked',
      'Access was revoked at the institution.'
    );
    return;
  }

  console.log(`[INFO] [PLAID] Ignoring ITEM webhook code ${code}`);
}

async function processWebhook(payload) {
  const itemId = payload.item_id;
  if (!itemId) {
    console.log(`[INFO] [PLAID] Webhook without item_id (${payload.webhook_type}:${payload.webhook_code}), ignoring`);
    return;
  }

  const connection = await PlaidConnection.findByItemId(itemId);
  if (!connection) {
    console.log('[INFO] [PLAID] Webhook for unknown item, ignoring');
    return;
  }

  await PlaidConnection.markWebhookReceived(connection.id);

  const type = payload.webhook_type;
  const code = payload.webhook_code;

  if (type === 'ITEM') {
    await handleItemEvent(connection, payload);
    return;
  }

  if (SYNC_TRIGGER_CODES.has(`${type}:${code}`)) {
    await triggerSync(connection);
    return;
  }

  console.log(`[INFO] [PLAID] Ignoring webhook ${type}:${code}`);
}

const plaidWebhookController = {
  async handleWebhook(req, res) {
    const rawBody = req.body;
    const verified = await plaidWebhookVerifier.verify(rawBody, req.headers['plaid-verification']);

    if (!verified) {
      console.error('[ERROR] [PLAID] Rejected webhook with invalid verification');
      return res.status(401).json({ received: false });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
      return res.status(400).json({ received: false });
    }

    // Acknowledge immediately; Plaid retries slow or non-2xx deliveries.
    res.status(200).json({ received: true });

    setImmediate(() => {
      processWebhook(payload).catch(error => {
        console.error('[ERROR] [PLAID] Webhook processing failed:', error.message);
      });
    });
  }
};

module.exports = plaidWebhookController;
module.exports._processWebhook = processWebhook;
