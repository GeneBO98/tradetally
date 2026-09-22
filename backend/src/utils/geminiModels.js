const crypto = require('crypto');
const fetch = require('node-fetch');

// Google retires Gemini model IDs regularly (gemini-1.5-* is gone), and users
// often type a display name ("Gemini Flash 3.6") or a browser autofills the
// field. Resolve whatever was saved against the models this API key can use.
const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
const FALLBACK_MODEL = 'gemini-flash-latest';
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

const cache = new Map();

function stripPrefix(name) {
  return String(name || '').trim().replace(/^models\//i, '');
}

function looksLikeModelId(value) {
  return /^[a-z0-9][a-z0-9.\-]*$/.test(value);
}

function tokensOf(value) {
  return String(value || '').toLowerCase().match(/\d+(?:\.\d+)*|[a-z]+/g) || [];
}

async function listModels(apiKey) {
  const cacheKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.models;

  const response = await fetch(MODELS_URL, {
    headers: { 'x-goog-api-key': apiKey },
    timeout: FETCH_TIMEOUT_MS
  });
  if (!response.ok) throw new Error(`model list returned ${response.status}`);
  const data = await response.json();
  const models = (data.models || [])
    .filter(model => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map(model => ({ id: stripPrefix(model.name), displayName: String(model.displayName || '') }));
  cache.set(cacheKey, { at: Date.now(), models });
  return models;
}

function versionOf(id) {
  const match = id.match(/^gemini-(\d+(?:\.\d+)?)-/);
  return match ? parseFloat(match[1]) : 0;
}

// Newest stable (non-preview, non-experimental) Flash model.
function defaultFrom(models) {
  const flash = models
    .filter(model => /^gemini-\d+(?:\.\d+)?-flash$/.test(model.id))
    .sort((a, b) => versionOf(b.id) - versionOf(a.id));
  if (flash.length) return flash[0].id;
  return models.find(model => model.id === FALLBACK_MODEL)?.id
    || models.find(model => model.id.includes('flash'))?.id
    || models[0]?.id
    || FALLBACK_MODEL;
}

function matchFrom(models, requested) {
  const lowered = requested.toLowerCase();
  const exact = models.find(model => model.id === lowered);
  if (exact) return exact.id;

  const byDisplayName = models.find(model => model.displayName.toLowerCase() === lowered);
  if (byDisplayName) return byDisplayName.id;

  // "Gemini Flash 3.6" -> every token appears in "gemini-3.6-flash".
  const tokens = tokensOf(requested);
  if (!tokens.length || !tokens.some(token => /\d/.test(token) || token === 'flash' || token === 'pro')) {
    return null;
  }
  const candidates = models.filter(model => {
    const idTokens = tokensOf(model.id);
    return tokens.every(token => idTokens.includes(token));
  });
  // Prefer the shortest ID: the stable name over -preview/-exp variants.
  candidates.sort((a, b) => a.id.length - b.id.length);
  return candidates[0]?.id || null;
}

/**
 * Returns a Gemini model ID that the API will accept, never throwing.
 */
async function resolveGeminiModel(apiKey, requestedModel) {
  const requested = stripPrefix(requestedModel);
  let models;
  try {
    models = apiKey ? await listModels(apiKey) : [];
  } catch (error) {
    console.warn(`[GEMINI] Could not list models (${error.message}); using configured model`);
    models = [];
  }

  if (!models.length) {
    return requested && looksLikeModelId(requested) ? requested : FALLBACK_MODEL;
  }

  const resolved = requested ? matchFrom(models, requested) : null;
  const model = resolved || defaultFrom(models);
  if (requested && model !== requested) {
    // Do not echo free text: this field has held autofilled email addresses.
    const label = looksLikeModelId(requested) ? `"${requested.slice(0, 60)}"` : '(not a model ID)';
    console.warn(`[GEMINI] Configured model ${label} is not available; using ${model}`);
  }
  return model;
}

function clearGeminiModelCache() {
  cache.clear();
}

module.exports = { resolveGeminiModel, clearGeminiModelCache, FALLBACK_MODEL };
