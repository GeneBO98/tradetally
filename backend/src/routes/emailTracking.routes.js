const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/email-track/open/:trackingId
 * Called when email client loads the tracking pixel image.
 * Returns a 1x1 transparent GIF and records the open timestamp.
 */
router.get('/open/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!UUID_REGEX.test(trackingId)) {
      return res.status(400).end();
    }

    // Update opened_at (only first open)
    await db.query(`
      UPDATE email_engagement
      SET opened_at = COALESCE(opened_at, NOW())
      WHERE tracking_id = $1
    `, [trackingId]);
  } catch (err) {
    // Silently fail - never block email rendering
    console.error('[EMAIL_TRACKING] Open tracking error:', err.message);
  }

  // Always return the pixel regardless of DB success
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': TRACKING_PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(TRACKING_PIXEL);
});

/**
 * GET /api/email-track/click/:trackingId?url=<encoded_url>
 * Called when user clicks a tracked link in the email.
 * Records the click and redirects to the original URL.
 */
router.get('/click/:trackingId', async (req, res) => {
  const { trackingId } = req.params;
  const { url } = req.query;

  // Validate tracking ID format
  if (!UUID_REGEX.test(trackingId)) {
    return res.status(400).send('Invalid tracking ID');
  }

  // Validate and sanitize redirect URL
  if (!url) {
    return res.status(400).send('Missing url parameter');
  }

  // Only allow redirects to our own domain or common safe schemes
  let redirectUrl;
  try {
    redirectUrl = new URL(url);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const frontendHost = new URL(frontendUrl).hostname;

    // Only allow redirect to the frontend domain
    if (redirectUrl.hostname !== frontendHost && redirectUrl.hostname !== 'localhost') {
      return res.status(400).send('Invalid redirect URL');
    }
  } catch {
    return res.status(400).send('Invalid URL format');
  }

  try {
    // Update clicked_at and click_url (only first click)
    await db.query(`
      UPDATE email_engagement
      SET clicked_at = COALESCE(clicked_at, NOW()),
          click_url = COALESCE(click_url, $2)
      WHERE tracking_id = $1
    `, [trackingId, url]);
  } catch (err) {
    console.error('[EMAIL_TRACKING] Click tracking error:', err.message);
  }

  // Always redirect regardless of DB success
  res.redirect(302, redirectUrl.toString());
});

module.exports = router;
