const {
  getRequestAuthToken,
  hasDisabledQueryToken,
  isQueryTokenAuthEnabled,
  queryToken
} = require('../../src/utils/requestAuthToken');

function req({ authorization, xAuthToken, cookieToken, queryTokenValue } = {}) {
  return {
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(xAuthToken ? { 'x-auth-token': xAuthToken } : {})
    },
    cookies: cookieToken ? { token: cookieToken } : {},
    query: queryTokenValue ? { token: queryTokenValue } : {}
  };
}

describe('requestAuthToken', () => {
  test('prefers bearer, x-auth-token, then cookie tokens', () => {
    expect(getRequestAuthToken(req({ authorization: 'Bearer bearer-token', xAuthToken: 'header-token' }))).toBe('bearer-token');
    expect(getRequestAuthToken(req({ xAuthToken: 'header-token', cookieToken: 'cookie-token' }))).toBe('header-token');
    expect(getRequestAuthToken(req({ cookieToken: 'cookie-token' }))).toBe('cookie-token');
  });

  test('query-string token auth is disabled unless explicitly enabled', () => {
    const request = req({ queryTokenValue: 'query-token' });

    expect(isQueryTokenAuthEnabled({})).toBe(false);
    expect(queryToken(request, {})).toBeNull();
    expect(hasDisabledQueryToken(request, {})).toBe(true);
    expect(queryToken(request, { ALLOW_QUERY_TOKEN_AUTH: 'true' })).toBe('query-token');
  });
});
