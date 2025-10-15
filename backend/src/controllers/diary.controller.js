const Diary = require('../models/Diary');
const { validate, schemas } = require('../middleware/validation');
const upload = require('../middleware/upload');
const multer = require('multer');
const aiService = require('../utils/aiService');
const db = require('../config/database');


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
        linkedTrades: formData.linkedTrades || [],
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
      if (formData.linkedTrades !== undefined) updates.linkedTrades = formData.linkedTrades;
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

// AI Analysis of diary entries
const analyzeEntries = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    // Validate date range
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Both startDate and endDate are required' 
      });
    }

    // Fetch entries for the specified date range
    const entries = await Diary.findByDateRange(userId, startDate, endDate);

    if (!entries || entries.length === 0) {
      return res.json({
        analysis: null,
        message: 'No diary entries found in the specified date range'
      });
    }

    // Prepare journal data for AI analysis
    const journalData = entries.map(entry => ({
      date: entry.entry_date,
      title: entry.title,
      content: entry.content,
      marketBias: entry.market_bias,
      keyLevels: entry.key_levels,
      watchlist: entry.watchlist,
      lessonsLearned: entry.lessons_learned,
      followedPlan: entry.followed_plan,
      tags: entry.tags
    }));

    // Create analysis prompt
    const prompt = createJournalAnalysisPrompt(journalData, startDate, endDate);

    // Generate AI analysis
    console.log('[AI] Generating AI analysis for diary entries...');
    const analysis = await aiService.generateResponse(userId, prompt, {
      maxTokens: 1500,
      temperature: 0.7
    });

    res.json({
      analysis,
      entriesAnalyzed: entries.length,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Error analyzing diary entries:', error);
    if (error.message.includes('not properly configured')) {
      return res.status(400).json({ 
        error: 'AI provider not configured. Please check your AI settings in user preferences.' 
      });
    }
    res.status(500).json({ error: 'Failed to analyze diary entries' });
  }
};

// Helper function to create the analysis prompt
const createJournalAnalysisPrompt = (journalData, startDate, endDate) => {
  const entriesText = journalData.map(entry => `
Date: ${entry.date}
${entry.title ? `Title: ${entry.title}` : ''}
${entry.marketBias ? `Market Bias: ${entry.marketBias}` : ''}
${entry.content ? `Content: ${entry.content}` : ''}
${entry.lessonsLearned ? `Lessons Learned: ${entry.lessonsLearned}` : ''}
${entry.keyLevels ? `Key Levels: ${entry.keyLevels}` : ''}
${entry.watchlist && entry.watchlist.length > 0 ? `Watchlist: ${entry.watchlist.join(', ')}` : ''}
${entry.followedPlan !== null ? `Followed Plan: ${entry.followedPlan ? 'Yes' : 'No'}` : ''}
${entry.tags && entry.tags.length > 0 ? `Tags: ${entry.tags.join(', ')}` : ''}
---
  `).join('\n');

  return `You are an experienced trading mentor analyzing a trader's journal entries. Please provide a comprehensive analysis and actionable recommendations.

JOURNAL ENTRIES (${startDate} to ${endDate}):
${entriesText}

Please analyze these journal entries and provide:

1. **SUMMARY**: A brief overview of the trading period and overall patterns observed

2. **STRENGTHS**: What the trader is doing well based on their entries

3. **AREAS FOR IMPROVEMENT**: Specific weaknesses or patterns that need attention

4. **KEY INSIGHTS**: Important observations about their trading psychology, discipline, and decision-making

5. **ACTIONABLE RECOMMENDATIONS**: 3-5 specific, practical steps the trader should take to improve their performance

6. **RISK MANAGEMENT ASSESSMENT**: Analysis of their risk management approach based on journal entries

7. **EMOTIONAL DISCIPLINE**: Assessment of emotional control and psychological factors

Please be specific, constructive, and focus on actionable advice. Use a professional but encouraging tone. Format your response clearly with the sections above.`;
};

// General Notes functions
const getGeneralNotes = async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM general_notes
      WHERE user_id = $1
      ORDER BY is_pinned DESC, updated_at DESC
    `;
    const result = await db.query(query, [req.user.id]);
    res.json({ notes: result.rows });
  } catch (error) {
    next(error);
  }
};

const createGeneralNote = async (req, res, next) => {
  try {
    const { title, content, isPinned = true } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const query = `
      INSERT INTO general_notes (user_id, title, content, is_pinned)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await db.query(query, [req.user.id, title, content.trim(), isPinned]);
    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateGeneralNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, isPinned } = req.body;

    // Verify ownership
    const checkQuery = 'SELECT * FROM general_notes WHERE id = $1 AND user_id = $2';
    const checkResult = await db.query(checkQuery, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }

    if (content !== undefined) {
      updates.push(`content = $${paramCount}`);
      values.push(content);
      paramCount++;
    }

    if (isPinned !== undefined) {
      updates.push(`is_pinned = $${paramCount}`);
      values.push(isPinned);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(id, req.user.id);
    const query = `
      UPDATE general_notes
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    res.json({ note: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteGeneralNote = async (req, res, next) => {
  try {
    const { id } = req.params;

    const query = 'DELETE FROM general_notes WHERE id = $1 AND user_id = $2 RETURNING *';
    const result = await db.query(query, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    next(error);
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
  searchEntries,
  analyzeEntries,
  getGeneralNotes,
  createGeneralNote,
  updateGeneralNote,
  deleteGeneralNote
};