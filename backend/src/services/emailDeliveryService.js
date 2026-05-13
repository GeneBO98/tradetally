const axios = require('axios');
const nodemailer = require('nodemailer');

function getEmailProvider() {
  return (process.env.EMAIL_PROVIDER || 'sequenzy').trim().toLowerCase();
}

function formatAddress(address) {
  if (!address) return undefined;
  if (typeof address === 'string') return address;
  if (typeof address === 'object' && address.address) {
    return address.name ? `${address.name} <${address.address}>` : address.address;
  }
  return undefined;
}

function createSmtpTransporter() {
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    dkim: process.env.DKIM_PRIVATE_KEY ? {
      domainName: process.env.EMAIL_DOMAIN || 'tradetally.io',
      keySelector: process.env.DKIM_SELECTOR || 'default',
      privateKey: process.env.DKIM_PRIVATE_KEY
    } : undefined,
    headers: {
      'X-Mailer': 'TradeTally Email Service',
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      Importance: 'Normal'
    }
  });
}

function isSmtpConfigured() {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function isSequenzyConfigured() {
  return !!process.env.SEQUENZY_API_KEY;
}

function isConfigured() {
  return getEmailProvider() === 'sequenzy' && isSequenzyConfigured();
}

function normalizeAddresses(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.map(item => formatAddress(item)).filter(Boolean);
  }

  const normalized = formatAddress(value);
  return normalized ? [normalized] : undefined;
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  return attachments.map(attachment => {
    const normalized = { filename: attachment.filename };

    if (attachment.path) {
      normalized.path = attachment.path;
    } else if (attachment.content) {
      normalized.content = Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : attachment.content;
    }

    return normalized;
  });
}

async function sendViaSequenzy(mailOptions) {
  const url = `${(process.env.SEQUENZY_API_BASE_URL || 'https://api.sequenzy.com').replace(/\/$/, '')}/api/v1/transactional/send`;
  const payload = {
    to: normalizeAddresses(mailOptions.to),
    cc: normalizeAddresses(mailOptions.cc),
    bcc: normalizeAddresses(mailOptions.bcc),
    slug: mailOptions.slug,
    subject: mailOptions.subject,
    body: mailOptions.html,
    preview: mailOptions.preview,
    variables: mailOptions.variables,
    from: formatAddress(mailOptions.from),
    replyTo: formatAddress(mailOptions.replyTo),
    attachments: normalizeAttachments(mailOptions.attachments)
  };

  Object.keys(payload).forEach(key => {
    if (payload[key] == null) {
      delete payload[key];
    }
  });

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${process.env.SEQUENZY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  return response.data;
}

async function sendMail(mailOptions) {
  const provider = getEmailProvider();

  if (provider === 'sequenzy') {
    return sendViaSequenzy(mailOptions);
  }

  throw new Error(`Unsupported email provider "${provider}" in tradetally-cloud. Use EMAIL_PROVIDER=sequenzy.`);
}

module.exports = {
  createSmtpTransporter,
  getEmailProvider,
  isConfigured,
  isSequenzyConfigured,
  isSmtpConfigured,
  sendMail
};
