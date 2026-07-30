const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../../src/utils/rateLimit');

describe('rate limit utility', () => {
  test('groups IPv6 addresses by subnet', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', {
        configurable: true,
        value: req.get('x-test-ip')
      });
      next();
    });
    app.use(
      '/limited',
      createRateLimiter({
        windowMs: 60 * 1000,
        max: 1
      })
    );
    app.get('/limited', (_req, res) => {
      res.json({ ok: true });
    });

    const first = await request(app)
      .get('/limited')
      .set('x-test-ip', '2001:db8:85a3:1200::1');
    const second = await request(app)
      .get('/limited')
      .set('x-test-ip', '2001:db8:85a3:1200::2');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test('returns standardized 429 payload and Retry-After header', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(
      '/limited',
      createRateLimiter({
        windowMs: 60 * 1000,
        max: 1,
        message: 'Too many login attempts. Please try again later.'
      })
    );
    app.get('/limited', (_req, res) => {
      res.json({ ok: true });
    });

    const first = await request(app).get('/limited');
    const second = await request(app).get('/limited');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBe('60');
    expect(second.body).toEqual({
      error: 'Too many requests',
      message: 'Too many login attempts. Please try again later.',
      retryAfter: 60
    });
  });
});
