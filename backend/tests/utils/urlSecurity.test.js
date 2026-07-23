jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn()
  }
}));

const dns = require('dns').promises;
const {
  ensureValidatedOutboundUrl,
  fetchWithValidatedRedirects,
  OutboundUrlValidationError,
  validateAiProviderUrl
} = require('../../src/utils/urlSecurity');

const originalAllowLocalAiEndpoints = process.env.ALLOW_LOCAL_AI_ENDPOINTS;

describe('url security validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalAllowLocalAiEndpoints === undefined) {
      delete process.env.ALLOW_LOCAL_AI_ENDPOINTS;
    } else {
      process.env.ALLOW_LOCAL_AI_ENDPOINTS = originalAllowLocalAiEndpoints;
    }
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
    dns.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);

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

  test('pins the request agent to the address that passed validation', async () => {
    dns.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, headers: { get: jest.fn() } });

    await fetchWithValidatedRedirects('https://public.example.test/hook', fetchImpl, {}, { mode: 'public' });

    const options = fetchImpl.mock.calls[0][1];
    expect(options.redirect).toBe('manual');
    expect(options.agent).toBeDefined();
    const lookup = options.agent.options.lookup;
    const result = await new Promise((resolve, reject) => {
      lookup('public.example.test', {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    expect(result).toEqual({ address: '8.8.8.8', family: 4 });
  });

  test('disables loopback AI providers on cloud deployments', async () => {
    process.env.ALLOW_LOCAL_AI_ENDPOINTS = 'false';

    await expect(validateAiProviderUrl('ollama', 'http://localhost:11434'))
      .rejects.toThrow('Local AI endpoints are disabled');

    expect(dns.lookup).not.toHaveBeenCalled();
  });

  test('accepts public Custom AI endpoints when local endpoints are disabled', async () => {
    process.env.ALLOW_LOCAL_AI_ENDPOINTS = 'false';
    dns.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);

    const validated = await validateAiProviderUrl('custom', 'https://ai.example.test/v1');

    expect(validated.hostname).toBe('ai.example.test');
  });

  test.each([
    'http://127.0.0.1:8000/v1',
    'http://10.0.0.5:8000/v1',
    'http://172.17.0.2:8000/v1',
    'http://192.168.1.5:8000/v1',
    'http://[fd00::5]:8000/v1'
  ])('requires opt-in for self-hosted Custom AI target %s', async target => {
    process.env.ALLOW_LOCAL_AI_ENDPOINTS = 'false';

    await expect(validateAiProviderUrl('custom', target))
      .rejects.toThrow('ALLOW_LOCAL_AI_ENDPOINTS=true');
  });

  test.each([
    'http://127.0.0.1:8000/v1',
    'http://10.0.0.5:8000/v1',
    'http://172.17.0.2:8000/v1',
    'http://192.168.1.5:8000/v1',
    'http://[fd00::5]:8000/v1'
  ])('accepts opted-in self-hosted Custom AI target %s', async target => {
    process.env.ALLOW_LOCAL_AI_ENDPOINTS = 'true';

    await expect(validateAiProviderUrl('custom', target)).resolves.toBeInstanceOf(URL);
  });

  test.each([
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1:8000/v1',
    'http://198.18.0.1:8000/v1',
    'http://203.0.113.10:8000/v1',
    'http://224.0.0.1:8000/v1',
    'http://[2001:db8::1]:8000/v1',
    'http://[fe80::1]:8000/v1'
  ])('blocks unsafe Custom AI target even with self-hosted access enabled: %s', async target => {
    process.env.ALLOW_LOCAL_AI_ENDPOINTS = 'true';

    await expect(validateAiProviderUrl('custom', target))
      .rejects.toThrow('Unsafe or non-routable');
  });

  test('rejects a Custom AI hostname with any unsafe DNS answer', async () => {
    process.env.ALLOW_LOCAL_AI_ENDPOINTS = 'true';
    dns.lookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '169.254.169.254', family: 4 }
    ]);

    await expect(validateAiProviderUrl('custom', 'https://ai.example.test/v1'))
      .rejects.toThrow('Unsafe or non-routable');
  });
});
