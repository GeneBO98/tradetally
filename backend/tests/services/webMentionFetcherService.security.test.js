jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }));
jest.mock('node-fetch', () => jest.fn());
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logError: jest.fn() }));

const dns = require('dns').promises;
const fetch = require('node-fetch');
const service = require('../../src/services/webMentionFetcherService');

describe('RSS outbound request security', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    dns.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  test.each(['http://127.0.0.1/feed', 'http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd'])
  ('rejects unsafe feed URLs before making a request: %s', async feed_url => {
    await expect(service.fetchRssSource({ feed_url })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('blocks a public feed redirect to an internal service', async () => {
    fetch.mockResolvedValue({ status: 302, headers: { get: () => 'http://10.0.0.1/admin' } });
    await expect(service.fetchRssSource({ feed_url: 'https://feeds.example.test/rss' }))
      .rejects.toThrow('non-public');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('pins DNS, bounds the response, and parses a public feed', async () => {
    fetch.mockResolvedValue({ status: 200, ok: true, text: async () =>
      '<rss><channel><item><title>Market news</title><link>https://example.test/news</link></item></channel></rss>' });
    const items = await service.fetchRssSource({ id: 'source-1', feed_url: 'https://feeds.example.test/rss' });
    expect(items).toEqual([expect.objectContaining({ title: 'Market news', source_id: 'source-1' })]);
    const options = fetch.mock.calls[0][1];
    expect(options).toMatchObject({ timeout: 10000, size: 2 * 1024 * 1024, redirect: 'manual' });
    const address = await new Promise((resolve, reject) => options.agent.options.lookup(
      'feeds.example.test', {}, (error, ip) => error ? reject(error) : resolve(ip)));
    expect(address).toBe('8.8.8.8');
  });

  test('rejects HTTP failures instead of parsing them as a feed', async () => {
    fetch.mockResolvedValue({ status: 503, ok: false, text: jest.fn() });
    await expect(service.fetchRssSource({ feed_url: 'https://feeds.example.test/rss' }))
      .rejects.toThrow('HTTP 503');
  });
});
