const express = require('express');
const router = express.Router();
const symbolsController = require('../controllers/symbols.controller');
const { authenticate } = require('../middleware/auth');

router.get('/search', authenticate, symbolsController.searchSymbols);

module.exports = router;
