#!/usr/bin/env node

const db = require('../src/config/database');
const axios = require('axios');

async function testNewsCorrelationAPI() {
  console.log('[CHECK] Testing News Correlation API Endpoints\n');

  try {
    // Get a user for testing
    const userQuery = await db.query('SELECT id, email FROM users LIMIT 1');
    const user = userQuery.rows[0];
    console.log('👤 Testing with user:', user.email);

    // Create a simple JWT token for testing (in production this would be from login)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    console.log('🔑 Generated test token');

    const apiBase = 'http://localhost:3000/api';
    const headers = { Authorization: `Bearer ${token}` };

    // Test 1: Check if feature is enabled
    console.log('\n[INFO] Test 1: Checking if feature is enabled...');
    try {
      const enabledResponse = await axios.get(`${apiBase}/news-correlation/enabled`, { headers });
      console.log('[SUCCESS] Enabled check response:', enabledResponse.data);
    } catch (error) {
      console.log('[ERROR] Enabled check failed:', error.response?.data || error.message);
    }

    // Test 2: Get analytics data
    console.log('\n[INFO] Test 2: Fetching analytics data...');
    try {
      const analyticsResponse = await axios.get(`${apiBase}/news-correlation/analytics`, { headers });
      console.log('[SUCCESS] Analytics response received');
      
      const data = analyticsResponse.data;
      
      if (data.metadata) {
        console.log('[STATS] Metadata:', {
          total_trades: data.metadata.total_trades_analyzed,
          date_range: data.metadata.date_range,
          has_insights: data.insights?.length > 0
        });
      }
      
      if (data.overall_performance) {
        console.log('[ANALYTICS] Overall Performance:', {
          sentiment_types: Object.keys(data.overall_performance.by_sentiment || {}),
          has_data: Object.keys(data.overall_performance.by_sentiment || {}).length > 0
        });
      }
      
      if (data.insights && data.insights.length > 0) {
        console.log('[INFO] Insights found:', data.insights.length);
        data.insights.slice(0, 2).forEach((insight, i) => {
          console.log(`   ${i + 1}. ${insight.title} (${insight.level})`);
        });
      }
      
    } catch (error) {
      console.log('[ERROR] Analytics fetch failed:', error.response?.data || error.message);
    }

    // Test 3: Check how many trades have sentiment data
    console.log('\n[INFO] Test 3: Checking sentiment data coverage...');
    const sentimentQuery = `
      SELECT 
        COUNT(*) as total_completed_trades,
        COUNT(CASE WHEN has_news = TRUE THEN 1 END) as trades_with_news,
        COUNT(CASE WHEN news_sentiment IS NOT NULL THEN 1 END) as trades_with_sentiment,
        COUNT(CASE WHEN news_sentiment = 'positive' THEN 1 END) as positive_sentiment,
        COUNT(CASE WHEN news_sentiment = 'negative' THEN 1 END) as negative_sentiment,
        COUNT(CASE WHEN news_sentiment = 'neutral' THEN 1 END) as neutral_sentiment
      FROM trades 
      WHERE user_id = $1 
        AND exit_time IS NOT NULL 
        AND exit_price IS NOT NULL
    `;
    
    const sentimentResult = await db.query(sentimentQuery, [user.id]);
    const stats = sentimentResult.rows[0];
    
    console.log('[STATS] Trade sentiment statistics:');
    console.log(`   Total completed trades: ${stats.total_completed_trades}`);
    console.log(`   Trades with news: ${stats.trades_with_news}`);
    console.log(`   Trades with sentiment: ${stats.trades_with_sentiment}`);
    console.log(`   - Positive: ${stats.positive_sentiment}`);
    console.log(`   - Negative: ${stats.negative_sentiment}`);
    console.log(`   - Neutral: ${stats.neutral_sentiment}`);
    
    if (parseInt(stats.trades_with_sentiment) === 0) {
      console.log('\n[WARNING]  No trades with sentiment data found for this user!');
      console.log('   This explains why analytics might be empty.');
      console.log('   Run news enrichment backfill to populate sentiment data.');
    }

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

testNewsCorrelationAPI();