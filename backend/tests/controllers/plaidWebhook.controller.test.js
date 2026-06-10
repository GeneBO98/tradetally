jest.mock('../../src/models/PlaidConnection', () => ({
  findByItemId: jest.fn(),
  setConnectionStatus: jest.fn(),
  markWebhookReceived: jest.fn()
}));

jest.mock('../../src/services/plaid/plaidFundingService', () => ({
  syncConnection: jest.fn()
}));

jest.mock('../../src/services/plaid/plaidWebhookVerifier', () => ({
  verify: jest.fn()
}));

const PlaidConnection = require('../../src/models/PlaidConnection');
const plaidFundingService = require('../../src/services/plaid/plaidFundingService');
const plaidWebhookVerifier = require('../../src/services/plaid/plaidWebhookVerifier');
const plaidWebhookController = require('../../src/controllers/plaidWebhook.controller');

const connection = { id: 'conn-1', userId: 'user-1' };

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function buildReq(payload) {
  return {
    body: Buffer.from(JSON.stringify(payload)),
    headers: { 'plaid-verification': 'jwt-header' }
  };
}

async function invoke(payload, { verified = true } = {}) {
  plaidWebhookVerifier.verify.mockResolvedValue(verified);
  const res = buildRes();
  await plaidWebhookController.handleWebhook(buildReq(payload), res);
  // processing is deferred via setImmediate
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return res;
}

describe('plaidWebhookController.handleWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PlaidConnection.findByItemId.mockResolvedValue(connection);
    PlaidConnection.setConnectionStatus.mockResolvedValue(connection);
    PlaidConnection.markWebhookReceived.mockResolvedValue();
    plaidFundingService.syncConnection.mockResolvedValue({ processedCount: 0 });
  });

  it('returns 401 when verification fails and does not process', async () => {
    const res = await invoke({ webhook_type: 'ITEM', webhook_code: 'ERROR', item_id: 'item-1' }, { verified: false });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(PlaidConnection.findByItemId).not.toHaveBeenCalled();
  });

  it('acknowledges with 200 and triggers a sync for SYNC_UPDATES_AVAILABLE', async () => {
    const res = await invoke({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-1' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(plaidFundingService.syncConnection).toHaveBeenCalledWith('conn-1', { userId: 'user-1' });
    expect(PlaidConnection.markWebhookReceived).toHaveBeenCalledWith('conn-1');
  });

  it('triggers a sync for investments and holdings updates', async () => {
    await invoke({ webhook_type: 'INVESTMENTS_TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE', item_id: 'item-1' });
    await invoke({ webhook_type: 'HOLDINGS', webhook_code: 'DEFAULT_UPDATE', item_id: 'item-1' });

    expect(plaidFundingService.syncConnection).toHaveBeenCalledTimes(2);
  });

  it('marks the connection reauth_required on ITEM_LOGIN_REQUIRED errors', async () => {
    await invoke({
      webhook_type: 'ITEM',
      webhook_code: 'ERROR',
      item_id: 'item-1',
      error: { error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'login required' }
    });

    expect(PlaidConnection.setConnectionStatus).toHaveBeenCalledWith('conn-1', 'reauth_required', expect.any(String));
    expect(plaidFundingService.syncConnection).not.toHaveBeenCalled();
  });

  it('marks the connection reauth_required on PENDING_EXPIRATION', async () => {
    await invoke({ webhook_type: 'ITEM', webhook_code: 'PENDING_EXPIRATION', item_id: 'item-1' });

    expect(PlaidConnection.setConnectionStatus).toHaveBeenCalledWith('conn-1', 'reauth_required', expect.any(String));
  });

  it('restores active status on LOGIN_REPAIRED', async () => {
    await invoke({ webhook_type: 'ITEM', webhook_code: 'LOGIN_REPAIRED', item_id: 'item-1' });

    expect(PlaidConnection.setConnectionStatus).toHaveBeenCalledWith('conn-1', 'active');
  });

  it('marks the connection revoked on USER_PERMISSION_REVOKED', async () => {
    await invoke({ webhook_type: 'ITEM', webhook_code: 'USER_PERMISSION_REVOKED', item_id: 'item-1' });

    expect(PlaidConnection.setConnectionStatus).toHaveBeenCalledWith('conn-1', 'revoked', expect.any(String));
  });

  it('ignores webhooks for unknown items', async () => {
    PlaidConnection.findByItemId.mockResolvedValue(null);
    const res = await invoke({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-x' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(plaidFundingService.syncConnection).not.toHaveBeenCalled();
  });

  it('ignores unknown webhook codes', async () => {
    const res = await invoke({ webhook_type: 'TRANSACTIONS', webhook_code: 'RECURRING_TRANSACTIONS_UPDATE', item_id: 'item-1' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(plaidFundingService.syncConnection).not.toHaveBeenCalled();
  });

  it('returns 400 for unparseable bodies', async () => {
    plaidWebhookVerifier.verify.mockResolvedValue(true);
    const res = buildRes();
    await plaidWebhookController.handleWebhook(
      { body: Buffer.from('not json'), headers: {} },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
