const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  duplicateTemplate
} = require('../controllers/diaryTemplate.controller');

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all templates for the user
router.get('/', getTemplates);

// Get default template
router.get('/default', getDefaultTemplate);

// Get specific template by ID
router.get('/:id', getTemplate);

// Create new template
router.post('/', createTemplate);

// Update template
router.put('/:id', updateTemplate);

// Delete template
router.delete('/:id', deleteTemplate);

// Apply template (increment use count)
router.post('/:id/apply', applyTemplate);

// Duplicate template
router.post('/:id/duplicate', duplicateTemplate);

module.exports = router;
