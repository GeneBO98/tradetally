const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

class ImageProcessor {
  constructor() {
    // Supported formats
    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp'];
    
    // Compression settings - balanced quality and file size
    this.compressionSettings = {
      // JPEG settings
      jpeg: {
        quality: 85,
        progressive: true,
        mozjpeg: true,
        optimizeCoding: true
      },

      // PNG settings (convert to JPEG for better compression)
      png: {
        quality: 85,
        compressionLevel: 9,
        adaptiveFiltering: true
      },

      // WebP settings (best compression)
      webp: {
        quality: 85,
        effort: 6,
        smartSubsample: true
      }
    };
  }

  /**
   * Check if file format is supported
   */
  isSupportedFormat(filename) {
    const ext = path.extname(filename).toLowerCase().substring(1);
    return this.supportedFormats.includes(ext);
  }

  /**
   * Get MIME type from file extension
   */
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase().substring(1);
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Process and compress image
   */
  async processImage(inputBuffer, originalFilename, userId, tradeId) {
    try {
      // Check if format is supported
      if (!this.isSupportedFormat(originalFilename)) {
        throw new Error(`Unsupported image format. Supported: ${this.supportedFormats.join(', ')}`);
      }

      // Get image metadata
      const metadata = await sharp(inputBuffer).metadata();
      
      console.log(`Processing image: ${originalFilename}`);
      console.log(`Original size: ${(inputBuffer.length / 1024).toFixed(2)}KB`);
      console.log(`Original dimensions: ${metadata.width}x${metadata.height}`);

      // Create sharp instance - no resizing, only compression
      let sharpInstance = sharp(inputBuffer);

      // Convert to WebP for maximum compression (best format for photos)
      // This preserves original dimensions while compressing
      const processedBuffer = await sharpInstance
        .webp(this.compressionSettings.webp)
        .toBuffer();

      const compressionRatio = ((inputBuffer.length - processedBuffer.length) / inputBuffer.length * 100).toFixed(1);
      
      console.log(`Processed size: ${(processedBuffer.length / 1024).toFixed(2)}KB`);
      console.log(`Compression ratio: ${compressionRatio}%`);

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedOriginalName = path.parse(originalFilename).name.replace(/[^a-zA-Z0-9-_]/g, '');
      const filename = `trade_${tradeId}_${timestamp}_${sanitizedOriginalName}.webp`;

      return {
        buffer: processedBuffer,
        filename: filename,
        mimeType: 'image/webp',
        originalSize: inputBuffer.length,
        compressedSize: processedBuffer.length,
        compressionRatio: parseFloat(compressionRatio)
      };

    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Save processed image to disk
   */
  async saveImage(processedImage, uploadsDir) {
    try {
      // Ensure uploads directory exists
      await fs.mkdir(uploadsDir, { recursive: true });

      const filePath = path.join(uploadsDir, processedImage.filename);
      await fs.writeFile(filePath, processedImage.buffer);

      return {
        filename: processedImage.filename,
        filePath: filePath,
        size: processedImage.compressedSize,
        mimeType: processedImage.mimeType,
        originalSize: processedImage.originalSize,
        compressionRatio: processedImage.compressionRatio
      };

    } catch (error) {
      console.error('Image save error:', error);
      throw new Error(`Failed to save image: ${error.message}`);
    }
  }

  /**
   * Delete image file
   */
  async deleteImage(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`Deleted image: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete image ${filePath}:`, error.message);
    }
  }

  /**
   * Validate image file
   */
  async validateImage(buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      
      // Check if it's a valid image
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image file');
      }

      // Check file size (max 50MB original)
      if (buffer.length > 50 * 1024 * 1024) {
        throw new Error('Image file too large (max 50MB)');
      }

      // Check dimensions (max 10000x10000)
      if (metadata.width > 10000 || metadata.height > 10000) {
        throw new Error('Image dimensions too large (max 10000x10000)');
      }

      return true;

    } catch (error) {
      throw new Error(`Image validation failed: ${error.message}`);
    }
  }
}

module.exports = new ImageProcessor();