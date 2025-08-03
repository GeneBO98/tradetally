#!/usr/bin/env node

const db = require('../src/config/database');
const newsEnrichmentService = require('../src/services/newsEnrichmentService');

async function enrichSingleUser(email) {
  console.log(`🧪 Enriching trades for user: ${email}\n`);

  try {
    // Get user ID
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const userId = userResult.rows[0].id;
    
    // Get trades without sentiment
    const tradesQuery = `
      SELECT id, symbol, trade_date, entry_time
      FROM trades
      WHERE user_id = $1
        AND exit_time IS NOT NULL
        AND exit_price IS NOT NULL
        AND news_sentiment IS NULL
      ORDER BY trade_date DESC
      LIMIT 30  -- Process first 30 trades
    `;
    
    const tradesResult = await db.query(tradesQuery, [userId]);
    console.log(`Found ${tradesResult.rows.length} trades to enrich\n`);
    
    let enrichedCount = 0;
    
    for (const trade of tradesResult.rows) {
      try {
        console.log(`Processing ${trade.symbol} on ${trade.trade_date.toISOString().split('T')[0]}...`);
        
        // Check news for this trade
        const newsData = await newsEnrichmentService.getNewsForSymbolAndDate(
          trade.symbol,
          trade.trade_date,
          userId
        );
        
        // Update the trade with sentiment data
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
          newsData.sentiment || 'neutral',  // Default to neutral if no specific sentiment
          trade.id
        ]);
        
        enrichedCount++;
        console.log(`✓ ${trade.symbol}: ${newsData.sentiment || 'neutral'} (${newsData.newsEvents?.length || 0} news items)`);
        
        // Rate limit - wait 1 second between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`✗ Error enriching ${trade.symbol}: ${error.message}`);
      }
    }
    
    // Show results
    console.log(`\n📊 Results for ${email}:`);
    const statsQuery = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN news_sentiment IS NOT NULL THEN 1 END) as with_sentiment,
        COUNT(CASE WHEN news_sentiment = 'positive' THEN 1 END) as positive,
        COUNT(CASE WHEN news_sentiment = 'negative' THEN 1 END) as negative,
        COUNT(CASE WHEN news_sentiment = 'neutral' THEN 1 END) as neutral
      FROM trades 
      WHERE user_id = $1
        AND exit_time IS NOT NULL
        AND exit_price IS NOT NULL
    `;
    
    const stats = await db.query(statsQuery, [userId]);
    const s = stats.rows[0];
    
    console.log(`   Total completed trades: ${s.total_trades}`);
    console.log(`   Trades with sentiment: ${s.with_sentiment}`);
    console.log(`   - Positive: ${s.positive}`);
    console.log(`   - Negative: ${s.negative}`);
    console.log(`   - Neutral: ${s.neutral}`);
    
    console.log('\n✅ Enrichment complete!');
    console.log('   News Sentiment Analytics should now show data.');

  } catch (error) {
    console.error('❌ Enrichment failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run for the test user
const email = process.argv[2] || 'jdoe2@id10tips.com';
enrichSingleUser(email);