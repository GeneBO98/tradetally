const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getEntries,
  getTodaysEntry,
  getEntry,
  getEntryByDate,
  createOrUpdateEntry,
  updateEntry,
  deleteEntry,
  uploadAttachment,
  deleteAttachment,
  getTags,
  getStats,
  searchEntries,
  analyzeEntries,
  getGeneralNotes,
  createGeneralNote,
  updateGeneralNote,
  deleteGeneralNote
} = require('../controllers/diary.controller');

// Apply authentication middleware to all routes
router.use(authenticate);

// Get diary entries with filtering and pagination
router.get('/', getEntries);

// Get today's diary entry (for dashboard)
router.get('/today', getTodaysEntry);

// Search diary entries
router.get('/search', searchEntries);

// Get user's diary tags
router.get('/tags', getTags);

// Get diary statistics
router.get('/stats', getStats);

// AI Analysis of diary entries
router.get('/analyze', analyzeEntries);

// Get diary entry by date
router.get('/date/:date', getEntryByDate);

// General Notes routes (must be before /:id route)
router.get('/general-notes', getGeneralNotes);
router.post('/general-notes', createGeneralNote);
router.put('/general-notes/:id', updateGeneralNote);
router.delete('/general-notes/:id', deleteGeneralNote);

// Get specific diary entry by ID
router.get('/:id', getEntry);

// Create or update diary entry (upsert by date and type)
router.post('/', createOrUpdateEntry);

// Update specific diary entry
router.put('/:id', updateEntry);

// Delete diary entry
router.delete('/:id', deleteEntry);

// Upload attachment to diary entry
router.post('/:id/attachments', uploadAttachment);

// Delete attachment from diary entry
router.delete('/attachments/:attachmentId', deleteAttachment);

module.exports = router;