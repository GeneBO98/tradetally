const nodemailer = require('nodemailer');

class EmailService {
  static createTransporter() {
    const port = parseInt(process.env.EMAIL_PORT) || 587;
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: port,
      secure: port === 465, // Use SSL for port 465, TLS for others
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      // Add authentication headers to improve deliverability
      dkim: process.env.DKIM_PRIVATE_KEY ? {
        domainName: process.env.EMAIL_DOMAIN || 'tradetally.io',
        keySelector: process.env.DKIM_SELECTOR || 'default',
        privateKey: process.env.DKIM_PRIVATE_KEY
      } : undefined,
      // Additional headers for better deliverability
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
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff;">
                <!-- Header -->
                <tr>
                  <td style="background-color: #667eea; padding: 40px 20px; text-align: center;">
                    <h1 style="color: #ffffff; font-size: 32px; font-weight: bold; margin: 0 0 8px 0; font-family: Arial, sans-serif;">
                      TradeTally
                    </h1>
                    <p style="color: #e2e8f0; font-size: 16px; margin: 0; font-family: Arial, sans-serif;">
                      Smart Trading Analytics
                    </p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    ${content}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="color: #64748b; font-size: 14px; margin: 0 0 15px 0; font-family: Arial, sans-serif;">
                      <strong>TradeTally</strong> - Empowering traders with intelligent analytics
                    </p>
                    <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0 0 20px 0; font-family: Arial, sans-serif;">
                      This email was sent to you because you have an account with TradeTally.<br>
                      If you have any questions, contact us at <a href="mailto:support@tradetally.io" style="color: #667eea; text-decoration: none;">support@tradetally.io</a>
                    </p>
                    <p style="margin: 0; font-family: Arial, sans-serif;">
                      <a href="https://tradetally.io" style="color: #667eea; text-decoration: none; font-size: 12px;">Visit TradeTally</a>
                      <span style="color: #cbd5e1; margin: 0 8px;">|</span>
                      <a href="https://tradetally.io/privacy" style="color: #667eea; text-decoration: none; font-size: 12px;">Privacy Policy</a>
                      <span style="color: #cbd5e1; margin: 0 8px;">|</span>
                      <a href="https://tradetally.io/terms" style="color: #667eea; text-decoration: none; font-size: 12px;">Terms of Service</a>
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
      background-color: #667eea;
      color: #ffffff;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      border: none;
    `;
  }

  static async sendVerificationEmail(email, token) {
    if (!this.isConfigured()) {
      console.log('Email not configured, skipping verification email');
      return;
    }

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${token}`;
    
    const content = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1e293b; font-size: 28px; margin: 0 0 16px 0; font-weight: 700;">
          Welcome to TradeTally! 🎉
        </h1>
        <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0;">
          Thank you for joining our community of smart traders
        </p>
      </div>
      
      <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; border-left: 4px solid #667eea; margin: 30px 0;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          To get started with TradeTally and unlock powerful trading analytics, please verify your email address:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="${this.getButtonStyle()}">
            Verify Email Address
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0;">
          Or copy and paste this link into your browser:<br>
          <span style="word-break: break-all; color: #667eea;">${verificationUrl}</span>
        </p>
      </div>
      
      <div style="background-color: #fef3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 25px 0;">
        <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
          ⚠️ This verification link will expire in 24 hours for security reasons.
        </p>
      </div>
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 25px 0 0 0;">
        If you didn't create an account with TradeTally, you can safely ignore this email.
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Welcome to TradeTally - Verify Your Account',
      html: this.getBaseTemplate('Verify Your TradeTally Account', content),
      text: `Welcome to TradeTally! Please verify your email address by visiting: ${verificationUrl}`,
      headers: {
        'List-Unsubscribe': `<${process.env.FRONTEND_URL}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `verify-${Date.now()}`,
        'Message-ID': `<verify-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Verification email sent to:', email);
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
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1e293b; font-size: 28px; margin: 0 0 16px 0; font-weight: 700;">
          Reset Your Password 🔐
        </h1>
        <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0;">
          Secure your TradeTally account with a new password
        </p>
      </div>
      
      <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; border-left: 4px solid #667eea; margin: 30px 0;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          You requested to reset your password for your TradeTally account. Click the button below to create a new password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="${this.getButtonStyle()}">
            Reset Password
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0;">
          Or copy and paste this link into your browser:<br>
          <span style="word-break: break-all; color: #667eea;">${resetUrl}</span>
        </p>
      </div>
      
      <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 25px 0;">
        <p style="color: #dc2626; font-size: 14px; margin: 0; font-weight: 500;">
          🔒 This reset link will expire in 1 hour for security reasons.
        </p>
      </div>
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 25px 0 0 0;">
        If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Reset Your TradeTally Password',
      html: this.getBaseTemplate('Reset Your TradeTally Password', content),
      text: `Reset your TradeTally password by visiting: ${resetUrl}`,
      headers: {
        'List-Unsubscribe': `<${process.env.FRONTEND_URL}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `reset-${Date.now()}`,
        'Message-ID': `<reset-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Password reset email sent to:', email);
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
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1e293b; font-size: 28px; margin: 0 0 16px 0; font-weight: 700;">
          Verify Email Change 📧
        </h1>
        <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0;">
          Confirm your new email address for TradeTally
        </p>
      </div>
      
      <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; border-left: 4px solid #667eea; margin: 30px 0;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          You have requested to change your email address for your TradeTally account. Please verify your new email address:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="${this.getButtonStyle()}">
            Verify New Email Address
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0;">
          Or copy and paste this link into your browser:<br>
          <span style="word-break: break-all; color: #667eea;">${verificationUrl}</span>
        </p>
      </div>
      
      <div style="background-color: #fef3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 25px 0;">
        <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
          ⚠️ This verification link will expire in 24 hours for security reasons.
        </p>
      </div>
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 25px 0 0 0;">
        If you didn't request this email change, please contact support immediately.
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: 'Verify Your New Email Address - TradeTally',
      html: this.getBaseTemplate('Verify Your New Email Address', content),
      text: `Verify your new TradeTally email address by visiting: ${verificationUrl}`,
      headers: {
        'List-Unsubscribe': `<${process.env.FRONTEND_URL}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `email-change-${Date.now()}`,
        'Message-ID': `<email-change-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log('Email change verification email sent to:', email);
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
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1e293b; font-size: 28px; margin: 0 0 16px 0; font-weight: 700;">
          ${isExpired ? 'Your Free Trial Has Ended' : `${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Left in Your Trial`} 🚀
        </h1>
        <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0;">
          ${isExpired ? 'Continue your trading analytics journey' : 'Don\'t miss out on Pro features'}
        </p>
      </div>
      
      <div style="background-color: #f8fafc; padding: 30px; border-radius: 12px; border-left: 4px solid #667eea; margin: 30px 0;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Hi ${username},
        </p>
        
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          ${isExpired 
            ? 'Your 14-day Pro trial has ended. Thank you for exploring our advanced trading analytics features.'
            : `Your Pro trial will expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. To continue using Pro features, please consider upgrading your account.`
          }
        </p>
        
        <div style="background-color: #e0f2fe; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #0277bd; font-size: 18px; margin: 0 0 12px 0; font-weight: 600;">
            Pro Features You've Been Using:
          </h3>
          <ul style="color: #01579b; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
            <li>Advanced behavioral analytics (revenge trading, overconfidence detection)</li>
            <li>Price alerts and watchlists</li>
            <li>Real-time notifications</li>
            <li>Enhanced charts and news enrichment</li>
            <li>Unlimited data export</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${pricingUrl}" style="${this.getButtonStyle()}">
            ${isExpired ? 'View Pro Plans' : 'View Upgrade Options'}
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0; text-align: center;">
          Questions? Reply to this email or contact our support team.
        </p>
      </div>
      
      ${!isExpired ? `
      <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin: 25px 0;">
        <p style="color: #0c4a6e; font-size: 14px; margin: 0; font-weight: 500;">
          Your trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. After that, you'll return to the free plan.
        </p>
      </div>
      ` : ''}
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 25px 0 0 0;">
        Thank you for trying TradeTally Pro. We're here to help you make better trading decisions! 📈
      </p>
    `;

    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: process.env.EMAIL_FROM || 'noreply@tradetally.io'
      },
      to: email,
      subject: `${isExpired ? 'Your TradeTally Trial Ended' : `${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Left in Your Trial`} - TradeTally Pro`,
      html: this.getBaseTemplate(
        `${isExpired ? 'Trial Ended' : 'Trial Expiring'} - TradeTally`,
        content
      ),
      text: `${isExpired ? 'Your TradeTally trial has ended.' : `Your TradeTally trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`} Visit ${pricingUrl} to continue with Pro features.`,
      headers: {
        'List-Unsubscribe': `<${process.env.FRONTEND_URL}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `trial-${isExpired ? 'expired' : 'reminder'}-${Date.now()}`,
        'Message-ID': `<trial-${isExpired ? 'expired' : 'reminder'}-${Date.now()}@tradetally.io>`
      }
    };

    try {
      const transporter = this.createTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`Trial ${isExpired ? 'expiration' : 'reminder'} email sent successfully to ${email}`);
    } catch (error) {
      console.error(`Error sending trial ${isExpired ? 'expiration' : 'reminder'} email:`, error);
      throw error;
    }
  }
}

module.exports = EmailService;