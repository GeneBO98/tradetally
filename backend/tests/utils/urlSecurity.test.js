jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn()
  }
}));

const dns = require('dns').promises;
const {
  ensureValidatedOutboundUrl,
  fetchWithValidatedRedirects,
  OutboundUrlValidationError
} = require('../../src/utils/urlSecurity');

describe('url security validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects private targets for public outbound URLs', async () => {
    dns.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(
      ensureValidatedOutboundUrl('https://internal.example.test/hook', { mode: 'public' })
    ).rejects.toThrow(OutboundUrlValidationError);
  });

  test('accepts loopback-only AI endpoints', async () => {
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const validated = await ensureValidatedOutboundUrl('http://localhost:11434', { mode: 'loopback-only' });

    expect(validated.hostname).toBe('localhost');
  });

  test('blocks redirects that resolve to internal targets', async () => {
    dns.lookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);

    const fetchImpl = jest.fn().mockResolvedValue({
      status: 302,
      headers: {
        get: () => 'http://127.0.0.1/internal'
      }
    });

    await expect(
      fetchWithValidatedRedirects('https://public.example.test/hook', fetchImpl, {}, { mode: 'public' })
    ).rejects.toThrow(OutboundUrlValidationError);
  });
});
