const fs = require('fs');
const csv = require('csv-parser');

// Simplified test to verify REF # grouping logic
async function testTOSParser() {
  const transactions = [];

  // Read CSV
  return new Promise((resolve, reject) => {
    fs.createReadStream('/Users/brennonoverton/Downloads/TOS-AccountStatement.csv')
      .pipe(csv())
      .on('data', (row) => {
        const type = row.TYPE || row.Type || '';

        // Only process TRD (trade) rows
        if (type !== 'TRD') {
          return;
        }

        const description = row.DESCRIPTION || row.Description || '';
        const date = row.DATE || row.Date || '';
        const time = row.TIME || row.Time || '';
        const refNum = row['REF #'] || row['Ref #'] || row.REF || '';

        // Parse trade details from description
        const tradeMatch = description.match(/(BOT|SOLD)\s+([\+\-]?[\d,]+)\s+(\S+)\s+@([\d.]+)/);
        if (!tradeMatch) {
          return;
        }

        const [_, action, quantityStr, symbol, priceStr] = tradeMatch;
        const quantity = Math.abs(parseFloat(quantityStr.replace(/,/g, '')));
        const price = parseFloat(priceStr);

        transactions.push({
          symbol,
          action: action.toLowerCase() === 'bot' ? 'buy' : 'sell',
          quantity,
          price,
          refNum,
          datetime: `${date} ${time}`
        });
      })
      .on('end', () => {
        console.log(`\n[INFO] Parsed ${transactions.length} transactions`);

        // Group by REF #
        const transactionsByRef = {};
        for (const transaction of transactions) {
          if (transaction.refNum) {
            if (!transactionsByRef[transaction.refNum]) {
              transactionsByRef[transaction.refNum] = [];
            }
            transactionsByRef[transaction.refNum].push(transaction);
          }
        }

        // Show grouping results
        console.log('\n[INFO] REF # Grouping Analysis:');
        console.log('='.repeat(80));

        let totalMerged = 0;
        for (const refNum in transactionsByRef) {
          const refTransactions = transactionsByRef[refNum];

          if (refTransactions.length > 1) {
            totalMerged++;
            console.log(`\nREF # ${refNum} (${refTransactions.length} rows):`);

            let totalQuantity = 0;
            let totalValue = 0;

            refTransactions.forEach((tx, i) => {
              console.log(`  ${i + 1}. ${tx.action.toUpperCase()} ${tx.quantity} ${tx.symbol} @ $${tx.price}`);
              totalQuantity += tx.quantity;
              totalValue += tx.quantity * tx.price;
            });

            const avgPrice = totalValue / totalQuantity;
            console.log(`  → MERGED: ${refTransactions[0].action.toUpperCase()} ${totalQuantity} ${refTransactions[0].symbol} @ $${avgPrice.toFixed(4)}`);
          }
        }

        console.log('\n' + '='.repeat(80));
        console.log(`[SUCCESS] Found ${totalMerged} REF #s with multiple rows that will be merged`);
        console.log(`[SUCCESS] Total unique REF #s: ${Object.keys(transactionsByRef).length}`);

        resolve();
      })
      .on('error', reject);
  });
}

testTOSParser().catch(console.error);
