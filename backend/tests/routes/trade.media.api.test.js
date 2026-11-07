// Exercise the actual HTTP routes, auth/scope guards, multipart parser, Sharp
// processing and filesystem. Only persistence and account lookup are mocked.
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/Trade', () => ({
  findById: jest.fn(), addAttachment: jest.fn(), deleteAttachment: jest.fn(), addChart: jest.fn()
}));
jest.mock('../../src/models/ApiKey', () => ({ verifyKey: jest.fn() }));
jest.mock('../../src/models/Playbook', () => ({
  getTradeReviewsByTradeId: jest.fn().mockResolvedValue([]),
  listAutoAssignableByUser: jest.fn().mockResolvedValue([])
}));
jest.mock('../../src/services/tierService', () => ({ getUserTier: jest.fn().mockResolvedValue('pro') }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn().mockResolvedValue() }));
jest.mock('../../src/events/domainEvents', () => ({ publishInBackground: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  ...jest.requireActual('../../src/middleware/auth'),
  findActiveUserForAuth: jest.fn()
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const Trade = require('../../src/models/Trade');
const ApiKey = require('../../src/models/ApiKey');
const db = require('../../src/config/database');
const AnalyticsCache = require('../../src/services/analyticsCache');
const { publishInBackground } = require('../../src/events/domainEvents');
const { findActiveUserForAuth, generateToken, TOKEN_PURPOSES } = require('../../src/middleware/auth');
const { AUTH_COOKIE_NAME } = require('../../src/utils/authCookies');
const imageProcessor = require('../../src/utils/imageProcessor');
const v1Routes = require('../../src/routes/v1/trade.routes');
const webRoutes = require('../../src/routes/trade.routes');
const errorHandler = require('../../src/middleware/errorHandler');

const trade_id = '11111111-1111-4111-8111-111111111111';
const other_trade_id = '22222222-2222-4222-8222-222222222222';
const user = { id: 'owner-1', email: 'owner@example.com', is_active: true, session_version: 0 };
const image_url = `/api/v1/trades/${trade_id}/images`;
const attachments = new Map();
const charts = [];
const saved_files = new Set();
let png;
let app;
let trade;

beforeAll(async () => {
  process.env.JWT_SECRET = 'trade-media-test-secret';
  png = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#446688' } }).png().toBuffer();
  app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/trades', v1Routes);
  app.use('/api/trades', webRoutes);
  app.use(errorHandler);

  // Record only files created by this suite; never remove existing uploads.
  const save_image = imageProcessor.saveImage.bind(imageProcessor);
  jest.spyOn(imageProcessor, 'saveImage').mockImplementation(async (...args) => {
    const saved = await save_image(...args);
    saved_files.add(saved.filePath);
    return saved;
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
  attachments.clear();
  charts.length = 0;
  trade = { id: trade_id, user_id: user.id, is_public: false, symbol: 'AAPL', exit_price: 110, exit_time: '2026-11-06T16:00:00Z' };
  findActiveUserForAuth.mockResolvedValue(user);
  ApiKey.verifyKey.mockImplementation(async key => {
    const scopes = {
      tt_live_write: ['trades:read', 'trades:write'],
      tt_live_read: ['trades:read'],
      tt_live_write_only: ['trades:write'],
      tt_live_other: ['trades:read', 'trades:write']
    }[key];
    return scopes ? {
      id: key, user_id: key === 'tt_live_other' ? 'other-owner' : user.id,
      is_active: true, permissions: [], scopes
    } : null;
  });
  findActiveUserForAuth.mockImplementation(async id => ({ ...user, id }));
  Trade.findById.mockImplementation(async id => id === trade_id || id === other_trade_id
    ? { ...trade, id, attachments: [...attachments.values()].filter(a => a.trade_id === id), charts: [...charts] }
    : null);
  Trade.addAttachment.mockImplementation(async (id, data) => {
    const attachment = {
      id: randomUUID(), trade_id: id, file_url: data.fileUrl,
      file_type: data.fileType, file_name: data.fileName, file_size: data.fileSize,
      uploaded_at: '2026-11-07T12:00:00Z'
    };
    attachments.set(attachment.id, attachment);
    return attachment;
  });
  Trade.deleteAttachment.mockImplementation(async id => {
    attachments.delete(id);
    return { id };
  });
  Trade.addChart.mockImplementation(async (id, data) => {
    const chart = { id: randomUUID(), trade_id: id, chart_url: data.chartUrl, chart_title: data.chartTitle, uploaded_at: '2026-11-07T12:00:00Z' };
    charts.push(chart);
    return chart;
  });
  db.query.mockImplementation(async (sql, values) => {
    if (sql.includes('SELECT ta.*, t.is_public')) {
      const attachment = [...attachments.values()].find(a => a.trade_id === values[0] && values.slice(1).includes(a.file_url));
      return { rows: attachment ? [{ ...attachment, is_public: trade.is_public, user_id: trade.user_id }] : [] };
    }
    if (sql.includes('SELECT ta.* FROM trade_attachments')) {
      const attachment = attachments.get(values[0]);
      return { rows: attachment && trade.user_id === values[1] && attachment.trade_id === values[2] ? [attachment] : [] };
    }
    // Empty playbook/settings results for the trade-detail flow.
    return { rows: [] };
  });
});

afterEach(async () => {
  await Promise.all([...saved_files].map(file => fs.rm(file, { force: true })));
  saved_files.clear();
});

afterAll(() => jest.restoreAllMocks());

async function upload(url = image_url, key = 'tt_live_write') {
  return request(app).post(url).set('X-API-Key', key).attach('images', png, 'chart.png');
}

test('API key uploads several same-name images, compresses them, and returns stored references', async () => {
  // Even images with identical names uploaded in the same millisecond must be unique.
  const frozen_time = jest.spyOn(Date, 'now').mockReturnValue(123);
  const response = await request(app).post(image_url).set('Authorization', 'Bearer tt_live_write')
    .attach('images', png, 'chart.png').attach('images', png, 'chart.png');
  frozen_time.mockRestore();
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ total_images: 2, successful_uploads: 2 });
  const urls = response.body.images.map(image => image.file_url);
  expect(new Set(urls).size).toBe(2);
  for (const image of response.body.images) {
    expect(image).toMatchObject({ trade_id, file_type: 'image/webp', file_name: 'chart.png', original_size: png.length });
    expect(image.originalSize).toBeUndefined();
    const buffer = await fs.readFile(path.join(__dirname, '../../uploads/trades', path.basename(image.file_url)));
    expect(await sharp(buffer).metadata()).toMatchObject({ format: 'webp', width: 24, height: 16 });
    expect(image.compressed_size).toBe(buffer.length);
  }
  expect(AnalyticsCache.invalidate).toHaveBeenCalledWith(user.id);
  expect(publishInBackground).toHaveBeenCalledWith('trade.updated', { tradeId: trade_id }, expect.objectContaining({ userId: user.id }));

  const detail = await request(app).get(`/api/v1/trades/${trade_id}`).set('X-API-Key', 'tt_live_read');
  expect(detail.status).toBe(200);
  expect(detail.body.trade.attachments.map(image => image.file_url)).toEqual(urls);
});

test('stored URLs and v1 download routes accept API keys and preserve private cache headers', async () => {
  const uploaded = await upload();
  const stored_url = uploaded.body.images[0].file_url;
  for (const url of [stored_url, stored_url.replace('/api/trades/', '/api/v1/trades/')]) {
    const response = await request(app).get(url).set('X-API-Key', 'tt_live_read');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/webp/);
    expect(response.headers['cache-control']).toBe('private, no-store, max-age=0');
    expect(await sharp(response.body).metadata()).toMatchObject({ format: 'webp', width: 24 });
  }
});

test.each(['tt_live_read', 'invalid', null])('rejects upload without a valid write scope: %s', async key => {
  let req = request(app).post(image_url);
  if (key) req = req.set('X-API-Key', key);
  const response = await req.attach('images', png, 'chart.png');
  expect(response.status).toBe(key === 'tt_live_read' ? 403 : 401);
  expect(response.body.error.code).toBeDefined();
  expect(Trade.addAttachment).not.toHaveBeenCalled();
  expect(imageProcessor.saveImage).not.toHaveBeenCalled();
});

test('rejects uploads and deletions on someone else\'s public trade', async () => {
  trade.user_id = 'someone-else';
  trade.is_public = true;
  expect((await upload()).status).toBe(404);
  const response = await request(app).delete(`${image_url}/${randomUUID()}`).set('X-API-Key', 'tt_live_write');
  expect(response.status).toBe(404);
  expect(Trade.addAttachment).not.toHaveBeenCalled();
  expect(Trade.deleteAttachment).not.toHaveBeenCalled();
});

test('rejects private image reads by other accounts and keys without read scope', async () => {
  const uploaded = await upload();
  const url = uploaded.body.images[0].file_url.replace('/api/trades/', '/api/v1/trades/');
  for (const key of ['tt_live_other', 'tt_live_write_only']) {
    const response = await request(app).get(url).set('X-API-Key', key);
    expect(response.status).toBe(403);
  }
  expect((await request(app).get(url)).status).toBe(401);
  expect((await request(app).get(uploaded.body.images[0].file_url).set('X-API-Key', 'tt_live_write_only')).status).toBe(403);
});

test('deletion requires write scope, binds the attachment to its trade, and removes the file', async () => {
  const uploaded = await upload();
  const image = uploaded.body.images[0];
  expect((await request(app).delete(`${image_url}/${image.id}`).set('X-API-Key', 'tt_live_read')).status).toBe(403);
  expect((await request(app).delete(`/api/v1/trades/${other_trade_id}/images/${image.id}`).set('X-API-Key', 'tt_live_write')).status).toBe(404);
  expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('ta.trade_id = $3'), [image.id, user.id, other_trade_id]);
  expect(Trade.deleteAttachment).not.toHaveBeenCalled();
  const response = await request(app).delete(`${image_url}/${image.id}`).set('X-API-Key', 'tt_live_write');
  expect(response.status).toBe(200);
  expect(Trade.deleteAttachment).toHaveBeenCalledWith(image.id, user.id);
  await expect(fs.access([...saved_files][0])).rejects.toMatchObject({ code: 'ENOENT' });
  expect(AnalyticsCache.invalidate).toHaveBeenCalledTimes(2);
  expect((await request(app).get(image.file_url).set('X-API-Key', 'tt_live_read')).status).toBe(404);
});

test('rejects missing files, unsupported extensions and non-image MIME types with 400', async () => {
  expect((await request(app).post(image_url).set('X-API-Key', 'tt_live_write')).status).toBe(400);
  for (const [filename, contentType] of [['chart.svg', 'image/svg+xml'], ['chart.png', 'text/plain']]) {
    const response = await request(app).post(image_url).set('X-API-Key', 'tt_live_write')
      .attach('images', png, { filename, contentType });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  }
  expect(Trade.addAttachment).not.toHaveBeenCalled();
});

test('rejects more than 10 files and files over 50 MiB before saving', async () => {
  let req = request(app).post(image_url).set('X-API-Key', 'tt_live_write');
  for (let i = 0; i < 11; i++) req = req.attach('images', png, `chart-${i}.png`);
  expect((await req).status).toBe(400);
  const large = await request(app).post(image_url).set('X-API-Key', 'tt_live_write')
    .attach('images', Buffer.alloc(50 * 1024 * 1024 + 1), 'large.png');
  expect(large.status).toBe(413);
  expect(large.body.error.code).toBe('LIMIT_FILE_SIZE');
  expect(Trade.addAttachment).not.toHaveBeenCalled();
});

test('returns per-image failures for partial success, and 422 when none are valid', async () => {
  const partial = await request(app).post(image_url).set('X-API-Key', 'tt_live_write')
    .attach('images', png, 'valid.png').attach('images', Buffer.from('not an image'), 'invalid.png');
  expect(partial.status).toBe(200);
  expect(partial.body).toMatchObject({ total_images: 2, successful_uploads: 1, images: [expect.objectContaining({ id: expect.any(String) }), { filename: 'invalid.png', error: expect.any(String) }] });
  const invalid = await request(app).post(image_url).set('X-API-Key', 'tt_live_write')
    .attach('images', Buffer.from('not an image'), 'invalid.png');
  expect(invalid.status).toBe(422);
  expect(invalid.body.error).toMatchObject({ code: 'IMAGE_UPLOAD_FAILED', details: { images: [{ filename: 'invalid.png', error: expect.any(String) }] } });
  expect(AnalyticsCache.invalidate).toHaveBeenCalledTimes(1);
});

test('enforces the web image dimension limit', async () => {
  const wide = await sharp({ create: { width: 10001, height: 1, channels: 3, background: '#446688' } }).png().toBuffer();
  const response = await request(app).post(image_url).set('X-API-Key', 'tt_live_write').attach('images', wide, 'wide.png');
  expect(response.status).toBe(422);
  expect(response.body.error.details.images[0].error).toContain('10000x10000');
  expect(Trade.addAttachment).not.toHaveBeenCalled();
});

test('removes saved files if attachment persistence fails', async () => {
  Trade.addAttachment.mockRejectedValueOnce(new Error('storage unavailable'));
  const response = await upload();
  expect(response.status).toBe(422);
  expect(saved_files.size).toBe(1);
  await expect(fs.access([...saved_files][0])).rejects.toMatchObject({ code: 'ENOENT' });
  expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
});

test('web uploads keep legacy response fields and accept session cookies', async () => {
  const token = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });
  const response = await request(app).post(`/api/trades/${trade_id}/images`)
    .set('Cookie', `${AUTH_COOKIE_NAME}=${token}`).attach('images', png, 'web.png');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ totalImages: 1, successfulUploads: 1, images: [expect.objectContaining({ originalSize: png.length })] });
  const public_url = response.body.images[0].file_url;
  expect((await request(app).get(public_url)).status).toBe(403);
  trade.is_public = true;
  const public_image = await request(app).get(public_url);
  expect(public_image.status).toBe(200);
  expect(public_image.headers['cache-control']).toBe('public, max-age=31536000, immutable');
});

test('API keys can attach several chart links and fetch them in snake_case', async () => {
  const url = `/api/v1/trades/${trade_id}/charts`;
  for (const chart_url of ['https://example.com/entry.png', 'https://example.com/exit.png']) {
    const response = await request(app).post(url).set('X-API-Key', 'tt_live_write').send({ chart_url, chart_title: ' Setup ' });
    expect(response.status).toBe(201);
    expect(response.body.chart).toMatchObject({ chart_url, chart_title: 'Setup' });
    expect(response.body.chart.chartUrl).toBeUndefined();
  }
  const response = await request(app).get(`/api/v1/trades/${trade_id}`).set('X-API-Key', 'tt_live_read');
  expect(response.status).toBe(200);
  expect(response.body.trade.charts.map(chart => chart.chart_url)).toEqual(charts.map(chart => chart.chart_url));
});

test('chart links enforce write scope, URL validation, title limits and ownership', async () => {
  const url = `/api/v1/trades/${trade_id}/charts`;
  expect((await request(app).post(url).set('X-API-Key', 'tt_live_write')).status).toBe(400);
  expect((await request(app).post(url).set('X-API-Key', 'tt_live_read').send({ chart_url: 'https://example.com' })).status).toBe(403);
  for (const body of [{}, { chart_url: 'javascript:alert(1)' }, { chart_url: 'https://user:pass@example.com' }, { chart_url: 'https://example.com', chart_title: {} }, { chart_url: 'https://example.com', chart_title: 'x'.repeat(256) }]) {
    expect((await request(app).post(url).set('X-API-Key', 'tt_live_write').send(body)).status).toBe(400);
  }
  trade.user_id = 'someone-else';
  trade.is_public = true;
  expect((await request(app).post(url).set('X-API-Key', 'tt_live_write').send({ chart_url: 'https://example.com' })).status).toBe(404);
  expect(Trade.addChart).not.toHaveBeenCalled();
});
