#!/usr/bin/env node

// Debug script to check user subscription status and health integration access
const db = require('../src/config/database');

async function checkUserSubscription() {
  try {
    console.log('🔍 Checking user subscription status...\n');

    // Get all users with their subscription info
    const usersQuery = `
      SELECT 
        u.id,
        u.email,
        u.username,
        us.tier,
        us.status,
        us.trial_ends_at,
        us.is_trial_used
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
      ORDER BY u.id;
    `;

    const users = await db.query(usersQuery);
    
    console.log(`Found ${users.rows.length} users:\n`);
    
    for (const user of users.rows) {
      console.log(`👤 User ID: ${user.id}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Username: ${user.username || 'N/A'}`);
      console.log(`   Tier: ${user.tier || 'free'}`);
      console.log(`   Status: ${user.status || 'N/A'}`);
      console.log(`   Trial Ends: ${user.trial_ends_at || 'N/A'}`);
      console.log(`   Trial Used: ${user.is_trial_used || false}`);
      
      // Check health integration feature access
      const featureQuery = `
        SELECT feature_name, enabled 
        FROM user_subscription_features 
        WHERE user_id = $1 AND feature_name = 'health_integration';
      `;
      
      const features = await db.query(featureQuery, [user.id]);
      
      if (features.rows.length > 0) {
        console.log(`   Health Integration: ${features.rows[0].enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
      } else {
        console.log(`   Health Integration: ⚠️  NOT CONFIGURED`);
      }
      
      console.log('');
    }

    // Check if health_integration feature exists in subscription_features
    const healthFeatureQuery = `
      SELECT * FROM subscription_features 
      WHERE feature_name = 'health_integration';
    `;
    
    const healthFeature = await db.query(healthFeatureQuery);
    
    console.log('\n📋 Health Integration Feature Configuration:');
    if (healthFeature.rows.length > 0) {
      const feature = healthFeature.rows[0];
      console.log(`   Feature Name: ${feature.feature_name}`);
      console.log(`   Display Name: ${feature.display_name}`);
      console.log(`   Description: ${feature.description}`);
      console.log(`   Tier Required: ${feature.tier_required}`);
      console.log(`   ✅ Feature is properly configured`);
    } else {
      console.log(`   ❌ health_integration feature NOT found in subscription_features table`);
      console.log(`   💡 Run the database migration to add it`);
    }

    console.log('\n🔧 Quick Fixes:');
    console.log('1. If you have a Pro user but health integration is not enabled:');
    console.log('   Run: npm run migrate (to ensure migration 061 is applied)');
    console.log('');
    console.log('2. To manually enable health integration for a specific user:');
    console.log('   INSERT INTO user_subscription_features (user_id, feature_name, enabled)');
    console.log("   VALUES ([USER_ID], 'health_integration', true);");
    
  } catch (error) {
    console.error('❌ Error checking subscription status:', error);
  } finally {
    process.exit(0);
  }
}

checkUserSubscription();