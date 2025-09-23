#!/usr/bin/env node

// Check user tier and Pro access
const db = require('../src/config/database');

async function checkUserTier() {
  try {
    console.log('🔍 Checking all users with Pro tier...\n');

    // Get all Pro users
    const proUsersQuery = `
      SELECT 
        id,
        email,
        username,
        tier,
        trial_used,
        admin_approved,
        created_at
      FROM users 
      WHERE tier = 'pro' OR tier = 'admin'
      ORDER BY created_at DESC;
    `;

    const proUsers = await db.query(proUsersQuery);
    
    console.log(`Found ${proUsers.rows.length} Pro/Admin users:\n`);
    
    proUsers.rows.forEach((user, index) => {
      console.log(`${index + 1}. 👤 ${user.email || 'No email'} (${user.username || 'No username'})`);
      console.log(`   Tier: ${user.tier}`);
      console.log(`   Admin Approved: ${user.admin_approved}`);
      console.log(`   Trial Used: ${user.trial_used}`);
      console.log(`   Created: ${user.created_at}`);
      console.log('');
    });

    // Check if health integration feature exists
    console.log('\n📋 Checking subscription features...');
    const featuresQuery = `
      SELECT feature_name, display_name, tier_required 
      FROM subscription_features 
      WHERE feature_name = 'health_integration';
    `;
    
    const features = await db.query(featuresQuery);
    
    if (features.rows.length > 0) {
      const feature = features.rows[0];
      console.log(`✅ Health Integration feature found:`);
      console.log(`   Name: ${feature.feature_name}`);
      console.log(`   Display: ${feature.display_name}`);
      console.log(`   Required Tier: ${feature.tier_required}`);
    } else {
      console.log(`❌ Health Integration feature NOT found`);
      console.log(`💡 You may need to run the database migration`);
    }

    // Also check all users to see tiers
    const allUsersQuery = `
      SELECT tier, COUNT(*) as count 
      FROM users 
      GROUP BY tier 
      ORDER BY tier;
    `;
    
    const tierCounts = await db.query(allUsersQuery);
    console.log('\n📊 User tier distribution:');
    tierCounts.rows.forEach(row => {
      console.log(`   ${row.tier || 'null'}: ${row.count} users`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

if (process.argv[2]) {
  console.log(`🔍 Checking specific user: ${process.argv[2]}\n`);
  // Add specific user check if email/username provided
}

checkUserTier();