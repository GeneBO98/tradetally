const nodemailer = require('nodemailer');

class EmailService {
  static createTransporter() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  static isConfigured() {
    return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
  }

  static getBaseTemplate(title, content) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
            <div style="color: #ffffff; font-size: 32px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 12px;">
              <img src="https://zipline.id10tips.com/u/tradetally-favicon.svg" alt="TradeTally" style="width: 32px; height: 32px; vertical-align: middle;" />
              TradeTally
            </div>
            <div style="color: #e2e8f0; font-size: 16px; font-weight: 300;">
              Smart Trading Analytics
            </div>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            ${content}
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <div style="color: #64748b; font-size: 14px; margin-bottom: 15px;">
              <strong>TradeTally</strong> - Empowering traders with intelligent analytics
            </div>
            <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
              This email was sent to you because you have an account with TradeTally.<br>
              If you have any questions, contact us at <a href="mailto:support@tradetally.io" style="color: #667eea; text-decoration: none;">support@tradetally.io</a>
            </div>
            <div style="margin-top: 20px;">
              <a href="https://tradetally.io" style="color: #667eea; text-decoration: none; font-size: 12px;">Visit TradeTally</a>
              <span style="color: #cbd5e1; margin: 0 8px;">|</span>
              <a href="https://tradetally.io/privacy" style="color: #667eea; text-decoration: none; font-size: 12px;">Privacy Policy</a>
              <span style="color: #cbd5e1; margin: 0 8px;">|</span>
              <a href="https://tradetally.io/terms" style="color: #667eea; text-decoration: none; font-size: 12px;">Terms of Service</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static getButtonStyle() {
    return `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 8px;
      display: inline-block;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
      transition: all 0.2s ease;
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
      from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
      to: email,
      subject: '📊 Welcome to TradeTally - Verify Your Account',
      html: this.getBaseTemplate('Verify Your TradeTally Account', content)
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
      from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
      to: email,
      subject: '🔐 Reset Your TradeTally Password',
      html: this.getBaseTemplate('Reset Your TradeTally Password', content)
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
      from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
      to: email,
      subject: '📧 Verify Your New Email Address - TradeTally',
      html: this.getBaseTemplate('Verify Your New Email Address', content)
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
            ? 'Your 14-day Pro trial has come to an end. We hope you enjoyed exploring our advanced trading analytics features!'
            : `Your Pro trial will expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Don't lose access to your favorite features!`
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
            ${isExpired ? 'Subscribe to Pro' : 'Upgrade Before Trial Ends'}
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0; text-align: center;">
          Questions? Reply to this email or contact our support team.
        </p>
      </div>
      
      ${!isExpired ? `
      <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 25px 0;">
        <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
          ⏰ Your trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. After that, you'll lose access to Pro features.
        </p>
      </div>
      ` : ''}
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 25px 0 0 0;">
        Thank you for trying TradeTally Pro. We're here to help you make better trading decisions! 📈
      </p>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
      to: email,
      subject: `${isExpired ? '🚀 Your TradeTally Trial Ended' : `⏰ ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Left`} - TradeTally Pro`,
      html: this.getBaseTemplate(
        `${isExpired ? 'Trial Ended' : 'Trial Expiring'} - TradeTally`,
        content
      )
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