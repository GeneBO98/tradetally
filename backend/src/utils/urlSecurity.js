const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');

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
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return { allowedPublic: false, allowedLoopback: false, allowedPrivate: false };
  }

  const [a, b, c] = octets;
  const isLoopback = a === 127;
  const isPrivate =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
  const isCarrierGradeNat = a === 100 && b >= 64 && b <= 127;
  const isLinkLocal = a === 169 && b === 254;
  const isBenchmark = a === 198 && (b === 18 || b === 19);
  const isDocumentation =
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
  const isProtocolAssignment = a === 192 && b === 0 && c === 0;
  const isDeprecatedRelay = a === 192 && b === 88 && c === 99;
  const isMulticast = a >= 224 && a <= 239;
  const isReserved = a >= 240 || a === 0;

  return {
    allowedPublic: !(
      isLoopback ||
      isPrivate ||
      isCarrierGradeNat ||
      isLinkLocal ||
      isBenchmark ||
      isDocumentation ||
      isProtocolAssignment ||
      isDeprecatedRelay ||
      isMulticast ||
      isReserved
    ),
    allowedLoopback: isLoopback,
    allowedPrivate: isPrivate
  };
}

function expandIPv6(ip) {
  let normalized = ip.toLowerCase().split('%')[0];
  const dottedTail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);

  if (dottedTail) {
    const octets = dottedTail[1].split('.').map(Number);
    if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    normalized = `${normalized.slice(0, normalized.length - dottedTail[1].length)}${replacement}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half) => half
    ? half.split(':').map(part => (/^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16) : NaN))
    : [];
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] || '');
  if ([...left, ...right].some(Number.isNaN)) return null;

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const omittedCount = 8 - left.length - right.length;
  if (omittedCount < 1) return null;
  return [...left, ...Array(omittedCount).fill(0), ...right];
}

function classifyEmbeddedIPv4(hextets) {
  const toIPv4 = (high, low) => [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff
  ].join('.');

  const isIpv4Compatible = hextets.slice(0, 6).every(part => part === 0);
  const isIpv4Mapped = hextets.slice(0, 5).every(part => part === 0) && hextets[5] === 0xffff;
  const isWellKnownNat64 = hextets[0] === 0x64 && hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every(part => part === 0);

  if (isIpv4Compatible || isIpv4Mapped || isWellKnownNat64) {
    return classifyIPv4(toIPv4(hextets[6], hextets[7]));
  }

  if (hextets[0] === 0x2002) {
    return classifyIPv4(toIPv4(hextets[1], hextets[2]));
  }

  return null;
}

function classifyIPv6(ip) {
  const normalized = ip.toLowerCase().split('%')[0];

  const isLoopback = normalized === '::1';
  const isUnspecified = normalized === '::';
  if (isLoopback || isUnspecified) {
    return {
      allowedPublic: false,
      allowedLoopback: isLoopback,
      allowedPrivate: false
    };
  }

  const hextets = expandIPv6(normalized);
  if (!hextets) {
    return { allowedPublic: false, allowedLoopback: false, allowedPrivate: false };
  }

  const embeddedClassification = classifyEmbeddedIPv4(hextets);
  if (embeddedClassification) return embeddedClassification;

  const isLinkLocal = normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  const isUniqueLocal = normalized.startsWith('fc') || normalized.startsWith('fd');
  const isMulticast = normalized.startsWith('ff');
  const isDocumentation = normalized.startsWith('2001:db8');

  return {
    allowedPublic: !(isLinkLocal || isUniqueLocal || isMulticast || isDocumentation),
    allowedLoopback: false,
    allowedPrivate: isUniqueLocal
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
  return { allowedPublic: false, allowedLoopback: false, allowedPrivate: false };
}

async function resolveHostname(hostname) {
  if (net.isIP(hostname)) {
    return [hostname];
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return [...new Set(records.map(record => record.address))];
}

async function resolveValidatedOutboundTarget(input, options = {}) {
  const {
    mode = 'public',
    protocols = ['http:', 'https:'],
    allowPrivateAiTargets = false
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

  // WHATWG URL keeps brackets around IPv6 literals; net.isIP expects the raw address.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
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
    } else if (mode === 'custom-ai') {
      const isSelfHostedTarget = classification.allowedLoopback || classification.allowedPrivate;
      if (isSelfHostedTarget && !allowPrivateAiTargets) {
        throw new OutboundUrlValidationError(
          'Custom AI endpoints on loopback or private networks require ALLOW_LOCAL_AI_ENDPOINTS=true'
        );
      }
      if (!classification.allowedPublic && !isSelfHostedTarget) {
        throw new OutboundUrlValidationError('Unsafe or non-routable Custom AI endpoint targets are not allowed');
      }
    } else if (!classification.allowedPublic) {
      throw new OutboundUrlValidationError('Internal, private, or non-public URL targets are not allowed');
    }
  }

  return { url, addresses: resolvedAddresses };
}

async function ensureValidatedOutboundUrl(input, options = {}) {
  return (await resolveValidatedOutboundTarget(input, options)).url;
}

function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const requestedFamily = Number(options?.family || 0);
    const candidates = addresses
      .map(address => ({ address, family: net.isIP(address) }))
      .filter(candidate => !requestedFamily || candidate.family === requestedFamily);

    if (candidates.length === 0) {
      const error = new Error('No validated address matches the requested IP family');
      error.code = 'ENOTFOUND';
      return callback(error);
    }

    if (options?.all) return callback(null, candidates);
    return callback(null, candidates[0].address, candidates[0].family);
  };
}

function createPinnedAgent(url, addresses) {
  const Agent = url.protocol === 'https:' ? https.Agent : http.Agent;
  return new Agent({
    keepAlive: false,
    lookup: createPinnedLookup(addresses)
  });
}

async function fetchWithValidatedRedirects(initialUrl, fetchImpl, fetchOptions = {}, validationOptions = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const maxRedirects = validationOptions.maxRedirects ?? 3;
  let currentTarget = await resolveValidatedOutboundTarget(initialUrl, validationOptions);
  let redirects = 0;

  while (true) {
    const response = await fetchImpl(currentTarget.url.toString(), {
      ...fetchOptions,
      agent: createPinnedAgent(currentTarget.url, currentTarget.addresses),
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

    const redirectUrl = new URL(location, currentTarget.url);
    if (validationOptions.allowCrossOriginRedirects === false &&
        redirectUrl.origin !== currentTarget.url.origin) {
      throw new OutboundUrlValidationError('Cross-origin redirects are not allowed for this request');
    }
    currentTarget = await resolveValidatedOutboundTarget(redirectUrl, validationOptions);
  }
}

function localAiEndpointsAllowed() {
  if (process.env.ALLOW_LOCAL_AI_ENDPOINTS !== undefined) {
    return process.env.ALLOW_LOCAL_AI_ENDPOINTS === 'true';
  }

  const deploymentMode = String(process.env.DEPLOYMENT_MODE || '').toLowerCase();
  const publicUrls = [process.env.FRONTEND_URL, process.env.INSTANCE_URL, process.env.API_BASE_URL]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return deploymentMode !== 'cloud' && !publicUrls.includes('tradetally.io');
}

async function validateAiProviderUrl(provider, apiUrl) {
  if (!apiUrl) {
    return null;
  }

  const loopbackProviders = new Set(['local', 'ollama', 'lmstudio']);
  if (loopbackProviders.has(provider) && !localAiEndpointsAllowed()) {
    throw new OutboundUrlValidationError('Local AI endpoints are disabled on this deployment');
  }
  const isCustomProvider = provider === 'custom';
  const mode = loopbackProviders.has(provider)
    ? 'loopback-only'
    : (isCustomProvider ? 'custom-ai' : 'public');
  return ensureValidatedOutboundUrl(apiUrl, {
    mode,
    allowPrivateAiTargets: isCustomProvider && localAiEndpointsAllowed()
  });
}

async function fetchAiProviderUrl(provider, input, fetchOptions = {}) {
  const loopbackProviders = new Set(['local', 'ollama', 'lmstudio']);
  if (loopbackProviders.has(provider) && !localAiEndpointsAllowed()) {
    throw new OutboundUrlValidationError('Local AI endpoints are disabled on this deployment');
  }
  const isCustomProvider = provider === 'custom';
  const { default: fetch } = await import('node-fetch');
  return fetchWithValidatedRedirects(input, fetch, fetchOptions, {
    mode: loopbackProviders.has(provider)
      ? 'loopback-only'
      : (isCustomProvider ? 'custom-ai' : 'public'),
    allowPrivateAiTargets: isCustomProvider && localAiEndpointsAllowed(),
    maxRedirects: 3,
    allowCrossOriginRedirects: false
  });
}

module.exports = {
  OutboundUrlValidationError,
  ensureValidatedOutboundUrl,
  fetchWithValidatedRedirects,
  validateAiProviderUrl,
  fetchAiProviderUrl,
  localAiEndpointsAllowed
};
