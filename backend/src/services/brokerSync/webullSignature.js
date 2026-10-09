const crypto = require('crypto');

// https://developer.webull.com/apis/docs/authentication/signature/
function create_signed_headers({ url, app_key, app_secret, params = {}, body = '', timestamp, nonce }) {
  if (!app_key || !app_secret) {
    throw new Error('Webull app signing credentials are not configured on this server');
  }
  const request_url = new URL(url);
  const headers = {
    'x-app-key': app_key,
    'x-timestamp': timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    'x-signature-algorithm': 'HMAC-SHA1',
    'x-signature-version': '1.0',
    'x-signature-nonce': nonce || crypto.randomUUID().replaceAll('-', '')
  };
  const sign_params = { ...params, ...headers, host: request_url.host };
  let canonical = `${request_url.pathname}&${Object.keys(sign_params).sort()
    .map(key => `${key}=${sign_params[key]}`).join('&')}`;
  if (body) canonical += `&${crypto.createHash('md5').update(body).digest('hex').toUpperCase()}`;
  const encoded = encodeURIComponent(canonical).replace(/[!'()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return {
    ...headers,
    'x-version': 'v3',
    'x-signature': crypto.createHmac('sha1', `${app_secret}&`).update(encoded).digest('base64')
  };
}

module.exports = { create_signed_headers };
