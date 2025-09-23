#!/usr/bin/env node

/**
 * Simulate the exact process of loading a trade from frontend
 */

const db = require('../src/config/database');

async function simulateTradeLoad() {
  console.log('[TARGET] Simulating frontend trade load process...');
  
  try {
    // Step 1: Get a sample trade and user (like frontend would)
    console.log('\n1. Getting sample trade and user data...');
    const sampleQuery = `
      SELECT 
        t.id as trade_id,
        t.symbol,
        t.user_id,
        u.username,
        u.email
      FROM trades t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 1
    `;
    
    const sampleResult = await db.query(sampleQuery);
    if (sampleResult.rows.length === 0) {
      console.log('[ERROR] No trades found');
      return;
    }
    
    const sample = sampleResult.rows[0];
    console.log('Sample data:', {
      tradeId: sample.trade_id,
      symbol: sample.symbol,
      userId: sample.user_id,
      username: sample.username
    });
    
    // Step 2: Simulate the exact Trade.findById call
    console.log('\n2. Simulating Trade.findById call...');
    const Trade = require('../src/models/Trade');
    
    try {
      const trade = await Trade.findById(sample.trade_id, sample.user_id);
      
      if (!trade) {
        console.log('[ERROR] Trade.findById returned null');
        
        // Debug: Let's check what the actual query returns
        console.log('\n3. Debugging the raw query...');
        const debugQuery = `
          SELECT t.*, u.username, u.avatar_url,
            array_agg(DISTINCT ta.*) FILTER (WHERE ta.id IS NOT NULL) as attachments,
            count(DISTINCT tc.id)::integer as comment_count,
            sc.finnhub_industry as sector,
            sc.company_name as company_name
          FROM trades t
          LEFT JOIN users u ON t.user_id = u.id
          LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
          LEFT JOIN trade_comments tc ON t.id = tc.trade_id
          LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
          WHERE t.id = $1 AND (t.user_id = $2 OR t.is_public = true)
          GROUP BY t.id, u.username, u.avatar_url, sc.finnhub_industry, sc.company_name
        `;
        
        const debugResult = await db.query(debugQuery, [sample.trade_id, sample.user_id]);
        console.log('Debug query results:', debugResult.rows.length);
        
        if (debugResult.rows.length > 0) {
          console.log('Raw result structure:', Object.keys(debugResult.rows[0]));
          console.log('First few fields:', {
            id: debugResult.rows[0].id,
            symbol: debugResult.rows[0].symbol,
            strategy: debugResult.rows[0].strategy,
            username: debugResult.rows[0].username,
            attachments: Array.isArray(debugResult.rows[0].attachments) ? debugResult.rows[0].attachments.length : 'not array'
          });
        }
        
      } else {
        console.log('[SUCCESS] Trade.findById succeeded');
        console.log('Trade structure:', {
          id: trade.id,
          symbol: trade.symbol,
          hasUsername: !!trade.username,
          hasAttachments: !!trade.attachments,
          attachmentsType: typeof trade.attachments,
          attachmentsLength: Array.isArray(trade.attachments) ? trade.attachments.length : 'not array',
          hasExecutions: !!trade.executions,
          executionsType: typeof trade.executions
        });
      }
      
    } catch (tradeError) {
      console.log('[ERROR] Trade.findById threw error:', tradeError.message);
      console.log('Full error:', tradeError);
    }
    
    // Step 3: Test controller simulation
    console.log('\n4. Simulating controller getTrade method...');
    
    // Mock request/response objects
    const mockReq = {
      params: { id: sample.trade_id },
      user: { id: sample.user_id }
    };
    
    const mockRes = {
      json: (data) => {
        console.log('[SUCCESS] Controller would return:', {
          hasTradeProperty: !!data.trade,
          tradeId: data.trade?.id,
          symbol: data.trade?.symbol
        });
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`[ERROR] Controller would return ${code}:`, data);
          return data;
        }
      })
    };
    
    const mockNext = (error) => {
      console.log('[ERROR] Controller error:', error.message);
    };
    
    // Import and test the actual controller
    const tradeController = require('../src/controllers/trade.controller');
    await tradeController.getTrade(mockReq, mockRes, mockNext);
    
    console.log('\n[SUCCESS] Simulation completed');
    
  } catch (error) {
    console.error('[ERROR] Simulation failed:', error);
    throw error;
  }
}

// Run the simulation
if (require.main === module) {
  simulateTradeLoad()
    .then(() => {
      console.log('\n[SUCCESS] Simulation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n[ERROR] Simulation failed:', error);
      process.exit(1);
    });
}

module.exports = simulateTradeLoad;