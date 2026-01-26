const Diary = require('../models/Diary');
const { validate, schemas } = require('../middleware/validation');
const upload = require('../middleware/upload');
const multer = require('multer');
const aiService = require('../utils/aiService');
const db = require('../config/database');
const imageProcessor = require('../utils/imageProcessor');
const path = require('path');
const fs = require('fs').promises;


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

// Upload images to diary entry (with compression)
const uploadDiaryImages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify diary entry belongs to user
    const entry = await Diary.findById(id, userId);
    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const uploadsDir = path.join(__dirname, '../../uploads/diary');
    const processedImages = [];

    // Process each uploaded image
    for (const file of req.files) {
      try {
        // Validate image
        await imageProcessor.validateImage(file.buffer);

        // Process and compress image - reuse the existing processImage method
        // but pass diary entry id instead of trade id
        const processedImage = await processDiaryImage(
          file.buffer,
          file.originalname,
          userId,
          id
        );

        // Save to disk
        const savedImage = await imageProcessor.saveImage(processedImage, uploadsDir);

        // Save to database
        const attachmentData = {
          fileUrl: `/api/diary/${id}/images/${savedImage.filename}`,
          fileType: savedImage.mimeType,
          fileName: file.originalname,
          fileSize: savedImage.size
        };

        const attachment = await Diary.addAttachment(id, attachmentData, userId);

        processedImages.push({
          ...attachment,
          originalSize: savedImage.originalSize,
          compressedSize: savedImage.size,
          compressionRatio: savedImage.compressionRatio
        });

      } catch (error) {
        console.error(`Failed to process image ${file.originalname}:`, error);
        processedImages.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    res.json({
      message: 'Images processed successfully',
      images: processedImages,
      totalImages: processedImages.length,
      successfulUploads: processedImages.filter(img => !img.error).length
    });

  } catch (error) {
    console.error('Error uploading diary images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
};

// Helper function to process diary images (similar to trade images)
const processDiaryImage = async (inputBuffer, originalFilename, userId, diaryEntryId) => {
  const sharp = require('sharp');

  // Compression settings
  const webpSettings = {
    quality: 85,
    effort: 6,
    smartSubsample: true
  };

  // Get image metadata
  const metadata = await sharp(inputBuffer).metadata();

  console.log(`Processing diary image: ${originalFilename}`);
  console.log(`Original size: ${(inputBuffer.length / 1024).toFixed(2)}KB`);
  console.log(`Original dimensions: ${metadata.width}x${metadata.height}`);

  // Convert to WebP for maximum compression
  const processedBuffer = await sharp(inputBuffer)
    .webp(webpSettings)
    .toBuffer();

  const compressionRatio = ((inputBuffer.length - processedBuffer.length) / inputBuffer.length * 100).toFixed(1);

  console.log(`Processed size: ${(processedBuffer.length / 1024).toFixed(2)}KB`);
  console.log(`Compression ratio: ${compressionRatio}%`);

  // Generate unique filename
  const timestamp = Date.now();
  const sanitizedOriginalName = path.parse(originalFilename).name.replace(/[^a-zA-Z0-9-_]/g, '');
  const filename = `diary_${diaryEntryId}_${timestamp}_${sanitizedOriginalName}.webp`;

  return {
    buffer: processedBuffer,
    filename: filename,
    mimeType: 'image/webp',
    originalSize: inputBuffer.length,
    compressedSize: processedBuffer.length,
    compressionRatio: parseFloat(compressionRatio)
  };
};

// Serve diary image
const getDiaryImage = async (req, res) => {
  try {
    const { id: diaryEntryId, filename } = req.params;

    // Sanitize filename to prevent path traversal attacks
    const sanitizedFilename = path.basename(filename);
    if (sanitizedFilename !== filename || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Check if token is provided as query parameter (for direct image access)
    let user = req.user;
    if (!user && req.query.token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
        user = { id: decoded.id };
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if the attachment exists and belongs to the specified diary entry
    const attachmentQuery = `
      SELECT da.*, de.user_id
      FROM diary_attachments da
      JOIN diary_entries de ON da.diary_entry_id = de.id
      WHERE da.diary_entry_id = $1 AND da.file_url LIKE $2
    `;

    const attachmentResult = await db.query(attachmentQuery, [diaryEntryId, `%${sanitizedFilename}`]);

    if (attachmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const attachment = attachmentResult.rows[0];

    // Check access permissions - only owner can view diary images
    // Use string comparison to handle potential type mismatches
    if (String(user.id) !== String(attachment.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build and validate file path to prevent path traversal
    const uploadsDir = path.resolve(__dirname, '../../uploads/diary');
    const imagePath = path.join(uploadsDir, sanitizedFilename);
    const resolvedPath = path.resolve(imagePath);

    // Verify the resolved path is within the uploads directory
    if (!resolvedPath.startsWith(uploadsDir + path.sep) && resolvedPath !== uploadsDir) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      return res.status(404).json({ error: 'Image file not found on disk' });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', attachment.file_type || 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=31536000'); // Cache for 1 year

    // Send file
    res.sendFile(resolvedPath);

  } catch (error) {
    console.error('Error serving diary image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
};

// Delete diary image
const deleteDiaryImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: diaryEntryId, attachmentId } = req.params;

    // Verify diary entry belongs to user
    const entry = await Diary.findById(diaryEntryId, userId);
    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }

    // Get attachment details before deletion
    const attachmentQuery = `
      SELECT da.* FROM diary_attachments da
      JOIN diary_entries de ON da.diary_entry_id = de.id
      WHERE da.id = $1 AND de.user_id = $2
    `;
    const attachmentResult = await db.query(attachmentQuery, [attachmentId, userId]);

    if (attachmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const attachment = attachmentResult.rows[0];

    // Delete from database
    await Diary.deleteAttachment(attachmentId, userId);

    // Delete file from disk
    const filename = path.basename(attachment.file_url);
    const filePath = path.join(__dirname, '../../uploads/diary', filename);
    try {
      await fs.unlink(filePath);
      console.log(`Deleted diary image: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete diary image file ${filePath}:`, error.message);
    }

    res.json({ message: 'Image deleted successfully' });

  } catch (error) {
    console.error('Error deleting diary image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
};

// Upload attachment to diary entry (legacy - kept for backward compatibility)
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
  uploadDiaryImages,
  getDiaryImage,
  deleteDiaryImage,
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