const nodemailer = require('nodemailer');
const unsubscribeService = require('./unsubscribeService');

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

class EmailService {
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
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
          <tr>
            <td align="center" style="padding: 40px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="520" style="max-width: 520px;">
                <!-- Logo -->
                <tr>
                  <td style="padding: 0 0 32px 0; text-align: center;">
                    <span style="font-size: 22px; font-weight: 700; color: #18181b; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">TradeTally</span>
                  </td>
                </tr>
                <!-- Card -->
                <tr>
                  <td style="background-color: #ffffff; border-radius: 12px; padding: 40px 36px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    ${content}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 28px 0 0 0; text-align: center;">
                    <p style="color: #a1a1aa; font-size: 12px; line-height: 1.6; margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      <a href="https://tradetally.io" style="color: #a1a1aa; text-decoration: none;">TradeTally</a>
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
      background-color: #18181b;
      color: #ffffff;
      padding: 12px 28px;
      text-decoration: none;
      border-radius: 8px;
      display: inline-block;
      font-weight: 600;
      font-size: 14px;
      text-align: center;
      border: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    `;
  }

  static getSecondaryButtonStyle() {
    return `
      background-color: #ffffff;
      color: #18181b;
      padding: 12px 28px;
      text-decoration: none;
      border-radius: 8px;
      display: inline-block;
      font-weight: 600;
      font-size: 14px;
      text-align: center;
      border: 1px solid #e4e4e7;
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
    } catch (error) {
      console.error('Failed to send verification email:', error);
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
    } catch (error) {
      console.error('Failed to send password reset email:', error);
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
    } catch (error) {
      console.error('Failed to send email change verification email:', error);
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

    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        ${isExpired ? 'Your Pro trial has ended' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left on your trial`}
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${username},
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
    } catch (error) {
      console.error(`Error sending trial ${isExpired ? 'expiration' : 'reminder'} email:`, error);
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
    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Your week in trades
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${username}, here's your 7-day summary.
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
    const mailOptions = {
      from: { name: 'TradeTally', address: process.env.EMAIL_FROM || 'noreply@tradetally.io' },
      to: email,
      subject: `${tradeCount} trades this week - TradeTally`,
      html: this.getBaseTemplate('Your Week in Trades', content),
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
    } catch (error) {
      console.error('Error sending weekly digest to', maskEmail(email), error);
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
    const content = `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Your journal is waiting
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${username}, it's been ${daysInactive} days since your last visit. Your trades and analytics are right where you left them.
      </p>

      <div style="text-align: center; margin: 0 0 8px 0;">
        <a href="${loginUrl}" style="${this.getButtonStyle()}">Log In</a>
      </div>
      ${this.getMarketingFooter(unsubscribeUrl)}
    `;
    const mailOptions = {
      from: { name: 'TradeTally', address: process.env.EMAIL_FROM || 'noreply@tradetally.io' },
      to: email,
      subject: `Your journal is waiting - TradeTally`,
      html: this.getBaseTemplate('Your journal is waiting', content),
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
    } catch (error) {
      console.error('Error sending re-engagement email to', maskEmail(email), error);
      throw error;
    }
  }
}

module.exports = EmailService;
