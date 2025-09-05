const Diary = require('../models/Diary');
const { validate, schemas } = require('../middleware/validation');
const upload = require('../middleware/upload');
const multer = require('multer');


// Get diary entries for user with filtering and pagination
const getEntries = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 50,
      entryType,
      startDate,
      endDate,
      tags,
      marketBias,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {
      limit: parseInt(limit),
      offset,
      entryType,
      startDate,
      endDate,
      marketBias,
      search
    };

    // Parse tags if provided
    if (tags) {
      filters.tags = Array.isArray(tags) ? tags : [tags];
    }

    const result = await Diary.findByUser(userId, filters);

    res.json({
      entries: result.entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.total,
        pages: Math.ceil(result.total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching diary entries:', error);
    res.status(500).json({ error: 'Failed to fetch diary entries' });
  }
};

// Get today's diary entry for dashboard
const getTodaysEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const entry = await Diary.findTodaysEntry(userId);

    if (!entry) {
      return res.json({ entry: null });
    }

    res.json({ entry });
  } catch (error) {
    console.error('Error fetching today\'s diary entry:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s entry' });
  }
};

// Get specific diary entry by ID
const getEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const entry = await Diary.findById(id, userId);

    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }

    res.json({ entry });
  } catch (error) {
    console.error('Error fetching diary entry:', error);
    res.status(500).json({ error: 'Failed to fetch diary entry' });
  }
};

// Get diary entry by date
const getEntryByDate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;
    const { entryType = 'diary' } = req.query;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const entry = await Diary.findByDate(userId, date, entryType);

    if (!entry) {
      return res.json({ entry: null });
    }

    res.json({ entry });
  } catch (error) {
    console.error('Error fetching diary entry by date:', error);
    res.status(500).json({ error: 'Failed to fetch diary entry' });
  }
};

// Create or update diary entry
const createOrUpdateEntry = [
  validate(schemas.createDiaryEntry),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const formData = req.body;

      // Keep data in camelCase format as expected by the Diary model
      const entryData = {
        entryDate: formData.entryDate,
        entryType: formData.entryType || 'diary',
        title: formData.title,
        marketBias: formData.marketBias,
        content: formData.content,
        keyLevels: formData.keyLevels,
        watchlist: formData.watchlist || [],
        tags: formData.tags || [],
        followedPlan: formData.followedPlan,
        lessonsLearned: formData.lessonsLearned
      };

      const entry = await Diary.create(userId, entryData);

      res.status(201).json({ 
        entry,
        message: 'Diary entry saved successfully' 
      });
    } catch (error) {
      console.error('Error creating diary entry:', error);
      res.status(500).json({ error: 'Failed to save diary entry' });
    }
  }
];

// Update existing diary entry
const updateEntry = [
  validate(schemas.updateDiaryEntry),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const formData = req.body;

      // Keep data in camelCase format as expected by the Diary model
      const updates = {};
      if (formData.entryType !== undefined) updates.entryType = formData.entryType;
      if (formData.title !== undefined) updates.title = formData.title;
      if (formData.marketBias !== undefined) updates.marketBias = formData.marketBias;
      if (formData.content !== undefined) updates.content = formData.content;
      if (formData.keyLevels !== undefined) updates.keyLevels = formData.keyLevels;
      if (formData.watchlist !== undefined) updates.watchlist = formData.watchlist;
      if (formData.tags !== undefined) updates.tags = formData.tags;
      if (formData.followedPlan !== undefined) updates.followedPlan = formData.followedPlan;
      if (formData.lessonsLearned !== undefined) updates.lessonsLearned = formData.lessonsLearned;

      const entry = await Diary.update(id, userId, updates);

      if (!entry) {
        return res.status(404).json({ error: 'Diary entry not found' });
      }

      res.json({ 
        entry,
        message: 'Diary entry updated successfully' 
      });
    } catch (error) {
      console.error('Error updating diary entry:', error);
      res.status(500).json({ error: 'Failed to update diary entry' });
    }
  }
];

// Delete diary entry
const deleteEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deletedEntry = await Diary.delete(id, userId);

    if (!deletedEntry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }

    res.json({ message: 'Diary entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting diary entry:', error);
    res.status(500).json({ error: 'Failed to delete diary entry' });
  }
};

// Upload attachment to diary entry
const uploadAttachment = [
  upload.single('file'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const attachmentData = {
        fileUrl: req.file.path,
        fileType: req.file.mimetype,
        fileName: req.file.originalname,
        fileSize: req.file.size
      };

      const attachment = await Diary.addAttachment(id, attachmentData, userId);

      res.status(201).json({ 
        attachment,
        message: 'File uploaded successfully' 
      });
    } catch (error) {
      console.error('Error uploading attachment:', error);
      
      if (error.message === 'Diary entry not found or access denied') {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
];

// Delete attachment from diary entry
const deleteAttachment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attachmentId } = req.params;

    const attachment = await Diary.deleteAttachment(attachmentId, userId);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
};

// Get user's diary tags
const getTags = async (req, res) => {
  try {
    const userId = req.user.id;
    const tags = await Diary.getTagsList(userId);

    res.json({ tags });
  } catch (error) {
    console.error('Error fetching diary tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
};

// Get diary statistics
const getStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, entryType } = req.query;

    const filters = { startDate, endDate, entryType };
    const stats = await Diary.getStats(userId, filters);

    res.json({ stats });
  } catch (error) {
    console.error('Error fetching diary statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Search diary entries
const searchEntries = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      q: search,
      page = 1,
      limit = 20,
      entryType,
      marketBias,
      tags
    } = req.query;

    if (!search || search.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {
      search: search.trim(),
      limit: parseInt(limit),
      offset,
      entryType,
      marketBias
    };

    // Parse tags if provided
    if (tags) {
      filters.tags = Array.isArray(tags) ? tags : [tags];
    }

    const result = await Diary.findByUser(userId, filters);

    res.json({
      entries: result.entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.total,
        pages: Math.ceil(result.total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error searching diary entries:', error);
    res.status(500).json({ error: 'Failed to search diary entries' });
  }
};

module.exports = {
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
  searchEntries
};