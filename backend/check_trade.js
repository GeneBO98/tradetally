const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'tradetally',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

(async () => {
  try {
    const tradeId = 'e0873dd1-fecf-4e7a-a346-d87ad4254ed2';
    const result = await db.query(`
      SELECT 
        id, symbol, side, quantity, 
        entry_price, exit_price, pnl, 
        commission, fees, 
        instrument_type, contract_size, 
        executions,
        notes
      FROM trades 
      WHERE id = $1
    `, [tradeId]);
    
    if (result.rows.length === 0) {
      console.log('Trade not found');
      process.exit(1);
    }
    
    const trade = result.rows[0];
    console.log('Trade Data:');
    console.log(JSON.stringify(trade, null, 2));
    
    // Calculate expected P&L
    const Trade = require('./src/models/Trade');
    const expectedPnL = Trade.calculatePnL(
      parseFloat(trade.entry_price),
      parseFloat(trade.exit_price),
      parseFloat(trade.quantity),
      trade.side,
      parseFloat(trade.commission || 0),
      parseFloat(trade.fees || 0),
      trade.instrument_type || 'stock',
      trade.contract_size || 1,
      null
    );
    
    console.log('\nP&L Analysis:');
    console.log(`Current P&L in DB: ${trade.pnl}`);
    console.log(`Expected P&L: ${expectedPnL}`);
    console.log(`Difference: ${(parseFloat(trade.pnl) - expectedPnL).toFixed(4)}`);
    
    // Check if it's a grouped trade
    if (trade.executions && Array.isArray(trade.executions)) {
      console.log(`\nExecutions count: ${trade.executions.length}`);
      let totalPnlFromExecutions = 0;
      trade.executions.forEach((exec, idx) => {
        if (exec.pnl !== undefined) {
          totalPnlFromExecutions += parseFloat(exec.pnl || 0);
          console.log(`Execution ${idx + 1} P&L: ${exec.pnl}`);
        }
      });
      console.log(`Sum of execution P&L: ${totalPnlFromExecutions}`);
    }
    
    await db.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

