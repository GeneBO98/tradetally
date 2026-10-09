// Migration 017 assigned Gemini to every user, including users who never
// configured AI. An untouched legacy row must inherit the instance settings.
function userAISettings(settings = {}) {
  const bundle = {
    provider: settings?.ai_provider || '',
    apiKey: settings?.ai_api_key || '',
    apiUrl: settings?.ai_api_url || '',
    model: settings?.ai_model || ''
  };
  if (bundle.provider === 'gemini' &&
      ![bundle.apiKey, bundle.apiUrl, bundle.model].some(value => String(value).trim())) {
    bundle.provider = '';
  }
  return bundle;
}

function coalesceSettingsBundle(primary = {}, fallback = {}) {
  if (!primary?.provider) {
    return {
      provider: fallback?.provider || '',
      apiKey: fallback?.apiKey || '',
      apiUrl: fallback?.apiUrl || '',
      model: fallback?.model || ''
    };
  }
  const sameProvider = primary.provider === fallback?.provider;
  return {
    provider: primary.provider,
    apiKey: primary.apiKey || (sameProvider ? fallback.apiKey || '' : ''),
    apiUrl: primary.apiUrl || (sameProvider ? fallback.apiUrl || '' : ''),
    model: primary.model || (sameProvider ? fallback.model || '' : '')
  };
}

module.exports = { userAISettings, coalesceSettingsBundle };
