/**
 * Trigger R-Value calculation for a specific trade
 * This simulates an update to trigger the calculation logic
 */
const Trade = require('./src/models/Trade');
const db = require('./src/config/database');

const tradeId = '1d652fad-d7af-4d21-9ce2-4dc5df2f1731';

(async () => {
  try {
    console.log('[START] Triggering R-Value calculation for trade:', tradeId);

    // Get the current trade
    const result = await db.query('SELECT * FROM trades WHERE id = $1', [tradeId]);
    const trade = result.rows[0];

    if (!trade) {
      console.error('[ERROR] Trade not found');
      process.exit(1);
    }

    console.log('[INFO] Trade found:', trade.symbol, trade.side);
    console.log('[INFO] Entry:', trade.entry_price, 'Exit:', trade.exit_price);
    console.log('[INFO] Current R-Value:', trade.r_value || 'NULL');
    console.log('[INFO] Executions:', trade.executions ? trade.executions.length : 0);

    // Check executions for stopLoss
    if (trade.executions && trade.executions.length > 0) {
      const withStopLoss = trade.executions.filter(ex => ex.stopLoss);
      console.log('[INFO] Executions with stopLoss:', withStopLoss.length);

      if (withStopLoss.length > 0) {
        console.log('[INFO] First stopLoss value:', withStopLoss[0].stopLoss);
      }
    }

    // Trigger an update by passing the executions back
    // This will run through the R-Value calculation logic
    console.log('\n[PROCESS] Triggering Trade.update() with executions...');
    const updatedTrade = await Trade.update(tradeId, trade.user_id, {
      executions: trade.executions  // Pass executions to trigger calculation
    });

    console.log('\n[RESULT] Update complete!');
    console.log('[RESULT] R-Value:', updatedTrade.r_value || 'NULL');

    if (updatedTrade.r_value) {
      console.log('[SUCCESS] R-Value calculated:', updatedTrade.r_value.toFixed(3) + 'R');
    } else {
      console.log('[WARNING] R-Value is still NULL');
      console.log('[WARNING] Check logs above for calculation errors');
    }

    process.exit(0);
  } catch (error) {
    console.error('[ERROR]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
