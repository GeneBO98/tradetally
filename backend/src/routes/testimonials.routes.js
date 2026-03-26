const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const TierService = require('../services/tierService');

// POST /api/testimonials - Submit a testimonial (auth required)
router.post('/', authenticate, async (req, res) => {
  try {
    const billingEnabled = await TierService.isBillingEnabled(req.headers.host);
    if (!billingEnabled) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { rating, body, display_name } = req.body;
    const userId = req.user.id;

    if (!rating || !body) {
      return res.status(400).json({ error: 'Rating and review text are required' });
    }
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: 'Review text must be 2000 characters or less' });
    }
    if (display_name && display_name.length > 100) {
      return res.status(400).json({ error: 'Display name must be 100 characters or less' });
    }

    // Upsert - allow user to update their review
    const result = await db.query(`
      INSERT INTO testimonials (user_id, rating, body, display_name, approved, approved_at, approved_by)
      VALUES ($1, $2, $3, $4, FALSE, NULL, NULL)
      ON CONFLICT (user_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        body = EXCLUDED.body,
        display_name = EXCLUDED.display_name,
        approved = FALSE,
        approved_at = NULL,
        approved_by = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, rating, body, display_name, created_at
    `, [userId, rating, body.trim(), display_name?.trim() || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[TESTIMONIALS] Error submitting testimonial:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/testimonials/mine - Get current user's testimonial (auth required)
router.get('/mine', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, rating, body, display_name, approved, created_at FROM testimonials WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('[TESTIMONIALS] Error fetching user testimonial:', error);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

// GET /api/testimonials/public - Approved testimonials for homepage (no auth)
router.get('/public', async (req, res) => {
  try {
    const billingEnabled = await TierService.isBillingEnabled(req.headers.host);
    if (!billingEnabled) {
      return res.json([]);
    }

    const result = await db.query(`
      SELECT t.id, t.rating, t.body, t.display_name, t.created_at
      FROM testimonials t
      WHERE t.approved = TRUE
      ORDER BY t.created_at DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('[TESTIMONIALS] Error fetching public testimonials:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// GET /api/testimonials/admin - All testimonials for admin review
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.id, t.user_id, t.rating, t.body, t.display_name, t.approved,
             t.approved_at, t.created_at, t.updated_at,
             u.username, u.email
      FROM testimonials t
      INNER JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('[TESTIMONIALS] Error fetching admin testimonials:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// PATCH /api/testimonials/admin/:id/approve - Approve a testimonial
router.patch('/admin/:id/approve', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE testimonials
      SET approved = TRUE, approved_at = CURRENT_TIMESTAMP, approved_by = $2
      WHERE id = $1
      RETURNING id, approved, approved_at
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[TESTIMONIALS] Error approving testimonial:', error);
    res.status(500).json({ error: 'Failed to approve testimonial' });
  }
});

// PATCH /api/testimonials/admin/:id/reject - Reject (unapprove) a testimonial
router.patch('/admin/:id/reject', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE testimonials
      SET approved = FALSE, approved_at = NULL, approved_by = NULL
      WHERE id = $1
      RETURNING id, approved
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[TESTIMONIALS] Error rejecting testimonial:', error);
    res.status(500).json({ error: 'Failed to reject testimonial' });
  }
});

// DELETE /api/testimonials/admin/:id - Delete a testimonial
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM testimonials WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json({ message: 'Testimonial deleted' });
  } catch (error) {
    console.error('[TESTIMONIALS] Error deleting testimonial:', error);
    res.status(500).json({ error: 'Failed to delete testimonial' });
  }
});

module.exports = router;
