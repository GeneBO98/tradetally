const db = require('../config/database');
const challengeStore = require('../utils/webauthnChallengeStore');
const { generateToken } = require('../middleware/auth');
const User = require('../models/User');
const crypto = require('crypto');

// Lazy-loaded ESM imports (simplewebauthn v13 is ESM-only)
let _webauthn = null;
async function getWebAuthn() {
  if (!_webauthn) {
    _webauthn = await import('@simplewebauthn/server');
  }
  return _webauthn;
}

function getRpId(req) {
  if (process.env.WEBAUTHN_RP_ID) {
    return process.env.WEBAUTHN_RP_ID;
  }
  // Use the Referer header to detect the actual browser domain.
  // The Origin header is unreliable when a dev proxy uses changeOrigin:true,
  // but Referer is preserved and contains the real browser URL.
  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).hostname;
    } catch (e) { /* fall through */ }
  }
  if (process.env.FRONTEND_URL) {
    try {
      return new URL(process.env.FRONTEND_URL).hostname;
    } catch (e) { /* fall through */ }
  }
  return req.hostname;
}

function getExpectedOrigins(req) {
  // Return all valid origins for WebAuthn verification.
  // The clientDataJSON.origin is set by the browser and reflects the real page origin.
  const origins = new Set();

  if (process.env.APP_URL) {
    origins.add(process.env.APP_URL.replace(/\/$/, ''));
  }
  if (process.env.FRONTEND_URL) {
    origins.add(process.env.FRONTEND_URL.replace(/\/$/, ''));
  }

  // Derive from Referer (preserved by proxies, unlike Origin with changeOrigin:true)
  const referer = req.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      origins.add(refUrl.origin);
    } catch (e) { /* ignore */ }
  }

  // Also include the Origin header as a fallback
  const reqOrigin = req.get('origin');
  if (reqOrigin) {
    origins.add(reqOrigin.replace(/\/$/, ''));
  }

  if (origins.size === 0) {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    origins.add(`${protocol}://${req.get('host')}`);
  }

  return Array.from(origins);
}

function getRpName() {
  return process.env.WEBAUTHN_RP_NAME || 'TradeTally';
}

// GET /api/auth/passkey - List user's passkeys
async function getPasskeys(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, device_name, transports, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ passkeys: result.rows });
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/passkey/register/options - Generate registration options
async function registerOptions(req, res, next) {
  try {
    const { generateRegistrationOptions } = await getWebAuthn();

    // Get existing credentials to exclude
    const existing = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = $1',
      [req.user.id]
    );

    const rpId = getRpId(req);
    console.log('[PASSKEY] Registration rpID:', rpId, '| Referer:', req.get('referer'), '| Origin:', req.get('origin'), '| FRONTEND_URL:', process.env.FRONTEND_URL);

    const options = await generateRegistrationOptions({
      rpName: getRpName(),
      rpID: rpId,
      userName: req.user.email,
      userDisplayName: req.user.full_name || req.user.username || req.user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      excludeCredentials: existing.rows.map(row => ({
        id: row.credential_id,
        transports: row.transports || [],
      })),
    });

    // Store challenge keyed by user ID
    challengeStore.set(`reg:${req.user.id}`, options.challenge);

    res.json(options);
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/passkey/register/verify - Verify and store credential
async function registerVerify(req, res, next) {
  try {
    const { verifyRegistrationResponse } = await getWebAuthn();
    const { response, deviceName } = req.body;

    const expectedChallenge = challengeStore.get(`reg:${req.user.id}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expired or not found. Please try again.' });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getExpectedOrigins(req),
      expectedRPID: getRpId(req),
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey registration failed.' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await db.query(
      `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_name, transports)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        credential.id,
        Buffer.from(credential.publicKey).toString('base64url'),
        credential.counter,
        deviceName || 'Unnamed passkey',
        credential.transports || [],
      ]
    );

    challengeStore.remove(`reg:${req.user.id}`);

    res.json({ verified: true });
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/passkey/login/options - Generate authentication options (public)
async function loginOptions(req, res, next) {
  try {
    const { generateAuthenticationOptions } = await getWebAuthn();

    const options = await generateAuthenticationOptions({
      rpID: getRpId(req),
      userVerification: 'preferred',
      // Empty allowCredentials for discoverable credential flow
    });

    // Store challenge with a random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    challengeStore.set(`auth:${sessionToken}`, options.challenge);

    res.json({ ...options, sessionToken });
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/passkey/login/verify - Verify authentication and return JWT (public)
async function loginVerify(req, res, next) {
  try {
    const { verifyAuthenticationResponse } = await getWebAuthn();
    const { response, sessionToken } = req.body;

    const expectedChallenge = challengeStore.get(`auth:${sessionToken}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expired or not found. Please try again.' });
    }

    // Look up credential by ID
    const credResult = await db.query(
      'SELECT wc.*, u.id as uid, u.email, u.username, u.full_name, u.is_active, u.two_factor_enabled, u.last_login_at, u.role, u.avatar_url, u.is_verified, u.admin_approved FROM webauthn_credentials wc JOIN users u ON wc.user_id = u.id WHERE wc.credential_id = $1',
      [response.id]
    );

    if (credResult.rows.length === 0) {
      return res.status(400).json({ error: 'Passkey not recognized. Please use a registered passkey.' });
    }

    const cred = credResult.rows[0];

    if (!cred.is_active) {
      return res.status(403).json({ error: 'Account is disabled.' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getExpectedOrigins(req),
      expectedRPID: getRpId(req),
      credential: {
        id: cred.credential_id,
        publicKey: Buffer.from(cred.public_key, 'base64url'),
        counter: Number(cred.counter),
        transports: cred.transports || [],
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Passkey verification failed.' });
    }

    // Update counter and last_used_at
    await db.query(
      'UPDATE webauthn_credentials SET counter = $1, last_used_at = NOW() WHERE id = $2',
      [verification.authenticationInfo.newCounter, cred.id]
    );

    challengeStore.remove(`auth:${sessionToken}`);

    // Build user object for token generation and 2FA check
    const user = {
      id: cred.uid,
      email: cred.email,
      username: cred.username,
      full_name: cred.full_name,
      role: cred.role,
      avatar_url: cred.avatar_url,
      is_verified: cred.is_verified,
      admin_approved: cred.admin_approved,
      two_factor_enabled: cred.two_factor_enabled,
      last_login_at: cred.last_login_at,
    };

    // Passkey authentication is inherently multi-factor (possession + biometric/PIN),
    // so skip 2FA even if the user has it enabled on their account.

    const isFirstLogin = user.last_login_at == null;
    await User.updateLastLogin(user.id);

    // Record login for Year Wrapped (best-effort)
    try {
      const YearWrappedService = require('../services/yearWrappedService');
      YearWrappedService.recordLogin(user.id).catch(() => {});
    } catch (e) { /* optional service */ }

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Get user tier
    const TierService = require('../services/tierService');
    const { tier: userTier, billingEnabled } = await TierService.getUserTierWithBillingStatus(user.id, req.headers.host);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        role: user.role,
        tier: userTier,
        billingEnabled,
        isVerified: user.is_verified,
        adminApproved: user.admin_approved,
        twoFactorEnabled: user.two_factor_enabled || false,
      },
      is_first_login: isFirstLogin,
      token
    });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/auth/passkey/:id - Delete a passkey
async function deletePasskey(req, res, next) {
  try {
    const result = await db.query(
      'DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Passkey not found.' });
    }

    res.json({ message: 'Passkey deleted.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPasskeys,
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  deletePasskey,
};
