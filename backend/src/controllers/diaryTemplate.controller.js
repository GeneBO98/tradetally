const DiaryTemplate = require('../models/DiaryTemplate');
const { validate, schemas } = require('../middleware/validation');

/**
 * Get all templates for the authenticated user
 */
const getTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { entryType, page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {
      entryType,
      limit: parseInt(limit),
      offset
    };

    const result = await DiaryTemplate.findByUser(userId, filters);

    res.json({
      templates: result.templates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.total,
        pages: Math.ceil(result.total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

/**
 * Get a specific template by ID
 */
const getTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await DiaryTemplate.findById(id, userId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

/**
 * Get the default template for entry type
 */
const getDefaultTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { entryType = 'diary' } = req.query;

    const template = await DiaryTemplate.getDefaultTemplate(userId, entryType);

    res.json({ template: template || null });
  } catch (error) {
    console.error('Error fetching default template:', error);
    res.status(500).json({ error: 'Failed to fetch default template' });
  }
};

/**
 * Create a new template
 */
const createTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const formData = req.body;

    // Validate required fields
    if (!formData.name || !formData.name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const templateData = {
      name: formData.name.trim(),
      description: formData.description,
      entryType: formData.entryType || 'diary',
      title: formData.title,
      content: formData.content,
      marketBias: formData.marketBias,
      keyLevels: formData.keyLevels,
      watchlist: formData.watchlist || [],
      tags: formData.tags || [],
      followedPlan: formData.followedPlan,
      lessonsLearned: formData.lessonsLearned,
      isDefault: formData.isDefault || false
    };

    const template = await DiaryTemplate.create(userId, templateData);

    res.status(201).json({
      template,
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Error creating template:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A template with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to create template' });
  }
};

/**
 * Update an existing template
 */
const updateTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const formData = req.body;

    const updates = {};
    if (formData.name !== undefined) updates.name = formData.name.trim();
    if (formData.description !== undefined) updates.description = formData.description;
    if (formData.entryType !== undefined) updates.entryType = formData.entryType;
    if (formData.title !== undefined) updates.title = formData.title;
    if (formData.content !== undefined) updates.content = formData.content;
    if (formData.marketBias !== undefined) updates.marketBias = formData.marketBias;
    if (formData.keyLevels !== undefined) updates.keyLevels = formData.keyLevels;
    if (formData.watchlist !== undefined) updates.watchlist = formData.watchlist;
    if (formData.tags !== undefined) updates.tags = formData.tags;
    if (formData.followedPlan !== undefined) updates.followedPlan = formData.followedPlan;
    if (formData.lessonsLearned !== undefined) updates.lessonsLearned = formData.lessonsLearned;
    if (formData.isDefault !== undefined) updates.isDefault = formData.isDefault;

    const template = await DiaryTemplate.update(id, userId, updates);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      template,
      message: 'Template updated successfully'
    });
  } catch (error) {
    console.error('Error updating template:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A template with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to update template' });
  }
};

/**
 * Delete a template
 */
const deleteTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deletedTemplate = await DiaryTemplate.delete(id, userId);

    if (!deletedTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

/**
 * Apply a template (increment use count)
 */
const applyTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await DiaryTemplate.incrementUseCount(id, userId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      template,
      message: 'Template applied successfully'
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
};

/**
 * Duplicate a template
 */
const duplicateTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name } = req.body;

    const newTemplate = await DiaryTemplate.duplicate(id, userId, name);

    res.status(201).json({
      template: newTemplate,
      message: 'Template duplicated successfully'
    });
  } catch (error) {
    console.error('Error duplicating template:', error);

    if (error.message === 'Template not found') {
      return res.status(404).json({ error: error.message });
    }

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A template with this name already exists' });
    }

    res.status(500).json({ error: 'Failed to duplicate template' });
  }
};

module.exports = {
  getTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  duplicateTemplate
};
