jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/imageProcessor', () => ({}));
jest.mock('../../src/utils/logger', () => ({ logImport: jest.fn(), logWarn: jest.fn(), logError: jest.fn() }));
jest.mock('../../src/models/User', () => ({ getSettings: jest.fn().mockResolvedValue({ timezone: 'UTC' }) }));
jest.mock('../../src/services/tierService', () => ({ canImportTrades: jest.fn().mockResolvedValue({ allowed: true, tier: 'pro' }) }));
jest.mock('../../src/services/feeProfileService', () => ({ getImportFeeConfiguration: jest.fn() }));
jest.mock('../../src/utils/csvParser', () => ({
  parseCSV: jest.fn().mockResolvedValue({ trades: [{ symbol: 'MESU6', broker: 'sierrachart', accountIdentifier: 'SIM', quantity: 1, entryPrice: 100, exitPrice: 101, entryTime: '2026-09-17T14:00:00Z', exitTime: '2026-09-17T14:01:00Z', commission: 0, fees: 0, pnl: 5 }], diagnostics: { totalRows: 2, skippedRows: 0, invalidRows: 0, detectedBroker: 'sierrachart', warnings: [] } }),
  getCsvHeaderLine: jest.fn().mockReturnValue('Symbol'),
  getCsvSampleRows: jest.fn().mockReturnValue('MESU6')
}));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(async trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));
jest.mock('../../src/services/brokerFeeApplicationService', () => ({
  getBrokerLookupNames: jest.fn().mockReturnValue({ brokersToLookup: ['sierrachart'], expandedBrokersToLookup: ['sierrachart'] }),
  applyBrokerFeeSettingsToTrades: jest.fn(() => { throw new Error('stop after fee configuration'); })
}));

const controller = require('../../src/controllers/trade.controller');
const FeeProfileService = require('../../src/services/feeProfileService');
const currencyConverter = require('../../src/utils/currencyConverter');
const { parseCSV } = require('../../src/utils/csvParser');
const { applyBrokerFeeSettingsToTrades } = require('../../src/services/brokerFeeApplicationService');

test('the background CSV import loads and passes the account fee profile', async () => {
  const assignments = [{ account_identifier: 'SIM', fee_profile_id: 'profile' }];
  const feeRows = [{ profile_id: 'profile', broker: 'sierrachart', commission_per_contract: 0.91 }];
  FeeProfileService.getImportFeeConfiguration.mockResolvedValue({ assignments, feeRows });
  let runImport;
  const nextTick = jest.spyOn(process, 'nextTick').mockImplementationOnce(callback => { runImport = callback; });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  try {
    await controller.importTrades({ user: { id: 'user' }, headers: { 'content-type': 'multipart/form-data' }, body: { broker: 'auto' }, file: { originalname: 'trades.csv', buffer: Buffer.from('Symbol\nMESU6') } }, res, jest.fn());
  } finally {
    nextTick.mockRestore();
  }
  expect(res.status).toHaveBeenCalledWith(202);
  await runImport();
  expect(FeeProfileService.getImportFeeConfiguration).toHaveBeenCalledWith('user', ['SIM']);
  expect(applyBrokerFeeSettingsToTrades).toHaveBeenCalledWith(expect.objectContaining({ feeProfileAssignments: assignments, feeProfileRows: feeRows }));
});

test('the background import converts an inferred forex quote currency', async () => {
  parseCSV.mockResolvedValueOnce({
    trades: [{
      symbol: 'BLACKBULL:EURJPY',
      broker: 'tradingview',
      accountIdentifier: 'SIM',
      instrumentType: 'forex',
      originalCurrency: 'JPY',
      currencyConversionRequired: true,
      tradeDate: '2026-09-17',
      quantity: 100000,
      entryPrice: 160,
      exitPrice: 160.1,
      entryTime: '2026-09-17T14:00:00Z',
      exitTime: '2026-09-17T14:01:00Z',
      commission: 0,
      fees: 0,
      pnl: 10000
    }],
    diagnostics: { totalRows: 2, skippedRows: 0, invalidRows: 0, detectedBroker: 'tradingview', warnings: [] }
  });
  FeeProfileService.getImportFeeConfiguration.mockResolvedValue({ assignments: [], feeRows: [] });
  let runImport;
  const nextTick = jest.spyOn(process, 'nextTick').mockImplementationOnce(callback => { runImport = callback; });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  try {
    await controller.importTrades({ user: { id: 'user' }, headers: { 'content-type': 'multipart/form-data' }, body: { broker: 'auto' }, file: { originalname: 'forex.csv', buffer: Buffer.from('Symbol\nBLACKBULL:EURJPY') } }, res, jest.fn());
  } finally {
    nextTick.mockRestore();
  }
  expect(res.status).toHaveBeenCalledWith(202);
  await runImport();
  expect(currencyConverter.convertTradeToUSD).toHaveBeenCalledWith(
    expect.objectContaining({ symbol: 'BLACKBULL:EURJPY' }),
    'JPY',
    '2026-09-17'
  );
});
