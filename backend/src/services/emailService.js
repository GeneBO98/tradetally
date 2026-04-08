const nodemailer = require('nodemailer');
const crypto = require('crypto');
const unsubscribeService = require('./unsubscribeService');
const escapeHtml = require('../utils/escapeHtml');
const { loadTemplate, renderTemplate } = require('../utils/emailTemplateLoader');
const db = require('../config/database');

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

class EmailService {
  static async logEmail({ recipient, subject, emailType, htmlBody, textBody, status, errorMessage, userId, metadata }) {
    try {
      await db.query(
        `INSERT INTO email_log (recipient, subject, email_type, html_body, text_body, status, error_message, user_id, metadata, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END)`,
        [recipient, subject, emailType, htmlBody, textBody, status || 'sent', errorMessage || null, userId || null, JSON.stringify(metadata || {})]
      );
    } catch (err) {
      console.error('Failed to log email:', err.message);
    }
  }
  static createTransporter() {
    const port = parseInt(process.env.EMAIL_PORT) || 587;
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: port,
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
        'Importance': 'Normal'
      }
    });
  }

  static isConfigured() {
    return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
  }

  static getBaseTemplate(title, content) {
    return `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <title>${title}</title>
        <!--[if mso]>
        <noscript>
          <xml>
            <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
          </xml>
        </noscript>
        <![endif]-->
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#f4f4f5" style="width: 100%; background-color: #f4f4f5; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          <tr>
            <td align="center" style="padding: 40px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="520" style="width: 100%; max-width: 520px; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <!-- Logo -->
                <tr>
                  <td style="padding: 0 0 32px 0; text-align: center;">
                    <span style="font-size: 22px; font-weight: 700; color: #F0812A; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">TradeTally</span>
                  </td>
                </tr>
                <!-- Card -->
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4e4e7; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 40px 36px;">
                          ${content}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 28px 0 0 0; text-align: center;">
                    <p style="color: #a1a1aa; font-size: 12px; line-height: 1.6; margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      <a href="https://tradetally.io" style="color: #F0812A; text-decoration: none; font-weight: 600;">TradeTally</a>
                      &nbsp;&middot;&nbsp;
                      <a href="https://tradetally.io/privacy" style="color: #a1a1aa; text-decoration: none;">Privacy</a>
                      &nbsp;&middot;&nbsp;
                      <a href="https://tradetally.io/terms" style="color: #a1a1aa; text-decoration: none;">Terms</a>
                    </p>
                    <p style="color: #d4d4d8; font-size: 11px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      You received this email because you have a TradeTally account.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  static getButtonStyle() {
    return `
      background-color: #F0812A;
      color: #ffffff;
      padding: 12px 28px;
      text-decoration: none;
      display: inline-block;
      font-weight: 600;
      font-size: 14px;
      line-height: 14px;
      text-align: center;
      border: none;
      border-radius: 8px;
      -webkit-border-radius: 8px;
      mso-border-alt: none;
      mso-padding-alt: 12px 28px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    `;
  }

  static getSecondaryButtonStyle() {
    return `
      background-color: #ffffff;
      color: #F0812A;
      padding: 12px 28px;
      text-decoration: none;
      border-radius: 8px;
      display: inline-block;
      font-weight: 600;
      font-size: 14px;
      text-align: center;
      border: 1px solid #fcd098;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    `;
  }

  /**
   * Generate a personalized unsubscribe URL for a user
   * @param {number} userId - The user's ID
   * @returns {string} The full unsubscribe URL with signed token
   */
  static getUnsubscribeUrl(userId) {
    const token = unsubscribeService.generateToken(userId);
    const baseUrl = process.env.FRONTEND_URL || 'https://tradetally.io';
    return `${baseUrl}/unsubscribe?token=${token}`;
  }

  /**
   * Get marketing email footer with visible unsubscribe link
   * @param {string} unsubscribeUrl - The personalized unsubscribe URL
   * @returns {string} HTML footer content
   */
  static getMarketingFooter(unsubscribeUrl) {
    return `
      <p style="color: #a1a1aa; font-size: 11px; margin: 24px 0 0 0; padding-top: 20px; border-top: 1px solid #f4f4f5; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        You're receiving this because you opted into marketing emails.
        <a href="${unsubscribeUrl}" style="color: #71717a; text-decoration: underline;">Unsubscribe</a>
      </p>
    `;
  }

  /**
   * Record an email send in the email_engagement table and return tracking ID
   */
  static async recordEmailEngagement(userId, emailType, metadata = {}) {
    try {
      const trackingId = crypto.randomUUID();
      await db.query(`
        INSERT INTO email_engagement (user_id, email_type, tracking_id, metadata)
        VALUES ($1, $2, $3, $4)
      `, [userId, emailType, trackingId, JSON.stringify(metadata)]);
      return trackingId;
    } catch (err) {
      console.error('[EMAIL_TRACKING] Failed to record email engagement:', err.message);
      return null;
    }
  }

  /**
   * Inject tracking pixel into email HTML (before closing </body> or at end)
   */
  static injectTrackingPixel(html, trackingId) {
    if (!trackingId) return html;
    const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || '';
    if (!baseUrl) return html;

    const pixel = `<img src="${baseUrl}/api/email-track/open/${trackingId}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;

    if (html.includes('</body>')) {
      return html.replace('</body>', `${pixel}</body>`);
    }
    return html + pixel;
  }

  /**
   * Wrap a CTA URL with click tracking redirect
   */
  static wrapClickUrl(url, trackingId) {
    if (!trackingId || !url) return url;
    const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || '';
    if (!baseUrl) return url;
    return `${baseUrl}/api/email-track/click/${trackingId}?url=${encodeURIComponent(url)}`;
  }

  static async sendVerificationEmail(email, token) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping verification email');
      return;
    }

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${token}`;

    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Verify your email
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Welcome to TradeTally. Confirm your email address to get started with your trading journal.
      </p>

      <div style="text-align: center; margin: 0 0 28px 0;">
        <a href="${verificationUrl}" style="${this.getButtonStyle()}">
          Verify Email Address
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0 0 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        This link expires in 24 hours. If you didn't create this account, ignore this email.
      </p>
      <p style="color: #a1a1aa; font-size: 12px; margin: 16px 0 0 0; word-break: break-all; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${verificationUrl}
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Verify your email - TradeTally',
      html: this.getBaseTemplate('Verify Your TradeTally Account', content),
      text: `Welcome to TradeTally! Please verify your email address by visiting: ${verificationUrl}`,
      headers: {
        'X-Entity-Ref-ID': `verify-${Date.now()}`,
        'Message-ID': `<verify-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Verification email sent to:', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'verification', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent' });
    } catch (error) {
      console.error('Failed to send verification email:', error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'verification', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message });
    }
  }

  static async sendPasswordResetEmail(email, token) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping password reset email');
      return;
    }

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;

    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Reset your password
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        We received a request to reset the password for your TradeTally account.
      </p>

      <div style="text-align: center; margin: 0 0 28px 0;">
        <a href="${resetUrl}" style="${this.getButtonStyle()}">
          Reset Password
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0 0 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
      <p style="color: #a1a1aa; font-size: 12px; margin: 16px 0 0 0; word-break: break-all; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${resetUrl}
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Reset your password - TradeTally',
      html: this.getBaseTemplate('Reset Your TradeTally Password', content),
      text: `Reset your TradeTally password by visiting: ${resetUrl}`,
      headers: {
        'X-Entity-Ref-ID': `reset-${Date.now()}`,
        'Message-ID': `<reset-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Password reset email sent to:', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'password_reset', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent' });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'password_reset', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message });
    }
  }

  static async sendEmailChangeVerification(email, token) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping email change verification');
      return;
    }

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${token}`;

    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Confirm your new email
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        You requested to change the email address on your TradeTally account. Confirm this is your new address.
      </p>

      <div style="text-align: center; margin: 0 0 28px 0;">
        <a href="${verificationUrl}" style="${this.getButtonStyle()}">
          Verify New Email
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0 0 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        This link expires in 24 hours. If you didn't request this change, contact support immediately.
      </p>
      <p style="color: #a1a1aa; font-size: 12px; margin: 16px 0 0 0; word-break: break-all; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${verificationUrl}
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Confirm your new email - TradeTally',
      html: this.getBaseTemplate('Verify Your New Email Address', content),
      text: `Verify your new TradeTally email address by visiting: ${verificationUrl}`,
      headers: {
        'X-Entity-Ref-ID': `email-change-${Date.now()}`,
        'Message-ID': `<email-change-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Email change verification email sent to:', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'email_change', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent' });
    } catch (error) {
      console.error('Failed to send email change verification email:', error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'email_change', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message });
      throw error;
    }
  }

  static async sendTrialExpirationEmail(email, username, daysRemaining = 0) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping trial expiration email');
      return;
    }

    const isExpired = daysRemaining <= 0;
    const pricingUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`;
    const safeUsername = escapeHtml(username);

    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${isExpired ? 'Your Pro trial has ended' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left on your trial`}
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${safeUsername},
      </p>
      <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${isExpired
          ? 'Your 14-day Pro trial has ended. You can continue using TradeTally on the free plan, or upgrade to keep Pro features like behavioral analytics, price alerts, and enhanced charts.'
          : `Your Pro trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Upgrade to keep access to behavioral analytics, price alerts, and enhanced charts.`
        }
      </p>

      <div style="text-align: center; margin: 0 0 28px 0;">
        <a href="${pricingUrl}" style="${this.getButtonStyle()}">
          ${isExpired ? 'View Plans' : 'Upgrade Now'}
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${isExpired
          ? 'Your free plan includes unlimited trade storage, CSV import, and basic analytics.'
          : 'After your trial ends, you\'ll return to the free plan with unlimited trade storage.'
        }
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: `${isExpired ? 'Your Pro trial ended' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left on your trial`} - TradeTally`,
      html: this.getBaseTemplate(
        `${isExpired ? 'Trial Ended' : 'Trial Expiring'} - TradeTally`,
        content
      ),
      text: `${isExpired ? 'Your TradeTally trial has ended.' : `Your TradeTally trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`} Visit ${pricingUrl} to continue with Pro features.`,
      headers: {
        'X-Entity-Ref-ID': `trial-${isExpired ? 'expired' : 'reminder'}-${Date.now()}`,
        'Message-ID': `<trial-${isExpired ? 'expired' : 'reminder'}-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`Trial ${isExpired ? 'expiration' : 'reminder'} email sent successfully to ${maskEmail(email)}`);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'trial_expiration', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', metadata: { daysRemaining, isExpired } });
    } catch (error) {
      console.error(`Error sending trial ${isExpired ? 'expiration' : 'reminder'} email:`, error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'trial_expiration', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message });
      throw error;
    }
  }

  /**
   * Send weekly digest: "Your week in trades" (trade count, P&L summary, link to dashboard)
   * @param {string} email - Recipient email
   * @param {string} username - Username for greeting
   * @param {object} options - tradeCount, totalPnL, dashboardUrl
   * @param {number} userId - User ID for personalized unsubscribe link
   */
  static async sendWeeklyDigestEmail(email, username, { tradeCount, totalPnL, dashboardUrl }, userId) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping weekly digest');
      return;
    }
    const url = dashboardUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`;
    const pnlFormatted = totalPnL != null ? `$${Number(totalPnL).toFixed(2)}` : '$0.00';
    const pnlColor = totalPnL >= 0 ? '#16a34a' : '#dc2626';
    const unsubscribeUrl = userId ? this.getUnsubscribeUrl(userId) : `${process.env.FRONTEND_URL || 'https://tradetally.io'}/settings`;
    const safeUsername = escapeHtml(username);
    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Your week in trades
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${safeUsername}, here's your 7-day summary.
      </p>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 28px 0;">
        <tr>
          <td style="padding: 16px 20px; background-color: #fafafa; border-radius: 8px 0 0 8px; border-right: 1px solid #f4f4f5; width: 50%; text-align: center;">
            <p style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Trades</p>
            <p style="color: #18181b; font-size: 26px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${tradeCount}</p>
          </td>
          <td style="padding: 16px 20px; background-color: #fafafa; border-radius: 0 8px 8px 0; width: 50%; text-align: center;">
            <p style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">P&L</p>
            <p style="color: ${pnlColor}; font-size: 26px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${pnlFormatted}</p>
          </td>
        </tr>
      </table>

      <div style="text-align: center; margin: 0 0 8px 0;">
        <a href="${url}" style="${this.getButtonStyle()}">View Dashboard</a>
      </div>
      ${this.getMarketingFooter(unsubscribeUrl)}
    `;
    // Record email engagement and inject tracking
    const trackingId = userId ? await this.recordEmailEngagement(userId, 'weekly_digest', { tradeCount, totalPnL }) : null;
    let html = this.getBaseTemplate('Your Week in Trades', content);
    html = this.injectTrackingPixel(html, trackingId);

    const mailOptions = {
      from: { name: 'TradeTally', address: process.env.EMAIL_FROM || 'noreply@tradetally.io' },
      to: email,
      subject: `${tradeCount} trades this week - TradeTally`,
      html,
      text: `Your week: ${tradeCount} trades, P&L ${pnlFormatted}. View dashboard: ${url}. Unsubscribe: ${unsubscribeUrl}`,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `weekly-digest-${Date.now()}`,
        'Message-ID': `<weekly-digest-${Date.now()}@tradetally.io>`
      }
    };
    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Weekly digest sent to', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'weekly_digest', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', userId, metadata: { tradeCount, totalPnL } });
    } catch (error) {
      console.error('Error sending weekly digest to', maskEmail(email), error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'weekly_digest', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message, userId });
      throw error;
    }
  }

  /**
   * Send re-engagement email to inactive users (no login in N days)
   * @param {string} email - Recipient email
   * @param {string} username - Username for greeting
   * @param {number} daysInactive - Number of days since last login
   * @param {number} userId - User ID for personalized unsubscribe link
   */
  static async sendInactiveReengagementEmail(email, username, daysInactive, userId) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping re-engagement email');
      return;
    }
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    const unsubscribeUrl = userId ? this.getUnsubscribeUrl(userId) : `${process.env.FRONTEND_URL || 'https://tradetally.io'}/settings`;
    const safeUsername = escapeHtml(username);
    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Your journal is waiting
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${safeUsername}, it's been ${daysInactive} days since your last visit. Your trades and analytics are right where you left them.
      </p>

      <div style="text-align: center; margin: 0 0 8px 0;">
        <a href="${loginUrl}" style="${this.getButtonStyle()}">Log In</a>
      </div>
      ${this.getMarketingFooter(unsubscribeUrl)}
    `;
    // Record email engagement and inject tracking
    const trackingId = userId ? await this.recordEmailEngagement(userId, 'reengagement', { daysInactive }) : null;
    let html = this.getBaseTemplate('Your journal is waiting', content);
    html = this.injectTrackingPixel(html, trackingId);

    const mailOptions = {
      from: { name: 'TradeTally', address: process.env.EMAIL_FROM || 'noreply@tradetally.io' },
      to: email,
      subject: `Your journal is waiting - TradeTally`,
      html,
      text: `You haven't logged in for ${daysInactive} days. Log in: ${loginUrl}. Unsubscribe: ${unsubscribeUrl}`,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `reengagement-${Date.now()}`,
        'Message-ID': `<reengagement-${Date.now()}@tradetally.io>`
      }
    };
    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Re-engagement email sent to', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'reengagement', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', userId, metadata: { daysInactive } });
    } catch (error) {
      console.error('Error sending re-engagement email to', maskEmail(email), error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'reengagement', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message, userId });
      throw error;
    }
  }
  /**
   * Send trial conversion email to users whose Pro trial expired without subscribing.
   * @param {string} email - Recipient email
   * @param {string} username - Username for greeting
   * @param {object} metrics - { totalTrades, winRate, totalPnL, topSymbol, brokersUsed, trialType, daysSinceExpiry }
   * @param {number} userId - User ID for personalized unsubscribe link
   */
  static async sendTrialConversionEmail(email, username, metrics, userId) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping trial conversion email');
      return;
    }

    const upgradeUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings`;
    const unsubscribeUrl = userId ? this.getUnsubscribeUrl(userId) : `${process.env.FRONTEND_URL || 'https://tradetally.io'}/settings`;
    const safeUsername = escapeHtml(username);

    // Determine engagement tier
    const tier = metrics.totalTrades >= 20 ? 'high'
      : metrics.totalTrades >= 5 ? 'medium'
      : metrics.totalTrades > 0 ? 'low'
      : 'never_imported';

    // Build headline and messaging per tier
    let headline, greeting, bodyText, ctaText, subject;
    const pnlFormatted = metrics.totalPnL != null ? `$${Number(metrics.totalPnL).toFixed(2)}` : '$0.00';
    const winRateFormatted = metrics.winRate != null ? `${Number(metrics.winRate).toFixed(1)}%` : 'N/A';

    switch (tier) {
      case 'high':
        headline = 'Your trading data deserves Pro analytics';
        greeting = `Hi ${safeUsername}, during your trial you imported ${metrics.totalTrades} trades with a ${winRateFormatted} win rate. That's serious activity.`;
        bodyText = `Your ${pnlFormatted} P&L and insights on ${escapeHtml(metrics.topSymbol || 'your top symbols')} are still available — upgrade to keep advanced analytics, unlimited imports, and full journaling features.`;
        ctaText = 'Upgrade to Pro';
        subject = `${metrics.totalTrades} trades tracked — keep your Pro analytics`;
        break;
      case 'medium':
        headline = 'Your trial insights are waiting';
        greeting = `Hi ${safeUsername}, you tracked ${metrics.totalTrades} trades during your trial — nice start!`;
        bodyText = `With Pro, you'll keep access to detailed analytics, unlimited broker imports${metrics.brokersUsed ? ` (including ${escapeHtml(metrics.brokersUsed)})` : ''}, and everything you need to improve your edge.`;
        ctaText = 'Continue with Pro';
        subject = 'Your trial insights are waiting — TradeTally';
        break;
      case 'low':
        headline = 'Pick up where you left off';
        greeting = `Hi ${safeUsername}, you started importing trades during your trial but there's so much more to explore.`;
        bodyText = 'Pro gives you unlimited imports, advanced P&L analytics, win rate tracking, and broker integrations to make journaling effortless.';
        ctaText = 'Explore Pro Features';
        subject = 'Pick up where you left off — TradeTally';
        break;
      default: // never_imported
        headline = 'You haven\'t tried the best part yet';
        greeting = `Hi ${safeUsername}, your Pro trial ended but you haven't imported any trades yet.`;
        bodyText = 'Import your first trades and see what TradeTally can do — detailed analytics, automatic broker parsing, and insights that help you trade better.';
        ctaText = 'Start Your Pro Journey';
        subject = 'You haven\'t tried the best part — TradeTally';
        break;
    }

    // Build metrics block for high/medium engagement
    let metricsBlock = '';
    if (tier === 'high' || tier === 'medium') {
      const pnlColor = metrics.totalPnL >= 0 ? '#16a34a' : '#dc2626';
      metricsBlock = `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 28px 0;">
          <tr>
            <td style="padding: 16px 20px; background-color: #fafafa; border-radius: 8px 0 0 8px; border-right: 1px solid #f4f4f5; width: 33%; text-align: center;">
              <p style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Trades</p>
              <p style="color: #18181b; font-size: 26px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${metrics.totalTrades}</p>
            </td>
            <td style="padding: 16px 20px; background-color: #fafafa; border-right: 1px solid #f4f4f5; width: 33%; text-align: center;">
              <p style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Win Rate</p>
              <p style="color: #18181b; font-size: 26px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${winRateFormatted}</p>
            </td>
            <td style="padding: 16px 20px; background-color: #fafafa; border-radius: 0 8px 8px 0; width: 33%; text-align: center;">
              <p style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">P&amp;L</p>
              <p style="color: ${pnlColor}; font-size: 26px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${pnlFormatted}</p>
            </td>
          </tr>
        </table>`;
    }

    const footer = this.getMarketingFooter(unsubscribeUrl);

    // Try custom template, fall back to inline
    const templateHtml = loadTemplate('trial-conversion.html');
    let content;
    if (templateHtml) {
      content = renderTemplate(templateHtml, {
        headline,
        greeting,
        metricsBlock,
        bodyText,
        upgradeUrl,
        buttonStyle: this.getButtonStyle(),
        ctaText,
        footer
      });
    } else {
      content = `
        <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          ${headline}
        </h1>
        <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          ${greeting}
        </p>
        ${metricsBlock}
        <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          ${bodyText}
        </p>
        <div style="text-align: center; margin: 0 0 8px 0;">
          <a href="${upgradeUrl}" style="${this.getButtonStyle()}">${ctaText}</a>
        </div>
        ${footer}
      `;
    }

    // Record email engagement and inject tracking
    const trackingId = userId ? await this.recordEmailEngagement(userId, 'trial_conversion', { tier }) : null;
    let finalHtml = this.getBaseTemplate(headline, content);
    finalHtml = this.injectTrackingPixel(finalHtml, trackingId);

    const mailOptions = {
      from: { name: 'TradeTally', address: process.env.EMAIL_FROM || 'noreply@tradetally.io' },
      to: email,
      subject,
      html: finalHtml,
      text: `${greeting} ${bodyText} Upgrade: ${upgradeUrl} Unsubscribe: ${unsubscribeUrl}`,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `trial-conversion-${Date.now()}`,
        'Message-ID': `<trial-conversion-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Trial conversion email sent to', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'trial_conversion', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', userId, metadata: metrics });
    } catch (error) {
      console.error('Error sending trial conversion email to', maskEmail(email), error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'trial_conversion', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message, userId });
      throw error;
    }
  }
  /**
   * Send review request email to Pro subscribers ~30 days after subscribing.
   * Personal tone from Brennon. Sent once only.
   * @param {string} email - Recipient email
   * @param {string} username - Username for greeting
   * @param {string} reviewUrl - URL where user can leave a review
   * @param {number} userId - User ID for unsubscribe link and tracking
   */
  static async sendReviewRequestEmail(email, username, reviewUrl, userId) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping review request email');
      return;
    }

    const unsubscribeUrl = userId ? this.getUnsubscribeUrl(userId) : `${process.env.FRONTEND_URL || 'https://tradetally.io'}/settings`;
    const safeUsername = escapeHtml(username);
    const footer = this.getMarketingFooter(unsubscribeUrl);

    // Try custom template, fall back to inline
    const templateHtml = loadTemplate('review-request.html');
    let content;
    if (templateHtml) {
      content = renderTemplate(templateHtml, {
        greeting: `Hi ${safeUsername},`,
        reviewUrl,
        buttonStyle: this.getButtonStyle(),
        footer
      });
    } else {
      content = `
        <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          Hi ${safeUsername},
        </p>
        <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          You've been on TradeTally Pro for about a month now, so I wanted to check in.
        </p>
        <p style="color: #18181b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          How's it been for you so far?
        </p>
        <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          If TradeTally has been helpful, I'd love if you left a short review here:
        </p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 8px auto; border-collapse: separate;">
          <tr>
            <td align="center" bgcolor="#F0812A" style="background-color: #F0812A; border-radius: 8px; -webkit-border-radius: 8px;">
              <a href="${reviewUrl}" style="${this.getButtonStyle()}">Leave a Review</a>
            </td>
          </tr>
        </table>
        <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0 0 24px 0; text-align: center; word-break: break-all; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          ${reviewUrl}
        </p>
        <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          Even a sentence or two goes a long way.
        </p>
        <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          If you have feedback, feature requests, or anything that feels missing, just reply to this email. I read every response.
        </p>
        <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          Thanks,<br>
          Brennon<br>
          <span style="color: #a1a1aa;">TradeTally</span>
        </p>
        ${footer}
      `;
    }

    // Record email engagement and inject tracking
    const trackingId = userId ? await this.recordEmailEngagement(userId, 'review_request') : null;
    let html = this.getBaseTemplate('How\'s TradeTally Pro?', content);
    html = this.injectTrackingPixel(html, trackingId);

    const mailOptions = {
      from: { name: 'Brennon from TradeTally', address: process.env.EMAIL_FROM || 'noreply@tradetally.io' },
      replyTo: process.env.SUPPORT_EMAIL || 'support@tradetally.io',
      to: email,
      subject: 'How\'s TradeTally Pro been for you?',
      html,
      text: `Hi ${username}, you've been on TradeTally Pro for about a month now, so I wanted to check in. How's it been for you so far? If TradeTally has been helpful, I'd love if you left a short review here: ${reviewUrl}. Even a sentence or two goes a long way. If you have feedback, feature requests, or anything that feels missing, just reply to this email. I read every response. Thanks, Brennon. Unsubscribe: ${unsubscribeUrl}`,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `review-request-${Date.now()}`,
        'Message-ID': `<review-request-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('[SUCCESS] Review request email sent to', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'review_request', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', userId });
    } catch (error) {
      console.error('[ERROR] Error sending review request email to', maskEmail(email), error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'review_request', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message, userId });
      throw error;
    }
  }

  /**
   * Send welcome email when a user subscribes to a paid plan
   * @param {string} email - Recipient email
   * @param {string} username - Username for greeting
   * @param {string} planName - Plan name (e.g., "Pro Monthly", "Pro Yearly")
   */
  static async sendSubscriptionWelcomeEmail(email, username, planName) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping subscription welcome email');
      return;
    }

    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`;
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@tradetally.io';
    const safeUsername = escapeHtml(username);
    const safePlanName = escapeHtml(planName || 'Pro');

    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Welcome to TradeTally Pro
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${safeUsername},
      </p>
      <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Thank you for subscribing to ${safePlanName}. We genuinely appreciate your support and are glad to have you as a Pro member.
      </p>
      <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Everything Pro is now unlocked for you:
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 0 0 0 8px; color: #52525b; font-size: 15px; line-height: 2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            - Behavioral &amp; advanced analytics<br>
            - Unlimited broker imports &amp; sync<br>
            - Price alerts &amp; watchlists<br>
            - AI-powered trade insights<br>
            - Full API access
          </td>
        </tr>
      </table>

      <div style="background-color: #fafafa; border-radius: 8px; padding: 20px 24px; margin: 0 0 28px 0;">
        <p style="color: #18181b; font-size: 14px; font-weight: 600; margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          Priority support
        </p>
        <p style="color: #52525b; font-size: 14px; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          As a Pro subscriber, you get priority service for any issues or feature requests. Reach out anytime at <a href="mailto:${supportEmail}" style="color: #18181b; text-decoration: underline;">${supportEmail}</a> and we'll get back to you first.
        </p>
      </div>

      <div style="text-align: center; margin: 0 0 28px 0;">
        <a href="${dashboardUrl}" style="${this.getButtonStyle()}">
          Go to Dashboard
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        You can manage your subscription anytime from Settings > Billing.
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Welcome to TradeTally Pro',
      html: this.getBaseTemplate('Welcome to TradeTally Pro', content),
      text: `Hi ${username}, thank you for subscribing to ${planName || 'Pro'}. All Pro features are now unlocked. As a Pro subscriber, you get priority service for any issues or feature requests — reach out anytime at ${supportEmail}. Manage your subscription at Settings > Billing. Go to your dashboard: ${dashboardUrl}`,
      headers: {
        'X-Entity-Ref-ID': `subscription-welcome-${Date.now()}`,
        'Message-ID': `<subscription-welcome-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('[SUCCESS] Subscription welcome email sent to', maskEmail(email));
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'subscription_welcome', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', metadata: { planName } });
    } catch (error) {
      console.error('[ERROR] Error sending subscription welcome email to', maskEmail(email), error);
      await this.logEmail({ recipient: email, subject: mailOptions.subject, emailType: 'subscription_welcome', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message });
      throw error;
    }
  }
  static async sendSupportRequest({ to, userEmail, username, tier, subject, message }) {
    const safeUsername = escapeHtml(username || 'Unknown');
    const safeEmail = escapeHtml(userEmail);
    const safeTier = escapeHtml(tier);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    const content = `
      <h2 style="color: #18181b; font-size: 20px; margin: 0 0 16px 0;">Support Request</h2>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; color: #52525b;"><strong>From:</strong> ${safeUsername} (${safeEmail})</p>
        <p style="margin: 0 0 8px 0; color: #52525b;"><strong>Plan:</strong> ${safeTier}</p>
        <p style="margin: 0; color: #52525b;"><strong>Subject:</strong> ${safeSubject}</p>
      </div>
      <div style="color: #3f3f46; line-height: 1.6;">
        ${safeMessage}
      </div>
    `;

    const html = this.getBaseTemplate(`[Support] ${subject}`, content);

    const mailOptions = {
      from: {
        name: 'TradeTally Support',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      replyTo: userEmail,
      to: to,
      subject: `[Support] [${tier}] ${subject}`,
      html: html,
      text: `Support Request\n\nFrom: ${username} (${userEmail})\nPlan: ${tier}\nSubject: ${subject}\n\n${message}`
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('[SUCCESS] Support request email sent from', maskEmail(userEmail));
      await this.logEmail({ recipient: to, subject: mailOptions.subject, emailType: 'support_request', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'sent', metadata: { userEmail, tier } });
    } catch (error) {
      console.error('[ERROR] Error sending support request email:', error);
      await this.logEmail({ recipient: to, subject: mailOptions.subject, emailType: 'support_request', htmlBody: mailOptions.html, textBody: mailOptions.text, status: 'failed', errorMessage: error.message });
      throw error;
    }
  }
}

module.exports = EmailService;
