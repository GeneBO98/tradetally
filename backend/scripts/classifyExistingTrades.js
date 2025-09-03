#!/usr/bin/env node

/**
 * Batch processing script to classify existing trades with strategies
 * This script will analyze all trades that don't have strategy assignments
 * and automatically classify them using the enhanced classification system.
 */

const db = require('../src/config/database');
const Trade = require('../src/models/Trade');

class TradeClassificationBatch {
  constructor() {
    this.batchSize = 50; // Process trades in batches to manage memory and API limits
    this.apiCallDelay = 2000; // 2 second delay between API-heavy classifications
    this.processed = 0;
    this.classified = 0;
    this.errors = 0;
    this.apiCalls = 0;
    this.startTime = Date.now();
  }

  async run() {
    console.log('🚀 Starting batch classification of existing trades...');
    console.log(`📊 Processing in batches of ${this.batchSize} trades`);
    console.log(`⏱️  API delay: ${this.apiCallDelay}ms between technical analysis calls`);
    console.log('');

    try {
      // Get total count of trades needing classification
      const countResult = await db.query(`
        SELECT COUNT(*) as total_trades,
               COUNT(*) FILTER (WHERE strategy IS NULL OR strategy = '') as unclassified_trades,
               COUNT(*) FILTER (WHERE exit_price IS NOT NULL) as completed_trades
        FROM trades
      `);
      
      const { total_trades, unclassified_trades, completed_trades } = countResult.rows[0];
      
      console.log(`📈 Trade Statistics:`);
      console.log(`   Total trades: ${total_trades}`);
      console.log(`   Unclassified: ${unclassified_trades}`);
      console.log(`   Completed: ${completed_trades}`);
      console.log('');

      if (parseInt(unclassified_trades) === 0) {
        console.log('✅ All trades are already classified!');
        return;
      }

      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        console.log(`📦 Processing batch ${Math.floor(offset / this.batchSize) + 1}...`);
        
        // Get batch of unclassified trades
        const trades = await this.getUnclassifiedTrades(offset, this.batchSize);
        
        if (trades.length === 0) {
          hasMore = false;
          break;
        }

        // Process each trade in the batch
        for (const trade of trades) {
          await this.classifyTrade(trade);
          this.processed++;
          
          // Progress indicator
          if (this.processed % 10 === 0) {
            console.log(`   📋 Processed ${this.processed}/${unclassified_trades} trades`);
          }
        }

        offset += this.batchSize;
        
        // Brief pause between batches to be nice to the database
        await this.sleep(500);
      }

      await this.printSummary(unclassified_trades);

    } catch (error) {
      console.error('❌ Batch classification failed:', error);
      throw error;
    }
  }

  async getUnclassifiedTrades(offset, limit) {
    const query = `
      SELECT 
        id, user_id, symbol, entry_time, exit_time, entry_price, exit_price,
        quantity, side, pnl, commission, fees,
        EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) / 60 as hold_time_minutes
      FROM trades
      WHERE strategy IS NULL OR strategy = ''
      ORDER BY entry_time DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }

  async classifyTrade(trade) {
    try {
      let classification;
      let strategyConfidence;
      let classificationMethod;
      let classificationMetadata;

      // Determine if trade is complete (has exit data)
      const isComplete = trade.exit_time && trade.exit_price;
      
      if (isComplete) {
        // Use full technical analysis for completed trades (with rate limiting)
        try {
          classification = await Trade.classifyTradeStrategyWithAnalysis(trade);
          this.apiCalls++;
          
          // Rate limiting: delay after every API call
          await this.sleep(this.apiCallDelay);
          
        } catch (error) {
          console.warn(`⚠️  Technical analysis failed for trade ${trade.id}, falling back to basic classification:`, error.message);
          classification = await Trade.classifyTradeBasic(trade);
        }
      } else {
        // Use basic classification for incomplete trades
        classification = await Trade.classifyTradeBasic(trade);
      }

      // Extract classification details
      if (typeof classification === 'object') {
        const strategy = classification.strategy;
        strategyConfidence = Math.round((classification.confidence || 0.5) * 100);
        classificationMethod = classification.method || (isComplete ? 'technical_analysis' : 'time_based_partial');
        classificationMetadata = {
          signals: classification.signals || [],
          holdTimeMinutes: classification.holdTimeMinutes,
          priceMove: classification.priceMove,
          analysisTimestamp: new Date().toISOString(),
          batchProcessed: true
        };
      } else {
        const strategy = classification;
        strategyConfidence = isComplete ? 70 : 60; // Slightly lower confidence for batch processing
        classificationMethod = 'time_based';
        classificationMetadata = {
          holdTimeMinutes: trade.hold_time_minutes,
          analysisTimestamp: new Date().toISOString(),
          batchProcessed: true
        };
      }

      // Update the trade with classification
      await this.updateTradeClassification(
        trade.id,
        classification.strategy || classification,
        strategyConfidence,
        classificationMethod,
        classificationMetadata
      );

      this.classified++;

    } catch (error) {
      console.error(`❌ Failed to classify trade ${trade.id}:`, error.message);
      this.errors++;
    }
  }

  async updateTradeClassification(tradeId, strategy, confidence, method, metadata) {
    const query = `
      UPDATE trades 
      SET 
        strategy = $2,
        strategy_confidence = $3,
        classification_method = $4,
        classification_metadata = $5,
        manual_override = false
      WHERE id = $1
    `;

    await db.query(query, [
      tradeId,
      strategy,
      confidence,
      method,
      JSON.stringify(metadata)
    ]);
  }

  async printSummary(totalToProcess) {
    const duration = (Date.now() - this.startTime) / 1000;
    const rate = this.processed / duration;

    console.log('');
    console.log('🎉 Batch Classification Complete!');
    console.log('=====================================');
    console.log(`📊 Total processed: ${this.processed}/${totalToProcess}`);
    console.log(`✅ Successfully classified: ${this.classified}`);
    console.log(`❌ Errors: ${this.errors}`);
    console.log(`🔗 API calls made: ${this.apiCalls}`);
    console.log(`⏱️  Total time: ${duration.toFixed(1)} seconds`);
    console.log(`⚡ Processing rate: ${rate.toFixed(1)} trades/second`);
    console.log('');

    // Show classification breakdown
    const breakdown = await this.getClassificationBreakdown();
    console.log('📈 Strategy Distribution:');
    breakdown.forEach(row => {
      const percentage = ((row.count / this.classified) * 100).toFixed(1);
      console.log(`   ${row.strategy}: ${row.count} trades (${percentage}%)`);
    });

    console.log('');
    console.log('✨ All existing trades have been classified!');
    console.log('   New trades will be automatically classified going forward.');
  }

  async getClassificationBreakdown() {
    const query = `
      SELECT 
        strategy,
        COUNT(*) as count,
        AVG(strategy_confidence) as avg_confidence
      FROM trades 
      WHERE strategy IS NOT NULL 
        AND classification_metadata->>'batchProcessed' = 'true'
      GROUP BY strategy 
      ORDER BY count DESC
    `;

    const result = await db.query(query);
    return result.rows;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the batch processing if called directly
if (require.main === module) {
  const processor = new TradeClassificationBatch();
  
  processor.run()
    .then(() => {
      console.log('✅ Batch classification completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Batch classification failed:', error);
      process.exit(1);
    });
}

module.exports = TradeClassificationBatch;