const { parseCSV } = require('./src/utils/csvParser');
const fs = require('fs');

async function test() {
  const csvPath = '/Users/brennonoverton/Downloads/TradeTally-Imports/Consol.2.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  console.log('=== Testing IBKR CSV Parsing with Conid ===\n');

  try {
    const result = await parseCSV(csvContent, {
      broker: 'ibkr',
      userId: 1
    });

    console.log('\n=== RESULTS ===');
    console.log('Total trades created:', result.length);

    // Show some trades with their details
    console.log('\nFirst 10 trades:');
    result.slice(0, 10).forEach((trade, i) => {
      const execCount = trade.executionData?.length || trade.executions?.length || 0;
      console.log(`${i+1}. ${trade.symbol} (${trade.side}): ${trade.quantity} @ $${trade.entryPrice?.toFixed(2) || 'N/A'} -> $${trade.exitPrice?.toFixed(2) || 'OPEN'} | P&L: $${trade.pnl?.toFixed(2) || 'N/A'} | Conid: ${trade.conid || 'N/A'} | Execs: ${execCount}`);
    });

    // Check if any trades have Conid
    const tradesWithConid = result.filter(t => t.conid);
    console.log(`\nTrades with Conid: ${tradesWithConid.length} / ${result.length}`);

    // Group by underlying to see if options are parsed correctly
    const byUnderlying = {};
    result.forEach(t => {
      const underlying = t.underlyingSymbol || t.symbol;
      if (byUnderlying[underlying] === undefined) byUnderlying[underlying] = [];
      byUnderlying[underlying].push(t);
    });
    console.log(`Unique underlyings: ${Object.keys(byUnderlying).length}`);

    // Show completed trades (non-null exitPrice)
    const completedTrades = result.filter(t => t.exitPrice !== null);
    console.log(`Completed trades: ${completedTrades.length}`);
    const openTrades = result.filter(t => t.exitPrice === null);
    console.log(`Open trades: ${openTrades.length}`);

    // Count total executions
    const totalExecs = result.reduce((sum, t) => sum + (t.executionData?.length || t.executions?.length || 0), 0);
    console.log(`Total executions across all trades: ${totalExecs}`);

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

test();
