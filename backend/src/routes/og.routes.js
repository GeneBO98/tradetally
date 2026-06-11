const express = require('express');
const router = express.Router();
const ogController = require('../controllers/og.controller');

// Crawler-facing Open Graph endpoints so shared trade links unfurl into a card.
// Public and unauthenticated: only data for trades the owner made public is used.
router.get('/trades/:id/card.png', ogController.tradeCardImage);
router.get('/trades/:id', ogController.tradeOgHtml);

module.exports = router;
