require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EVENTS } = require('../src/services/sequenzyMarketingService');

const baseUrl = `${(process.env.SEQUENZY_API_BASE_URL || 'https://api.sequenzy.com').replace(/\/$/, '')}/api/v1`;
const headers = {
  Authorization: `Bearer ${process.env.SEQUENZY_API_KEY}`,
  'Content-Type': 'application/json'
};

function requireApiKey() {
  if (!process.env.SEQUENZY_API_KEY) {
    throw new Error('SEQUENZY_API_KEY is required');
  }
}

function templatePath(fileName) {
  return path.join(__dirname, '..', 'src', 'sequenzy-templates', fileName);
}

function loadTemplate(fileName) {
  return fs.readFileSync(templatePath(fileName), 'utf8');
}

function toEventTemplate(html) {
  return html
    .replace(/\{\{marketing_unsubscribe_url\}\}/g, '{{UNSUBSCRIBE_URL}}')
    .replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => {
      if (key === 'UNSUBSCRIBE_URL') {
        return '{{UNSUBSCRIBE_URL}}';
      }
      if (key.startsWith('event.')) {
        return `{{${key}}}`;
      }
      return `{{event.${key}}}`;
    });
}

function subscriptionWelcomeHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to TradeTally Pro</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="520" style="width:100%;max-width:520px;">
          <tr>
            <td style="padding:0 0 32px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#F0812A;">TradeTally</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e4e4e7;padding:40px 36px;">
              <h1 style="color:#18181b;font-size:22px;margin:0 0 8px 0;font-weight:700;">Welcome to TradeTally Pro</h1>
              <p style="color:#71717a;font-size:15px;line-height:1.6;margin:0 0 24px 0;">Hi {{event.username}},</p>
              <p style="color:#52525b;font-size:15px;line-height:1.6;margin:0 0 24px 0;">Thank you for subscribing to {{event.plan_name}}. We appreciate the support and are glad to have you as a Pro member.</p>
              <p style="color:#52525b;font-size:15px;line-height:1.6;margin:0 0 8px 0;">Everything Pro is now unlocked for you:</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px 0;">
                <tr>
                  <td style="padding:0 0 0 8px;color:#52525b;font-size:15px;line-height:2;">
                    - Behavioral &amp; advanced analytics<br>
                    - Unlimited broker imports &amp; sync<br>
                    - Price alerts &amp; watchlists<br>
                    - AI-powered trade insights<br>
                    - Full API access
                  </td>
                </tr>
              </table>
              <div style="background-color:#fafafa;border-radius:8px;padding:20px 24px;margin:0 0 28px 0;">
                <p style="color:#18181b;font-size:14px;font-weight:600;margin:0 0 8px 0;">Priority support</p>
                <p style="color:#52525b;font-size:14px;line-height:1.6;margin:0;">As a Pro subscriber, you get priority service for any issues or feature requests. Reach out anytime at <a href="mailto:{{event.support_email}}" style="color:#18181b;text-decoration:underline;">{{event.support_email}}</a> and we'll get back to you first.</p>
              </div>
              <div style="text-align:center;margin:0 0 28px 0;">
                <a href="{{event.dashboard_url}}" style="background-color:#F0812A;color:#ffffff;padding:12px 28px;text-decoration:none;display:inline-block;font-weight:600;font-size:14px;line-height:14px;border-radius:8px;">Go to Dashboard</a>
              </div>
              <p style="color:#a1a1aa;font-size:13px;line-height:1.5;margin:0;">You can manage your subscription anytime from Settings &gt; Billing.</p>
              <p style="color:#a1a1aa;font-size:11px;margin:24px 0 0 0;padding-top:20px;border-top:1px solid #f4f4f5;text-align:center;">You're receiving this because you opted into marketing emails. <a href="{{UNSUBSCRIBE_URL}}" style="color:#71717a;text-decoration:underline;">Unsubscribe</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function sequenceDefinitions() {
  return [
    {
      name: 'TradeTally Marketing - Weekly Digest',
      trigger: 'event_received',
      eventName: EVENTS.WEEKLY_DIGEST,
      steps: [{
        subject: '{{event.trade_count}} trades this week - TradeTally',
        html: toEventTemplate(loadTemplate('weekly-digest.html'))
      }]
    },
    {
      name: 'TradeTally Marketing - Reengagement',
      trigger: 'event_received',
      eventName: EVENTS.REENGAGEMENT,
      steps: [{
        subject: 'Your journal is waiting - TradeTally',
        html: toEventTemplate(loadTemplate('reengagement.html'))
      }]
    },
    {
      name: 'TradeTally Marketing - Trial Conversion',
      trigger: 'event_received',
      eventName: EVENTS.TRIAL_CONVERSION,
      steps: [{
        subject: '{{event.headline}}',
        html: toEventTemplate(loadTemplate('trial-conversion.html'))
      }]
    },
    {
      name: 'TradeTally Marketing - At Risk Follow-up',
      trigger: 'event_received',
      eventName: EVENTS.AT_RISK_FOLLOWUP,
      steps: [{
        subject: 'A few TradeTally features are still waiting for you',
        html: toEventTemplate(loadTemplate('at-risk-followup.html'))
      }]
    },
    {
      name: 'TradeTally Marketing - Churned No Imports',
      trigger: 'event_received',
      eventName: EVENTS.CHURNED_NO_IMPORTS_FOLLOWUP,
      steps: [{
        subject: 'Trade import updates you may have missed',
        html: toEventTemplate(loadTemplate('churned-no-imports-followup.html'))
      }]
    },
    {
      name: 'TradeTally Marketing - Review Request',
      trigger: 'event_received',
      eventName: EVENTS.REVIEW_REQUEST,
      steps: [{
        subject: "How's TradeTally Pro been for you?",
        html: toEventTemplate(loadTemplate('review-request.html'))
      }]
    },
    {
      name: 'TradeTally Marketing - Subscription Welcome',
      trigger: 'event_received',
      eventName: EVENTS.SUBSCRIPTION_WELCOME,
      steps: [{
        subject: 'Welcome to TradeTally Pro',
        html: subscriptionWelcomeHtml()
      }]
    }
  ];
}

async function listSequences() {
  const response = await axios.get(`${baseUrl}/sequences`, { headers, timeout: 15000 });
  return response.data.sequences || [];
}

async function createSequence(definition) {
  const response = await axios.post(`${baseUrl}/sequences`, definition, { headers, timeout: 15000 });
  return response.data.sequence;
}

async function updateSequence(sequenceId, definition) {
  const response = await axios.put(`${baseUrl}/sequences/${sequenceId}`, definition, { headers, timeout: 15000 });
  return response.data.sequence;
}

async function enableSequence(sequenceId) {
  await axios.post(`${baseUrl}/sequences/${sequenceId}/enable`, {}, { headers, timeout: 15000 });
}

async function syncSequences() {
  requireApiKey();

  const existing = await listSequences();
  const existingByName = new Map(existing.map((sequence) => [sequence.name, sequence]));

  for (const definition of sequenceDefinitions()) {
    const current = existingByName.get(definition.name);
    let sequenceId;

    if (current) {
      const updated = await updateSequence(current.id, definition);
      sequenceId = updated.id;
      console.log(`[UPDATED] ${definition.name}`);
    } else {
      const created = await createSequence(definition);
      sequenceId = created.id;
      console.log(`[CREATED] ${definition.name}`);
    }

    await enableSequence(sequenceId);
    console.log(`[ENABLED] ${definition.name}`);
  }
}

syncSequences().catch((error) => {
  console.error('[ERROR] Failed to sync Sequenzy marketing sequences:', error.response?.data || error.message);
  process.exit(1);
});
