const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const db = require('../config/database');
const crypto = require('crypto');

const twoFactorController = {
  // Generate 2FA setup (secret and QR code)
  async generateSetup(req, res, next) {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email;
      
      // Check if 2FA is already enabled
      const user = await db.query('SELECT two_factor_enabled FROM users WHERE id = $1', [userId]);
      if (user.rows[0]?.two_factor_enabled) {
        return res.status(400).json({ error: '2FA is already enabled for this account' });
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `TradeTally (${userEmail})`,
        issuer: 'TradeTally'
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      // Generate backup codes
      const backupCodes = [];
      for (let i = 0; i < 10; i++) {
        const code = Math.random().toString(36).substr(2, 8).toUpperCase();
        backupCodes.push(code);
      }

      // Store temporary secret (not enabled yet)
      await db.query(
        'UPDATE users SET two_factor_secret = $1 WHERE id = $2',
        [secret.base32, userId]
      );

      res.json({
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32,
        backupCodes: backupCodes
      });
    } catch (error) {
      next(error);
    }
  },

  // Verify and enable 2FA
  async enableTwoFactor(req, res, next) {
    try {
      const userId = req.user.id;
      const { token, secret, backupCodes } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      // Get the stored secret
      const user = await db.query(
        'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1',
        [userId]
      );

      if (!user.rows[0]) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.rows[0].two_factor_enabled) {
        return res.status(400).json({ error: '2FA is already enabled' });
      }

      const storedSecret = user.rows[0].two_factor_secret;
      if (!storedSecret) {
        return res.status(400).json({ error: 'No 2FA setup found. Please generate setup first.' });
      }

      // Use the secret from the stored setup or the provided one
      const secretToVerify = secret || storedSecret;
      
      // Verify the token
      const verified = speakeasy.totp.verify({
        secret: secretToVerify,
        encoding: 'base32',
        token: token,
        window: 2 // Allow some time drift
      });

      if (!verified) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Use provided backup codes or generate new ones
      const finalBackupCodes = backupCodes || [];
      if (finalBackupCodes.length === 0) {
        for (let i = 0; i < 10; i++) {
          finalBackupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }
      }

      // Enable 2FA
      await db.query(
        'UPDATE users SET two_factor_enabled = true, two_factor_backup_codes = $1, two_factor_enabled_at = NOW() WHERE id = $2',
        [finalBackupCodes, userId]
      );

      res.json({
        message: '2FA enabled successfully',
        backupCodes: finalBackupCodes
      });
    } catch (error) {
      next(error);
    }
  },

  // Verify 2FA token (for login or sensitive operations)
  async verifyToken(req, res, next) {
    try {
      const userId = req.user.id;
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      const user = await db.query(
        'SELECT two_factor_secret, two_factor_enabled, two_factor_backup_codes FROM users WHERE id = $1',
        [userId]
      );

      if (!user.rows[0] || !user.rows[0].two_factor_enabled) {
        return res.status(400).json({ error: '2FA is not enabled for this account' });
      }

      const secret = user.rows[0].two_factor_secret;
      const backupCodes = user.rows[0].two_factor_backup_codes || [];

      // Check if it's a backup code
      if (backupCodes.includes(token.toUpperCase())) {
        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter(code => code !== token.toUpperCase());
        await db.query(
          'UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2',
          [updatedBackupCodes, userId]
        );
        
        return res.json({ 
          verified: true, 
          message: 'Backup code verified',
          backupCodesRemaining: updatedBackupCodes.length
        });
      }

      // Verify TOTP token
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 2
      });

      if (!verified) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      res.json({ verified: true, message: 'Token verified successfully' });
    } catch (error) {
      next(error);
    }
  },

  // Disable 2FA
  async disableTwoFactor(req, res, next) {
    try {
      const userId = req.user.id;
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Verification token and password are required' });
      }

      // Verify password first
      const bcrypt = require('bcrypt');
      const user = await db.query(
        'SELECT password_hash, two_factor_secret, two_factor_enabled, two_factor_backup_codes FROM users WHERE id = $1',
        [userId]
      );

      if (!user.rows[0]) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
      if (!validPassword) {
        return res.status(400).json({ error: 'Invalid password' });
      }

      if (!user.rows[0].two_factor_enabled) {
        return res.status(400).json({ error: '2FA is not enabled for this account' });
      }

      // Verify 2FA token
      const secret = user.rows[0].two_factor_secret;
      const backupCodes = user.rows[0].two_factor_backup_codes || [];

      let tokenValid = false;

      // Check backup code
      if (backupCodes.includes(token.toUpperCase())) {
        tokenValid = true;
      } else {
        // Check TOTP
        tokenValid = speakeasy.totp.verify({
          secret: secret,
          encoding: 'base32',
          token: token,
          window: 2
        });
      }

      if (!tokenValid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Disable 2FA
      await db.query(
        'UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL, two_factor_backup_codes = NULL, two_factor_enabled_at = NULL WHERE id = $1',
        [userId]
      );

      res.json({ message: '2FA disabled successfully' });
    } catch (error) {
      next(error);
    }
  },

  // Get 2FA status
  async getStatus(req, res, next) {
    try {
      const userId = req.user.id;
      
      const user = await db.query(
        'SELECT two_factor_enabled, two_factor_enabled_at, two_factor_backup_codes FROM users WHERE id = $1',
        [userId]
      );

      if (!user.rows[0]) {
        return res.status(404).json({ error: 'User not found' });
      }

      const backupCodesCount = user.rows[0].two_factor_backup_codes ? user.rows[0].two_factor_backup_codes.length : 0;

      res.json({
        enabled: user.rows[0].two_factor_enabled || false,
        enabledAt: user.rows[0].two_factor_enabled_at,
        backupCodesRemaining: backupCodesCount
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = twoFactorController;