const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const db = require('../config/database');

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/trades');

async function prepareImage(attachment, uploads_dir = UPLOADS_DIR) {
  // Accept storage references only, never remote URLs or paths supplied by a client.
  const file_url = String(attachment.file_url || '');
  const filename = file_url.split('/').pop();
  if (!filename || file_url.includes('..') || !/^[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/i.test(filename)
      || !file_url.startsWith('/') || file_url.includes('://')) {
    throw new Error('Invalid attachment storage path');
  }
  const storage_root = await fs.realpath(uploads_dir);
  const image_path = await fs.realpath(path.join(storage_root, filename));
  if (!image_path.startsWith(storage_root + path.sep)) throw new Error('Invalid attachment storage path');
  const stat = await fs.stat(image_path);
  if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error('Attachment exceeds processing limit');
  const source = await fs.readFile(image_path);
  let buffer;
  for (const quality of [90, 75, 60]) {
    buffer = await sharp(source, { limitInputPixels: 80_000_000 })
      .rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer();
    if (buffer.length <= MAX_IMAGE_BYTES) break;
  }
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Attachment exceeds image size limit');
  return { data: buffer.toString('base64'), mime_type: 'image/jpeg', file_name: attachment.file_name, attachment_id: attachment.id };
}

async function loadImageContext(user_id, trade_id, provider, included_images = null, uploads_dir = UPLOADS_DIR) {
  // Recheck ownership and membership on every request, including follow-ups.
  const result = await db.query(
    `SELECT ta.id, ta.file_name, ta.file_type, ta.file_url, ta.uploaded_at
     FROM trade_attachments ta JOIN trades t ON t.id = ta.trade_id
     WHERE t.id = $1 AND t.user_id = $2 ORDER BY ta.uploaded_at DESC NULLS LAST, ta.id ASC`,
    [trade_id, user_id]
  );
  const attachments = result.rows;
  const metadata = { included_images: [], skipped_images: [], included_count: 0, skipped_count: 0 };
  const images = [];
  const supported = ['gemini', 'openai', 'claude'].includes(provider);
  const selected = included_images === null ? attachments : included_images.map(reference => {
    return attachments.find(attachment => attachment.id === reference.attachment_id) || { ...reference, unavailable: true };
  });
  let attempted = 0;
  for (const attachment of selected) {
    const reference = { attachment_id: attachment.id || attachment.attachment_id, file_name: attachment.file_name || 'Screenshot' };
    let reason;
    if (!supported) reason = 'Screenshot analysis is unavailable for this provider';
    else if (attachment.unavailable) reason = 'Attachment is no longer available';
    else if (attempted >= MAX_IMAGES) reason = 'Only the five most recent screenshots are included';
    else {
      attempted++;
      try {
        images.push(await prepareImage(attachment, uploads_dir));
        metadata.included_images.push(reference);
      } catch (error) {
        reason = error.code === 'ENOENT' ? 'Attachment file is missing' : 'Attachment could not be safely read or prepared';
      }
    }
    if (reason) metadata.skipped_images.push({ ...reference, reason });
  }
  metadata.included_count = images.length;
  metadata.skipped_count = metadata.skipped_images.length;
  return { images, metadata };
}

function describeImageContext(metadata) {
  if (!metadata) return 'No screenshot pixels were supplied. Image URLs are references only.';
  const labels = metadata.included_images.map((image, index) => `Image ${index + 1}: ${image.file_name}`).join('\n');
  const skipped = metadata.skipped_images.map(image => `${image.file_name}: ${image.reason}`).join('\n');
  return `Screenshot pixels supplied: ${metadata.included_count}.\n${labels}\nScreenshots skipped: ${metadata.skipped_count}.\n${skipped}\nOnly describe visible markings in supplied screenshots. Apply the trader's chart legend when markings are visible. Distinguish observations from uncertain interpretations; do not invent image content. External chart URLs are attachment references, not inspected images.`;
}

module.exports = { loadImageContext, prepareImage, describeImageContext };
