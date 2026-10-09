jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const db = require('../../src/config/database');
const { loadImageContext, prepareImage } = require('../../src/services/aiImageContext');

let directory;
const attachment = { id: 'image-1', file_name: 'Chart legend.png', file_url: '/api/trades/trade-1/images/chart.png' };
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tradetally-ai-images-'));
  // Labelled chart with distinct support/resistance colours; real image bytes exercise resizing/encoding.
  const svg = '<svg width="3000" height="1500"><rect width="3000" height="1500" fill="white"/><path d="M100 1100H2900" stroke="#ffff00" stroke-width="12"/><path d="M100 400H2900" stroke="#800080" stroke-width="12"/><text x="100" y="1080" font-size="50">Yellow support</text><text x="100" y="380" font-size="50">Purple resistance</text></svg>';
  await sharp(Buffer.from(svg)).png().toFile(path.join(directory, 'chart.png'));
});
afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });
beforeEach(() => jest.clearAllMocks());

test('prepares readable bounded images while preserving originals', async () => {
  const original = await fs.readFile(path.join(directory, 'chart.png'));
  const image = await prepareImage(attachment, directory);
  const buffer = Buffer.from(image.data, 'base64');
  const metadata = await sharp(buffer).metadata();
  expect(metadata.width).toBe(2048);
  expect(metadata.height).toBe(1024);
  expect(buffer.length).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(image.mime_type).toBe('image/jpeg');
  expect(await fs.readFile(path.join(directory, 'chart.png'))).toEqual(original);
});

test('checks user membership, includes five newest images, and stores references only', async () => {
  db.query.mockResolvedValue({ rows: Array.from({ length: 7 }, (_, index) => ({ ...attachment, id: `image-${index}` })) });
  const context = await loadImageContext('owner', 'trade-1', 'openai', null, directory);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('t.user_id = $2'), ['trade-1', 'owner']);
  expect(db.query.mock.calls[0][0]).toContain('ORDER BY ta.uploaded_at DESC');
  expect(context.images).toHaveLength(5);
  expect(context.metadata.included_count).toBe(5);
  expect(context.metadata.skipped_count).toBe(2);
  expect(JSON.stringify(context.metadata)).not.toContain(context.images[0].data);
});

test('resends only session-included images and reports deleted attachments', async () => {
  db.query.mockResolvedValue({ rows: [attachment, { ...attachment, id: 'new-image' }] });
  const context = await loadImageContext('owner', 'trade-1', 'claude', [
    { attachment_id: 'image-1', file_name: 'Chart legend.png' }, { attachment_id: 'deleted-image', file_name: 'Deleted.png' }
  ], directory);
  expect(context.images.map(image => image.attachment_id)).toEqual(['image-1']);
  expect(context.metadata.skipped_images[0].reason).toContain('no longer available');
});

test('a different user gets no screenshot bytes', async () => {
  db.query.mockResolvedValue({ rows: [] });
  const context = await loadImageContext('other-user', 'trade-1', 'openai', [{ attachment_id: 'image-1', file_name: 'Chart' }], directory);
  expect(context.images).toEqual([]);
  expect(context.metadata.skipped_count).toBe(1);
});

test('unsupported providers report skipped screenshots', async () => {
  db.query.mockResolvedValue({ rows: [attachment] });
  const context = await loadImageContext('owner', 'trade-1', 'ollama', null, directory);
  expect(context.images).toEqual([]);
  expect(context.metadata.skipped_images[0].reason).toContain('unavailable for this provider');
});

test('missing and corrupt images are skipped without losing text analysis', async () => {
  await fs.writeFile(path.join(directory, 'corrupt.png'), 'not an image');
  db.query.mockResolvedValue({ rows: [
    { ...attachment, file_url: '/uploads/missing.png' }, { ...attachment, id: 'corrupt', file_url: '/uploads/corrupt.png' }
  ] });
  const context = await loadImageContext('owner', 'trade-1', 'gemini', null, directory);
  expect(context.images).toEqual([]);
  expect(context.metadata.skipped_count).toBe(2);
  expect(context.metadata.skipped_images[0].reason).toContain('missing');
});

test.each(['../../etc/passwd', '/uploads/../chart.png', 'https://example.com/chart.png', '/uploads/chart%2epng'])('rejects unsafe storage reference %s', async file_url => {
  await expect(prepareImage({ ...attachment, file_url }, directory)).rejects.toThrow();
});

test('rejects symlinks outside the storage root', async () => {
  const external = path.join(os.tmpdir(), `tradetally-outside-${Date.now()}.png`);
  await fs.copyFile(path.join(directory, 'chart.png'), external);
  try {
    await fs.symlink(external, path.join(directory, 'link.png'));
    await expect(prepareImage({ ...attachment, file_url: '/uploads/link.png' }, directory)).rejects.toThrow('Invalid attachment storage path');
  } finally { await fs.rm(external, { force: true }); }
});

test('rejects oversized source images before reading them', async () => {
  const handle = await fs.open(path.join(directory, 'large.png'), 'w');
  await handle.truncate(51 * 1024 * 1024);
  await handle.close();
  await expect(prepareImage({ ...attachment, file_url: '/uploads/large.png' }, directory)).rejects.toThrow('processing limit');
});
