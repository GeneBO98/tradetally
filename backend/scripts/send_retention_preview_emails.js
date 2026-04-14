#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/config/database');
const EmailService = require('../src/services/emailService');

const AT_RISK_QUERY = `
  SELECT
    u.id,
    u.email,
    u.username,
    u.full_name,
    ues.days_active_last_30,
    ues.total_trades,
    ues.total_imports,
    ues.total_diary_entries,
    ues.total_broker_syncs,
    ues.last_feature_used,
    COALESCE(ues.features_used, '{}'::jsonb) AS features_used
  FROM user_engagement_summary ues
  INNER JOIN users u ON u.id = ues.user_id
  WHERE u.is_active = true
    AND u.marketing_consent = true
    AND ues.engagement_tier = 'dormant'
    AND ues.lifecycle_stage IN ('activated', 'customer')
    AND COALESCE(ues.total_trades, 0)
      + COALESCE(ues.total_imports, 0)
      + COALESCE(ues.total_diary_entries, 0)
      + COALESCE(ues.total_broker_syncs, 0) > 0
  ORDER BY random()
  LIMIT 1
`;

const CHURNED_NO_IMPORTS_QUERY = `
  SELECT
    u.id,
    u.email,
    u.username,
    u.full_name,
    ues.total_imports,
    ues.total_trades,
    ues.last_feature_used,
    COALESCE((
      SELECT COUNT(*)
      FROM unknown_csv_headers uch
      WHERE uch.user_id = u.id
        AND uch.created_at > NOW() - INTERVAL '120 days'
        AND uch.outcome IN ('parse_failed', 'zero_trades', 'zero_imported')
    ), 0)::int AS recent_import_failures
  FROM user_engagement_summary ues
  INNER JOIN users u ON u.id = ues.user_id
  WHERE u.is_active = true
    AND u.marketing_consent = true
    AND ues.lifecycle_stage = 'churned'
    AND COALESCE(ues.total_imports, 0) = 0
    AND COALESCE(ues.total_trades, 0) = 0
  ORDER BY random()
  LIMIT 1
`;

async function main() {
  if (!EmailService.isConfigured()) {
    throw new Error('Email is not configured');
  }

  const adminEmail = await EmailService.getInternalNotificationRecipient();
  if (!adminEmail) {
    throw new Error('No admin recipient configured');
  }

  const atRisk = (await db.query(AT_RISK_QUERY)).rows[0] || null;
  const churned = (await db.query(CHURNED_NO_IMPORTS_QUERY)).rows[0] || null;

  if (!atRisk) {
    throw new Error('No at-risk user found');
  }

  if (!churned) {
    throw new Error('No churned no-imports user found');
  }

  await EmailService.sendAtRiskFollowupEmail(
    adminEmail,
    atRisk.username || atRisk.full_name || 'there',
    {
      daysActiveLast30: atRisk.days_active_last_30 || 0,
      totalTrades: atRisk.total_trades || 0,
      totalImports: atRisk.total_imports || 0,
      totalDiaryEntries: atRisk.total_diary_entries || 0,
      totalBrokerSyncs: atRisk.total_broker_syncs || 0,
      lastFeatureUsed: atRisk.last_feature_used || null,
      featuresUsed: atRisk.features_used || {}
    },
    null
  );

  await EmailService.sendChurnedNoImportsFollowupEmail(
    adminEmail,
    churned.username || churned.full_name || 'there',
    {
      recentImportFailures: churned.recent_import_failures || 0,
      lastFeatureUsed: churned.last_feature_used || null
    },
    null
  );

  console.log(JSON.stringify({
    adminEmail,
    atRiskUser: {
      id: atRisk.id,
      email: atRisk.email,
      username: atRisk.username,
      fullName: atRisk.full_name
    },
    churnedNoImportsUser: {
      id: churned.id,
      email: churned.email,
      username: churned.username,
      fullName: churned.full_name,
      recentImportFailures: churned.recent_import_failures
    }
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
