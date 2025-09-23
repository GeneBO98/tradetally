// Handle database connection more gracefully
let db, Trade;
try {
  db = require('./src/config/database');
  Trade = require('./src/models/Trade');
} catch (error) {
  console.error('[ERROR] Unable to load database configuration.');
  console.error('Please ensure your .env file is properly configured.');
  console.error('You can run the SQL script manually instead: fix-pnl-sql.sql');
  process.exit(1);
}

async function fixPnLCalculations() {
  console.log('[CONFIG] Starting P/L Calculation Fix');
  console.log('================================');
  
  try {
    // Find trades that might have incorrect P/L calculations
    // Focus on closed trades where P/L seems suspiciously low or where notes indicate partial close
    const query = `
      SELECT id, user_id, symbol, quantity, entry_price, exit_price, pnl, pnl_percent, 
             commission, fees, side, notes, created_at, updated_at
      FROM trades 
      WHERE exit_price IS NOT NULL 
        AND (
          notes ILIKE '%partial close%' 
          OR notes ILIKE '%closed existing position%'
          OR notes ILIKE '%updated existing position%'
          OR (ABS(pnl) < ABS((exit_price - entry_price) * quantity * 0.5)) -- P/L is less than 50% of expected
        )
      ORDER BY updated_at DESC
      LIMIT 50
    `;
    
    const result = await db.query(query);
    const trades = result.rows;
    
    console.log(`\nFound ${trades.length} potentially problematic trades`);
    
    if (trades.length === 0) {
      console.log('No trades found that need fixing.');
      return;
    }
    
    console.log('\nAnalyzing trades:');
    console.log('=================');
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const trade of trades) {
      console.log(`\n[STATS] Trade ${trade.id}:`);
      console.log(`   Symbol: ${trade.symbol}`);
      console.log(`   Quantity: ${trade.quantity}`);
      console.log(`   Entry: $${trade.entry_price}`);
      console.log(`   Exit: $${trade.exit_price}`);
      console.log(`   Current P/L: $${trade.pnl || 0}`);
      console.log(`   Notes: ${trade.notes || 'N/A'}`);
      
      // Calculate what P/L should be
      const expectedPnL = Trade.calculatePnL(
        parseFloat(trade.entry_price),
        parseFloat(trade.exit_price),
        parseInt(trade.quantity),
        trade.side,
        parseFloat(trade.commission || 0),
        parseFloat(trade.fees || 0)
      );
      
      const currentPnL = parseFloat(trade.pnl || 0);
      const difference = Math.abs(expectedPnL - currentPnL);
      
      console.log(`   Expected P/L: $${expectedPnL.toFixed(2)}`);
      console.log(`   Difference: $${difference.toFixed(2)}`);
      
      // If difference is significant (more than $1 or 10%), fix it
      if (difference > 1.00 || (Math.abs(currentPnL) > 0 && difference / Math.abs(currentPnL) > 0.1)) {
        console.log(`   [SUCCESS] FIXING: Significant difference detected`);
        
        try {
          // Calculate P/L percent
          const expectedPnLPercent = Trade.calculatePnLPercent(
            parseFloat(trade.entry_price),
            parseFloat(trade.exit_price),
            trade.side
          );
          
          // Update the trade
          await db.query(`
            UPDATE trades 
            SET pnl = $1, pnl_percent = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [expectedPnL, expectedPnLPercent, trade.id]);
          
          console.log(`   [INFO] Updated P/L: $${currentPnL.toFixed(2)} -> $${expectedPnL.toFixed(2)}`);
          console.log(`   [INFO] Updated P/L%: ${(trade.pnl_percent || 0).toFixed(2)}% -> ${expectedPnLPercent.toFixed(2)}%`);
          
          fixedCount++;
        } catch (error) {
          console.log(`   [ERROR] Error updating trade: ${error.message}`);
        }
      } else {
        console.log(`   [INFO] SKIPPING: Difference is within acceptable range`);
        skippedCount++;
      }
    }
    
    console.log('\n[ANALYTICS] Summary:');
    console.log('===========');
    console.log(`[SUCCESS] Fixed: ${fixedCount} trades`);
    console.log(`[INFO] Skipped: ${skippedCount} trades`);
    console.log(`[STATS] Total analyzed: ${trades.length} trades`);
    
    if (fixedCount > 0) {
      console.log('\n[SUCCESS] P/L calculations have been corrected!');
      console.log('The affected trades now show accurate profit/loss values.');
    }
    
  } catch (error) {
    console.error('[ERROR] Error fixing P/L calculations:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Also create a function to check a specific trade
async function checkSpecificTrade(tradeId) {
  console.log(`[CHECK] Checking specific trade: ${tradeId}`);
  console.log('==========================================');
  
  try {
    const result = await db.query('SELECT * FROM trades WHERE id = $1', [tradeId]);
    
    if (result.rows.length === 0) {
      console.log('[ERROR] Trade not found');
      return;
    }
    
    const trade = result.rows[0];
    
    console.log('\n[STATS] Trade Details:');
    console.log(`   ID: ${trade.id}`);
    console.log(`   Symbol: ${trade.symbol}`);
    console.log(`   Side: ${trade.side}`);
    console.log(`   Quantity: ${trade.quantity}`);
    console.log(`   Entry Price: $${trade.entry_price}`);
    console.log(`   Exit Price: $${trade.exit_price || 'N/A'}`);
    console.log(`   Current P/L: $${trade.pnl || 0}`);
    console.log(`   Current P/L%: ${trade.pnl_percent || 0}%`);
    console.log(`   Commission: $${trade.commission || 0}`);
    console.log(`   Fees: $${trade.fees || 0}`);
    console.log(`   Notes: ${trade.notes || 'N/A'}`);
    
    if (trade.exit_price) {
      const correctPnL = Trade.calculatePnL(
        parseFloat(trade.entry_price),
        parseFloat(trade.exit_price),
        parseInt(trade.quantity),
        trade.side,
        parseFloat(trade.commission || 0),
        parseFloat(trade.fees || 0)
      );
      
      const correctPnLPercent = Trade.calculatePnLPercent(
        parseFloat(trade.entry_price),
        parseFloat(trade.exit_price),
        trade.side
      );
      
      console.log('\n[CONFIG] Correct Calculations:');
      console.log(`   Correct P/L: $${correctPnL.toFixed(2)}`);
      console.log(`   Correct P/L%: ${correctPnLPercent.toFixed(2)}%`);
      
      const pnlDiff = Math.abs(correctPnL - (trade.pnl || 0));
      if (pnlDiff > 0.01) {
        console.log(`\n[ERROR] P/L is incorrect by $${pnlDiff.toFixed(2)}`);
        
        // Offer to fix it
        console.log('\n[CONFIG] Fixing this trade...');
        await db.query(`
          UPDATE trades 
          SET pnl = $1, pnl_percent = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [correctPnL, correctPnLPercent, trade.id]);
        
        console.log('[SUCCESS] Trade has been fixed!');
      } else {
        console.log('\n[SUCCESS] P/L calculation is correct');
      }
    } else {
      console.log('\n[CHECK] This is an open position - no P/L to check');
    }
    
  } catch (error) {
    console.error('[ERROR] Error checking trade:', error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] === 'check') {
    if (args.length < 2) {
      console.log('Usage: node fix-pnl-calculations.js check <trade-id>');
      process.exit(1);
    }
    await checkSpecificTrade(args[1]);
  } else {
    await fixPnLCalculations();
  }
  
  process.exit(0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { fixPnLCalculations, checkSpecificTrade };