const express = require('express');
const router = express.Router();
const marketRiskController = require('../controllers/marketRisk.controller');

// Public macro market-risk indicators (no auth: no user data is involved,
// and the public /market-risk page consumes this without a session)
router.get('/', marketRiskController.getIndicators);

module.exports = router;
