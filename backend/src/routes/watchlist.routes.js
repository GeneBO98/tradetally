const express = require('express');
const router = express.Router();
const watchlistController = require('../controllers/watchlist.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');

// All watchlist routes require Pro tier
router.use(authenticate);
router.use(requiresTier('pro'));

// Watchlist CRUD operations
router.get('/', watchlistController.getUserWatchlists);
router.post('/', watchlistController.createWatchlist);
router.get('/:id', watchlistController.getWatchlist);
router.put('/:id', watchlistController.updateWatchlist);
router.delete('/:id', watchlistController.deleteWatchlist);

// Watchlist item operations
router.post('/:id/items', watchlistController.addSymbolToWatchlist);
router.put('/:id/items/:itemId', watchlistController.updateWatchlistItem);
router.delete('/:id/items/:itemId', watchlistController.removeSymbolFromWatchlist);

// News and earnings for watchlist
router.get('/:id/news', watchlistController.getWatchlistNews);
router.get('/:id/earnings', watchlistController.getWatchlistEarnings);
router.get('/:id/symbols/:symbol/news', watchlistController.getSymbolNews);

module.exports = router;