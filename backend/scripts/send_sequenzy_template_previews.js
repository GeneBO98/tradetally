require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/config/database');
const emailDeliveryService = require('../src/services/emailDeliveryService');

const recipient = process.argv[2] || 'boverton@tradetally.io';
const mode = process.argv[3] || 'live';
const sourceEmail = process.argv[4] || recipient;

function formatCurrency(value) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function getPnlColor(value) {
  return Number(value || 0) >= 0 ? '#16a34a' : '#dc2626';
}

function getReviewUrl() {
  return process.env.REVIEW_URL || `${process.env.FRONTEND_URL || 'https://tradetally.io'}/review`;
}

function buildPreviewToken(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString('hex')}`;
}

async function loadUserContext(email) {
  const result = await db.query(
    `SELECT id, email, username, full_name, marketing_consent
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error(`No user found for ${email}`);
  }

  const user = result.rows[0];
  user.display_name = user.username || user.full_name || 'there';
  return user;
}

async function loadWeeklyDigestData(userId) {
  const result = await db.query(
    `SELECT
       COUNT(*)::int AS trade_count,
       COALESCE(SUM(pnl), 0)::double precision AS total_pnl
     FROM trades
     WHERE user_id = $1
       AND trade_date >= CURRENT_DATE - INTERVAL '7 days'
       AND trade_date <= CURRENT_DATE`,
    [userId]
  );

  return {
    trade_count: String(result.rows[0]?.trade_count || 0),
    total_pnl: formatCurrency(result.rows[0]?.total_pnl || 0),
    pnl_color: getPnlColor(result.rows[0]?.total_pnl || 0)
  };
}

async function loadTrialConversionData(userId) {
  const tradesResult = await db.query(
    `SELECT
       COUNT(*)::int AS trade_count,
       COALESCE(SUM(pnl), 0)::double precision AS total_pnl,
       COALESCE(
         ROUND(
           100.0 * COUNT(*) FILTER (WHERE pnl > 0)
           / NULLIF(COUNT(*), 0),
           1
         ),
         0
       )::double precision AS win_rate
     FROM trades
     WHERE user_id = $1`,
    [userId]
  );

  const tradeCount = Number(tradesResult.rows[0]?.trade_count || 0);
  const totalPnl = Number(tradesResult.rows[0]?.total_pnl || 0);
  const winRate = Number(tradesResult.rows[0]?.win_rate || 0);

  return {
    trade_count: String(tradeCount),
    total_pnl: formatCurrency(totalPnl),
    pnl_color: getPnlColor(totalPnl),
    win_rate: `${winRate.toFixed(1)}%`
  };
}

async function buildLiveTemplates(email, sourceUserEmail) {
  const user = await loadUserContext(sourceUserEmail);
  const weekly = await loadWeeklyDigestData(user.id);
  const conversion = await loadTrialConversionData(user.id);
  const baseUrl = process.env.FRONTEND_URL || 'https://tradetally.io';
  const unsubscribeUrl = `${baseUrl}/unsubscribe?token=preview-${user.id}`;
  const reviewUrl = getReviewUrl();

  return [
    {
      slug: 'email-verification',
      variables: {
        verification_url: `${baseUrl}/verify-email/${buildPreviewToken('verify')}`
      }
    },
    {
      slug: 'password-reset',
      variables: {
        reset_url: `${baseUrl}/reset-password/${buildPreviewToken('reset')}`
      }
    },
    {
      slug: 'email-change-verification',
      variables: {
        verification_url: `${baseUrl}/verify-email/${buildPreviewToken('email-change')}`
      }
    },
    {
      slug: 'trial-expiration',
      variables: {
        headline: 'Your Pro trial has ended',
        username: user.display_name,
        body_text: 'Your 14-day Pro trial has ended. You can continue using TradeTally on the free plan, or upgrade to keep Pro features like behavioral analytics, price alerts, and enhanced charts.',
        cta_url: `${baseUrl}/pricing`,
        cta_text: 'View Plans',
        footnote: 'Your free plan includes unlimited trade storage, CSV import, and basic analytics.',
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'weekly-digest',
      variables: {
        username: user.display_name,
        trade_count: weekly.trade_count,
        total_pnl: weekly.total_pnl,
        pnl_color: weekly.pnl_color,
        dashboard_url: `${baseUrl}/dashboard`,
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'reengagement',
      variables: {
        username: user.display_name,
        days_inactive: '14',
        login_url: `${baseUrl}/login`,
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'at-risk-followup',
      variables: {
        headline: 'A few TradeTally features are still waiting for you',
        greeting: `Hi ${user.display_name}, you already put real activity into your journal, and a few of the highest-value workflows may still be untouched.`,
        body_text: 'Come back for one short review session and turn your existing trades into clearer patterns and better feedback loops.',
        feature_1: 'Faster trade capture with imports and broker sync',
        feature_2: 'Performance analytics on your existing trades',
        feature_3: 'Journaling and review workflows tied to each setup',
        dashboard_url: `${baseUrl}/dashboard`,
        cta_text: 'Open My Dashboard',
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'churned-no-imports-followup',
      variables: {
        headline: 'Trade import updates you may have missed',
        greeting: `Hi ${user.display_name}, you signed up for TradeTally but never got a clean import across the finish line.`,
        body_text: 'If importing was the blocker, the TradeTally import flow is worth another try.',
        status_note: 'We have improved parser coverage, diagnostics, and broker handling since the earlier import flows.',
        import_url: `${baseUrl}/import`,
        cta_text: 'Try Import Again',
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'trial-conversion',
      variables: {
        headline: 'Your trial insights are waiting',
        greeting: `Hi ${user.display_name}, you tracked ${conversion.trade_count} trades during your trial. Nice start.`,
        trade_count: conversion.trade_count,
        win_rate: conversion.win_rate,
        total_pnl: conversion.total_pnl,
        pnl_color: conversion.pnl_color,
        body_text: 'With Pro, you will keep access to detailed analytics, unlimited broker imports, and everything you need to improve your edge.',
        upgrade_url: `${baseUrl}/settings`,
        cta_text: 'Continue with Pro',
        feedback_url_1: `${baseUrl}/trial-feedback?reason=too_expensive`,
        feedback_label_1: 'Too expensive',
        feedback_url_2: `${baseUrl}/trial-feedback?reason=missing_features`,
        feedback_label_2: 'Missing features I need',
        feedback_url_3: `${baseUrl}/trial-feedback?reason=not_enough_value`,
        feedback_label_3: 'I did not see enough value yet',
        feedback_url_4: `${baseUrl}/trial-feedback?reason=setup_too_hard`,
        feedback_label_4: 'Import or setup felt too hard',
        feedback_url_5: `${baseUrl}/trial-feedback?reason=using_another_tool`,
        feedback_label_5: 'I am using another tool',
        feedback_url_6: `${baseUrl}/trial-feedback?reason=not_trading_right_now`,
        feedback_label_6: 'I am not trading right now',
        feedback_url_7: `${baseUrl}/trial-feedback?reason=bugs_or_reliability`,
        feedback_label_7: 'Bugs, reliability, or performance issues',
        feedback_url_8: `${baseUrl}/trial-feedback?reason=just_exploring`,
        feedback_label_8: 'I was just exploring',
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'review-request',
      variables: {
        username: user.display_name,
        review_url: reviewUrl,
        unsubscribe_url: unsubscribeUrl
      }
    },
    {
      slug: 'subscription-welcome',
      variables: {
        username: user.display_name,
        plan_name: 'Pro Yearly',
        support_email: process.env.SUPPORT_EMAIL || 'support@tradetally.io',
        dashboard_url: `${baseUrl}/dashboard`
      }
    },
    {
      slug: 'support-request',
      variables: {
        username: user.display_name,
        user_email: user.email,
        tier: 'pro',
        support_subject: 'Live Sequenzy support request test',
        message_html: 'This support request was generated by the Sequenzy live preview script.<br><br>Please ignore.'
      }
    }
  ];
}

function buildSampleTemplates(email) {
  const baseUrl = process.env.FRONTEND_URL || 'https://tradetally.io';
  const reviewUrl = getReviewUrl();

  return [
    {
      slug: 'email-verification',
      variables: { verification_url: `${baseUrl}/verify-email/${buildPreviewToken('verify')}` }
    },
    {
      slug: 'password-reset',
      variables: { reset_url: `${baseUrl}/reset-password/${buildPreviewToken('reset')}` }
    },
    {
      slug: 'email-change-verification',
      variables: { verification_url: `${baseUrl}/verify-email/${buildPreviewToken('email-change')}` }
    },
    {
      slug: 'trial-expiration',
      variables: {
        headline: 'Your Pro trial has ended',
        username: 'Brennon',
        body_text: 'Your 14-day Pro trial has ended. You can continue using TradeTally on the free plan, or upgrade to keep Pro features like behavioral analytics, price alerts, and enhanced charts.',
        cta_url: `${baseUrl}/pricing`,
        cta_text: 'View Plans',
        footnote: 'Your free plan includes unlimited trade storage, CSV import, and basic analytics.',
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'weekly-digest',
      variables: {
        username: 'Brennon',
        trade_count: '12',
        total_pnl: '$1250.50',
        pnl_color: '#16a34a',
        dashboard_url: `${baseUrl}/dashboard`,
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'reengagement',
      variables: {
        username: 'Brennon',
        days_inactive: '14',
        login_url: `${baseUrl}/login`,
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'at-risk-followup',
      variables: {
        headline: 'A few TradeTally features are still waiting for you',
        greeting: 'Hi Brennon, you already put real activity into your journal, and a few of the highest-value workflows may still be untouched.',
        body_text: 'Come back for one short review session and turn your existing trades into clearer patterns and better feedback loops.',
        feature_1: 'Faster trade capture with imports and broker sync',
        feature_2: 'Performance analytics on your existing trades',
        feature_3: 'Journaling and review workflows tied to each setup',
        dashboard_url: `${baseUrl}/dashboard`,
        cta_text: 'Open My Dashboard',
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'churned-no-imports-followup',
      variables: {
        headline: 'Trade import updates you may have missed',
        greeting: 'Hi Brennon, you signed up for TradeTally but never got a clean import across the finish line.',
        body_text: 'If importing was the blocker, the TradeTally import flow is worth another try.',
        status_note: 'We have improved parser coverage, diagnostics, and broker handling since the earlier import flows.',
        import_url: `${baseUrl}/import`,
        cta_text: 'Try Import Again',
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'trial-conversion',
      variables: {
        headline: 'Your trial insights are waiting',
        greeting: 'Hi Brennon, you tracked 12 trades during your trial. Nice start.',
        trade_count: '12',
        win_rate: '58.3%',
        total_pnl: '$1250.50',
        pnl_color: '#16a34a',
        body_text: 'With Pro, you will keep access to detailed analytics, unlimited broker imports, and everything you need to improve your edge.',
        upgrade_url: `${baseUrl}/settings`,
        cta_text: 'Continue with Pro',
        feedback_url_1: `${baseUrl}/trial-feedback?reason=too_expensive`,
        feedback_label_1: 'Too expensive',
        feedback_url_2: `${baseUrl}/trial-feedback?reason=missing_features`,
        feedback_label_2: 'Missing features I need',
        feedback_url_3: `${baseUrl}/trial-feedback?reason=not_enough_value`,
        feedback_label_3: 'I did not see enough value yet',
        feedback_url_4: `${baseUrl}/trial-feedback?reason=setup_too_hard`,
        feedback_label_4: 'Import or setup felt too hard',
        feedback_url_5: `${baseUrl}/trial-feedback?reason=using_another_tool`,
        feedback_label_5: 'I am using another tool',
        feedback_url_6: `${baseUrl}/trial-feedback?reason=not_trading_right_now`,
        feedback_label_6: 'I am not trading right now',
        feedback_url_7: `${baseUrl}/trial-feedback?reason=bugs_or_reliability`,
        feedback_label_7: 'Bugs, reliability, or performance issues',
        feedback_url_8: `${baseUrl}/trial-feedback?reason=just_exploring`,
        feedback_label_8: 'I was just exploring',
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'review-request',
      variables: {
        username: 'Brennon',
        review_url: reviewUrl,
        unsubscribe_url: `${baseUrl}/unsubscribe?token=sample-unsub`
      }
    },
    {
      slug: 'subscription-welcome',
      variables: {
        username: 'Brennon',
        plan_name: 'Pro Yearly',
        support_email: process.env.SUPPORT_EMAIL || 'support@tradetally.io',
        dashboard_url: `${baseUrl}/dashboard`
      }
    },
    {
      slug: 'support-request',
      variables: {
        username: 'Brennon',
        user_email: email,
        tier: 'pro',
        support_subject: 'Test support request',
        message_html: 'This is a Sequenzy template send test.<br><br>Please ignore.'
      }
    }
  ];
}

async function main() {
  if (emailDeliveryService.getEmailProvider() !== 'sequenzy') {
    throw new Error('EMAIL_PROVIDER must be set to "sequenzy" for this script.');
  }

  const templates = mode === 'live'
    ? await buildLiveTemplates(recipient, sourceEmail)
    : buildSampleTemplates(recipient);

  for (const template of templates) {
    await emailDeliveryService.sendMail({
      to: recipient,
      slug: template.slug,
      variables: template.variables
    });
    console.log(`[SENT] ${template.slug} -> ${recipient} (${mode})`);
  }
}

main().catch((error) => {
  console.error('[ERROR] Failed sending Sequenzy template previews:', error);
  process.exit(1);
});
