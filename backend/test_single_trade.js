const db = require('./src/config/database');

function calculateRValue(entryPrice, stopLoss, exitPrice, side) {
  if (!entryPrice || !stopLoss || !exitPrice || !side) {
    return null;
  }

  const initialRisk = side === 'long'
    ? Math.abs(entryPrice - stopLoss)
    : Math.abs(stopLoss - entryPrice);

  if (initialRisk === 0) return null;

  const actualPnl = side === 'long'
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;

  return actualPnl / initialRisk;
}

(async () => {
  try {
    const tradeId = '1d652fad-d7af-4d21-9ce2-4dc5df2f1731';
    const result = await db.query('SELECT id, symbol, side, entry_price, exit_price, stop_loss, executions, r_value FROM trades WHERE id = $1', [tradeId]);
    const trade = result.rows[0];

    console.log('[TEST] Trade:', trade.id, trade.symbol);
    console.log('[TEST] Current R-Value:', trade.r_value || 'NULL');
    console.log('[TEST] Current stop_loss field:', trade.stop_loss || 'NULL');
    console.log('[TEST] Executions count:', trade.executions ? trade.executions.length : 0);

    if (trade.executions && trade.executions.length > 0) {
      const executionsWithStopLoss = trade.executions.filter(ex => ex.stopLoss !== null && ex.stopLoss !== undefined);
      console.log('[TEST] Executions with stopLoss:', executionsWithStopLoss.length);

      if (executionsWithStopLoss.length > 0) {
        const totalQty = executionsWithStopLoss.reduce((sum, ex) => sum + (ex.quantity || 0), 0);
        console.log('[TEST] Total quantity:', totalQty);

        const weightedEntry = executionsWithStopLoss.reduce((sum, ex) =>
          sum + ((ex.entryPrice || 0) * (ex.quantity || 0)), 0) / totalQty;
        const weightedStopLoss = executionsWithStopLoss.reduce((sum, ex) =>
          sum + ((ex.stopLoss || 0) * (ex.quantity || 0)), 0) / totalQty;
        const weightedExit = executionsWithStopLoss.reduce((sum, ex) =>
          sum + ((ex.exitPrice || 0) * (ex.quantity || 0)), 0) / totalQty;

        console.log('[TEST] Weighted Entry:', weightedEntry.toFixed(2));
        console.log('[TEST] Weighted Stop Loss:', weightedStopLoss.toFixed(2));
        console.log('[TEST] Weighted Exit:', weightedExit.toFixed(2));
        console.log('[TEST] Side:', trade.side);

        const rValue = calculateRValue(weightedEntry, weightedStopLoss, weightedExit, trade.side);
        console.log('[TEST] Calculated R-Value:', rValue ? rValue.toFixed(3) + 'R' : 'NULL');

        if (rValue !== null) {
          await db.query('UPDATE trades SET r_value = $1 WHERE id = $2', [rValue, tradeId]);
          console.log('[SUCCESS] Updated R-Value in database to:', rValue.toFixed(3) + 'R');

          // Verify the update
          const verifyResult = await db.query('SELECT r_value FROM trades WHERE id = $1', [tradeId]);
          console.log('[VERIFY] R-Value now in database:', verifyResult.rows[0].r_value);
        }
      } else {
        console.log('[INFO] No executions with stopLoss found');
      }
    } else {
      console.log('[INFO] No executions found');
    }

    process.exit(0);
  } catch (error) {
    console.error('[ERROR]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
