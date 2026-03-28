const dns = require('dns').promises;
const net = require('net');

class OutboundUrlValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutboundUrlValidationError';
    this.code = 'INVALID_OUTBOUND_URL';
  }
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized.endsWith('.localhost');
}

function classifyIPv4(ip) {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return { allowedPublic: false, allowedLoopback: false };
  }

  const [a, b] = octets;
  const isLoopback = a === 127;
  const isPrivate =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
  const isCarrierGradeNat = a === 100 && b >= 64 && b <= 127;
  const isLinkLocal = a === 169 && b === 254;
  const isBenchmark = a === 198 && (b === 18 || b === 19);
  const isMulticast = a >= 224 && a <= 239;
  const isReserved = a >= 240 || a === 0;

  return {
    allowedPublic: !(isLoopback || isPrivate || isCarrierGradeNat || isLinkLocal || isBenchmark || isMulticast || isReserved),
    allowedLoopback: isLoopback
  };
}

function classifyIPv6(ip) {
  const normalized = ip.toLowerCase().split('%')[0];

  if (normalized.startsWith('::ffff:')) {
    return classifyIp(normalized.slice(7));
  }

  const isLoopback = normalized === '::1';
  const isUnspecified = normalized === '::';
  const isLinkLocal = normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  const isUniqueLocal = normalized.startsWith('fc') || normalized.startsWith('fd');
  const isMulticast = normalized.startsWith('ff');

  return {
    allowedPublic: !(isLoopback || isUnspecified || isLinkLocal || isUniqueLocal || isMulticast),
    allowedLoopback: isLoopback
  };
}

function classifyIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    return classifyIPv4(ip);
  }
  if (version === 6) {
    return classifyIPv6(ip);
  }
  return { allowedPublic: false, allowedLoopback: false };
}

async function resolveHostname(hostname) {
  if (net.isIP(hostname)) {
    return [hostname];
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return [...new Set(records.map(record => record.address))];
}

async function ensureValidatedOutboundUrl(input, options = {}) {
  const {
    mode = 'public',
    protocols = ['http:', 'https:']
  } = options;

  let url;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch (error) {
    throw new OutboundUrlValidationError('Invalid URL');
  }

  if (!protocols.includes(url.protocol)) {
    throw new OutboundUrlValidationError('Only HTTP(S) URLs are allowed');
  }

  if (url.username || url.password) {
    throw new OutboundUrlValidationError('URLs with embedded credentials are not allowed');
  }

  const hostname = url.hostname;
  if (!hostname) {
    throw new OutboundUrlValidationError('URL hostname is required');
  }

  if (mode === 'loopback-only' && !net.isIP(hostname) && !isLocalHostname(hostname)) {
    throw new OutboundUrlValidationError('Local AI endpoints must use localhost or a loopback address');
  }

  const resolvedAddresses = await resolveHostname(hostname);
  if (resolvedAddresses.length === 0) {
    throw new OutboundUrlValidationError('Unable to resolve URL hostname');
  }

  for (const address of resolvedAddresses) {
    const classification = classifyIp(address);

    if (mode === 'loopback-only') {
      if (!classification.allowedLoopback) {
        throw new OutboundUrlValidationError('Local AI endpoints must resolve to loopback addresses only');
      }
    } else if (!classification.allowedPublic) {
      throw new OutboundUrlValidationError('Internal, private, or non-public URL targets are not allowed');
    }
  }

  return url;
}

async function fetchWithValidatedRedirects(initialUrl, fetchImpl, fetchOptions = {}, validationOptions = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const maxRedirects = validationOptions.maxRedirects ?? 3;
  let currentUrl = await ensureValidatedOutboundUrl(initialUrl, validationOptions);
  let redirects = 0;

  while (true) {
    const response = await fetchImpl(currentUrl.toString(), {
      ...fetchOptions,
      redirect: 'manual'
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new OutboundUrlValidationError('Redirect response missing Location header');
    }

    redirects += 1;
    if (redirects > maxRedirects) {
      throw new OutboundUrlValidationError('Too many redirects');
    }

    currentUrl = await ensureValidatedOutboundUrl(new URL(location, currentUrl), validationOptions);
  }
}

async function validateAiProviderUrl(provider, apiUrl) {
  if (!apiUrl) {
    return null;
  }

  const localProviders = new Set(['local', 'ollama', 'lmstudio']);
  const mode = localProviders.has(provider) ? 'loopback-only' : 'public';
  return ensureValidatedOutboundUrl(apiUrl, { mode });
}

module.exports = {
  OutboundUrlValidationError,
  ensureValidatedOutboundUrl,
  fetchWithValidatedRedirects,
  validateAiProviderUrl
};
