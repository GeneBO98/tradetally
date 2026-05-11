const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Public endpoint — no auth required so anonymous users can record exposures.
// Upsert on (anonymous_id, experiment_id) so repeated page visits don't
// add duplicate rows (first-exposure wins, which matches GrowthBook's default
// attribution model).
router.post('/expose', async (req, res) => {
  const { anonymousId, userId, experimentId, variationId } = req.body;

  if (!anonymousId || !experimentId || !variationId) {
    return res.status(400).json({ error: 'anonymousId, experimentId, and variationId are required' });
  }

  try {
    await db.query(
      `INSERT INTO experiment_exposures (anonymous_id, user_id, experiment_id, variation_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (anonymous_id, experiment_id) DO NOTHING`,
      [anonymousId, userId || null, experimentId, variationId]
    );
    res.status(204).send();
  } catch (err) {
    console.error('[experiments] Failed to record exposure:', err.message);
    res.status(500).json({ error: 'Failed to record exposure' });
  }
});

module.exports = router;
