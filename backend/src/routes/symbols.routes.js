const express = require('express');
const router = express.Router();
const symbolsController = require('../controllers/symbols.controller');
const { authenticate } = require('../middleware/auth');

router.get('/search', authenticate, symbolsController.searchSymbols);
router.get('/metadata', authenticate, symbolsController.getSymbolMetadata);
router.get('/quote', authenticate, symbolsController.getSymbolQuote);

module.exports = router;
