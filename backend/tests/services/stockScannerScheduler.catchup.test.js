jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
  validate: jest.fn(() => true)
}));
jest.mock('../../src/services/stockScannerService', () => ({
  needsRescan: jest.fn(),
  runNightlyScan: jest.fn()
}));

const cron = require('node-cron');
const StockScannerService = require('../../src/services/stockScannerService');
const scheduler = require('../../src/services/stockScannerScheduler');

describe('StockScannerScheduler catch-up scan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    scheduler.enabled = true;
    scheduler.stop();
  });

  test('schedules the quarterly scan plus a daily stale-scan check, without scanning at boot', async () => {
    StockScannerService.needsRescan.mockResolvedValueOnce({ needed: true, reason: 'too_old' });

    scheduler.initialize();
    await new Promise(resolve => setImmediate(resolve));

    const expressions = cron.schedule.mock.calls.map(call => call[0]);
    expect(expressions).toEqual(['0 3 1 1,4,7,10 *', '30 3 * * *']);
    expect(StockScannerService.needsRescan).toHaveBeenCalledTimes(1);
    expect(StockScannerService.runNightlyScan).not.toHaveBeenCalled();
    expect(scheduler.getStatus()).toMatchObject({ jobActive: true, catchUpJobActive: true });
  });

  test('daily check runs a Russell 2000 scan only when results are stale', async () => {
    StockScannerService.needsRescan.mockResolvedValueOnce({ needed: false, reason: null });
    await expect(scheduler.executeCatchUpScan()).resolves.toEqual({ ran: false, reason: null });
    expect(StockScannerService.runNightlyScan).not.toHaveBeenCalled();

    StockScannerService.needsRescan.mockResolvedValueOnce({ needed: true, reason: 'outdated_formula' });
    StockScannerService.runNightlyScan.mockResolvedValueOnce({ scanId: 8, status: 'completed' });
    await expect(scheduler.executeCatchUpScan()).resolves.toEqual({ ran: true, reason: 'outdated_formula' });
    expect(StockScannerService.runNightlyScan).toHaveBeenCalledWith({ russell2000Only: true });
  });

  test('daily check respects the enabled flag and swallows scan errors', async () => {
    scheduler.setEnabled(false);
    await expect(scheduler.executeCatchUpScan()).resolves.toEqual({ ran: false, reason: 'disabled' });
    expect(StockScannerService.needsRescan).not.toHaveBeenCalled();

    scheduler.setEnabled(true);
    StockScannerService.needsRescan.mockResolvedValueOnce({ needed: true, reason: 'no_completed_scan' });
    StockScannerService.runNightlyScan.mockRejectedValueOnce(new Error('Failed to fetch Russell 2000 stocks'));
    await expect(scheduler.executeCatchUpScan()).resolves.toEqual({ ran: false, reason: 'error' });
  });

  test('stop() tears down both jobs', () => {
    scheduler.initialize();
    const jobs = cron.schedule.mock.results.map(r => r.value);
    scheduler.stop();
    jobs.forEach(job => expect(job.stop).toHaveBeenCalled());
    expect(scheduler.getStatus()).toMatchObject({ jobActive: false, catchUpJobActive: false });
  });
});
