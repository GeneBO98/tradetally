#!/usr/bin/env node

const db = require('../src/config/database');
const newsEnrichmentService = require('../src/services/newsEnrichmentService');
const logger = require('../src/utils/logger');

async function enrichAllUsersWithSentiment() {
  console.log('[CHECK] Enriching trades with sentiment data for all users\n');

  try {
    // Get all users with trades
    const usersQuery = `
      SELECT DISTINCT u.id, u.email, COUNT(t.id) as trade_count
      FROM users u
      INNER JOIN trades t ON u.id = t.user_id
      WHERE t.exit_time IS NOT NULL 
        AND t.exit_price IS NOT NULL
        AND t.news_sentiment IS NULL
      GROUP BY u.id, u.email
      ORDER BY trade_count DESC
    `;
    
    const usersResult = await db.query(usersQuery);
    console.log(`Found ${usersResult.rows.length} users with trades needing sentiment enrichment\n`);

    for (const user of usersResult.rows) {
      console.log(`\n👤 Processing user: ${user.email} (${user.trade_count} trades)`);
      
      // Get trades without sentiment for this user
      const tradesQuery = `
        SELECT id, symbol, trade_date, entry_time
        FROM trades
        WHERE user_id = $1
          AND exit_time IS NOT NULL
          AND exit_price IS NOT NULL
          AND news_sentiment IS NULL
        ORDER BY trade_date DESC
        LIMIT 50  -- Process up to 50 trades per user to avoid rate limits
      `;
      
      const tradesResult = await db.query(tradesQuery, [user.id]);
      console.log(`   Found ${tradesResult.rows.length} trades to enrich`);
      
      let enrichedCount = 0;
      let errorCount = 0;
      
      for (const trade of tradesResult.rows) {
        try {
          // Check news for this trade
          const newsData = await newsEnrichmentService.getNewsForSymbolAndDate(
            trade.symbol,
            trade.trade_date,
            user.id
          );
          
          // Update the trade with sentiment data
          if (newsData.sentiment || newsData.hasNews) {
            const updateQuery = `
              UPDATE trades 
              SET 
                has_news = $1,
                news_events = $2,
                news_sentiment = $3,
                news_checked_at = CURRENT_TIMESTAMP
              WHERE id = $4
            `;

            await db.query(updateQuery, [
              newsData.hasNews,
              JSON.stringify(newsData.newsEvents || []),
              newsData.sentiment,
              trade.id
            ]);
            
            enrichedCount++;
            process.stdout.write(`   ✓ ${trade.symbol} (${newsData.sentiment || 'no sentiment'})\n`);
          } else {
            // Mark as checked even if no news found
            await db.query(
              `UPDATE trades SET news_checked_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [trade.id]
            );
          }
          
          // Rate limit - wait 500ms between API calls
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          errorCount++;
          console.error(`   ✗ Error enriching ${trade.symbol}: ${error.message}`);
        }
      }
      
      console.log(`   Summary: ${enrichedCount} enriched, ${errorCount} errors`);
    }
    
    // Show final statistics
    console.log('\n[STATS] Final Statistics:');
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as users_with_sentiment,
        COUNT(*) as total_trades_with_sentiment,
        COUNT(CASE WHEN news_sentiment = 'positive' THEN 1 END) as positive,
        COUNT(CASE WHEN news_sentiment = 'negative' THEN 1 END) as negative,
        COUNT(CASE WHEN news_sentiment = 'neutral' THEN 1 END) as neutral
      FROM trades 
      WHERE news_sentiment IS NOT NULL
    `;
    
    const stats = await db.query(statsQuery);
    const s = stats.rows[0];
    
    console.log(`   Users with sentiment data: ${s.users_with_sentiment}`);
    console.log(`   Total trades with sentiment: ${s.total_trades_with_sentiment}`);
    console.log(`   - Positive: ${s.positive}`);
    console.log(`   - Negative: ${s.negative}`);
    console.log(`   - Neutral: ${s.neutral}`);
    
    console.log('\n[SUCCESS] Enrichment complete!');
    console.log('   News Sentiment Analytics should now show data for all users.');

  } catch (error) {
    console.error('[ERROR] Enrichment failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Add delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

enrichAllUsersWithSentiment();