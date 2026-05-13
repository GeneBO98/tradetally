const axios = require('axios');

const EVENTS = {
  WEEKLY_DIGEST: 'tradetally.marketing.weekly_digest',
  REENGAGEMENT: 'tradetally.marketing.reengagement',
  TRIAL_CONVERSION: 'tradetally.marketing.trial_conversion',
  AT_RISK_FOLLOWUP: 'tradetally.marketing.at_risk_followup',
  CHURNED_NO_IMPORTS_FOLLOWUP: 'tradetally.marketing.churned_no_imports_followup',
  REVIEW_REQUEST: 'tradetally.marketing.review_request',
  SUBSCRIPTION_WELCOME: 'tradetally.marketing.subscription_welcome'
};

function isConfigured() {
  return !!process.env.SEQUENZY_API_KEY;
}

function getBaseUrl() {
  return `${(process.env.SEQUENZY_API_BASE_URL || 'https://api.sequenzy.com').replace(/\/$/, '')}/api/v1`;
}

async function triggerEvent({ email, event, properties, customAttributes }) {
  const response = await axios.post(
    `${getBaseUrl()}/subscribers/events`,
    {
      email,
      event,
      properties,
      customAttributes
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SEQUENZY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  return response.data;
}

module.exports = {
  EVENTS,
  getBaseUrl,
  isConfigured,
  triggerEvent
};
