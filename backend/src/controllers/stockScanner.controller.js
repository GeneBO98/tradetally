/**
 * Stock Scanner Controller
 * API endpoints for Russell 2000 8 Pillars scan results
 */

const StockScannerService = require('../services/stockScannerService');

/**
 * Get scan results with optional pillar filters
 * GET /api/scanner/results
 * Query params:
 *   - pillars: comma-separated pillar numbers that must pass (e.g., "1,3,5")
 *   - page: page number (default: 1)
 *   - limit: results per page (default: 50)
 *   - sortBy: column to sort by (default: pillars_passed)
 *   - sortOrder: ASC or DESC (default: DESC)
 * @access Pro tier
 */
const getScanResults = async (req, res) => {
  try {
    const {
      pillars,
      page = 1,
      limit = 50,
      sortBy = 'pillars_passed',
      sortOrder = 'DESC'
    } = req.query;

    // Parse pillars filter (comma-separated string to array of numbers)
    const pillarFilter = pillars
      ? pillars.split(',').map(p => parseInt(p.trim())).filter(p => p >= 1 && p <= 8)
      : [];

    const results = await StockScannerService.getScanResults({
      pillars: pillarFilter,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Cap at 100
      sortBy,
      sortOrder
    });

    res.json(results);
  } catch (error) {
    console.error('[SCANNER] Error getting results:', error);
    res.status(500).json({ error: error.message || 'Failed to get scan results' });
  }
};

/**
 * Get current scan status or latest scan info
 * GET /api/scanner/status
 * @access Authenticated
 */
const getScanStatus = async (req, res) => {
  try {
    const status = await StockScannerService.getScanStatus();
    res.json(status);
  } catch (error) {
    console.error('[SCANNER] Error getting status:', error);
    res.status(500).json({ error: error.message || 'Failed to get scan status' });
  }
};

/**
 * Manually trigger a scan (admin only)
 * POST /api/scanner/trigger
 * Body params (optional):
 *   - russell2000Only: boolean (default: true) - Scan only Russell 2000
 * @access Admin only
 */
const triggerScan = async (req, res) => {
  try {
    const { russell2000Only = true } = req.body;
    console.log(`[SCANNER] Admin ${req.user.id} triggered manual scan (Russell 2000 only: ${russell2000Only})`);

    // Start the scan asynchronously
    StockScannerService.runNightlyScan({ russell2000Only })
      .then(result => {
        console.log('[SCANNER] Manual scan completed:', result);
      })
      .catch(error => {
        console.error('[SCANNER] Manual scan failed:', error);
      });

    // Return immediately (scan runs in background)
    res.json({
      message: 'Scan started',
      status: 'running',
      russell2000Only,
      note: 'Scan is running in the background. Check status endpoint for progress.'
    });
  } catch (error) {
    console.error('[SCANNER] Error triggering scan:', error);
    res.status(500).json({ error: error.message || 'Failed to trigger scan' });
  }
};

/**
 * Clean up stuck scans (admin only)
 * POST /api/scanner/cleanup
 * @access Admin only
 */
const cleanupStuckScans = async (req, res) => {
  try {
    console.log(`[SCANNER] Admin ${req.user.id} triggered cleanup of stuck scans`);
    const cleanedUp = await StockScannerService.cleanupStuckScans();
    res.json({
      message: 'Cleanup completed',
      scansCleanedUp: cleanedUp
    });
  } catch (error) {
    console.error('[SCANNER] Error cleaning up stuck scans:', error);
    res.status(500).json({ error: error.message || 'Failed to clean up stuck scans' });
  }
};

module.exports = {
  getScanResults,
  getScanStatus,
  triggerScan,
  cleanupStuckScans
};
