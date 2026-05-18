jest.mock('redis', () => ({
  createClient: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn()
}));

const { createClient } = require('redis');
const redisClient = require('../../src/services/redisClient');

describe('redisClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.REDIS_NAMESPACE = 'test';
  });

  afterEach(async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_NAMESPACE;
    await redisClient.closeRedisClient();
  });

  test('reports not configured when REDIS_URL is absent', async () => {
    delete process.env.REDIS_URL;

    await expect(redisClient.getRedisHealth()).resolves.toMatchObject({
      configured: false,
      status: 'not_configured'
    });
  });

  test('connects and reports ping health', async () => {
    const client = {
      isReady: true,
      isOpen: true,
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue()
    };
    createClient.mockReturnValue(client);

    const health = await redisClient.getRedisHealth();

    expect(health).toMatchObject({
      configured: true,
      status: 'ok',
      namespace: 'test'
    });
    expect(client.ping).toHaveBeenCalled();
  });
});
