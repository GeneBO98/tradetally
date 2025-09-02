const multer = require('multer');
const path = require('path');
const imageProcessor = require('../utils/imageProcessor');

// Configure multer for memory storage (we'll process before saving)
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'), false);
  }

  // Check if format is supported
  if (!imageProcessor.isSupportedFormat(file.originalname)) {
    return cb(new Error(`Unsupported image format. Supported formats: ${imageProcessor.supportedFormats.join(', ')}`), false);
  }

  cb(null, true);
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10 // Max 10 files per upload
  }
});

module.exports = upload;