const {
  expandPermissionsToScopes,
  hasScope,
  resolveEffectiveScopes,
  validateScopes
} = require('../../src/utils/apiScopes');

describe('apiScopes utilities', () => {
  test('maps legacy read permission to read scopes', () => {
    const scopes = expandPermissionsToScopes(['read']);
    expect(scopes).toContain('trades:read');
    expect(scopes).toContain('analytics:read');
    expect(scopes).not.toContain('trades:write');
  });

  test('maps legacy write permission to read+write scopes for compatibility', () => {
    const scopes = expandPermissionsToScopes(['write']);
    expect(scopes).toContain('trades:read');
    expect(scopes).toContain('trades:write');
  });

  test('maps legacy admin permission to admin wildcard scope', () => {
    const scopes = expandPermissionsToScopes(['admin']);
    expect(scopes).toContain('admin:*');
    expect(scopes).toContain('trades:read');
    expect(scopes).toContain('trades:write');
  });

  test('resolveEffectiveScopes merges mapped permissions and explicit scopes', () => {
    const scopes = resolveEffectiveScopes({
      permissions: ['read'],
      scopes: ['alerts:write']
    });

    expect(scopes).toContain('trades:read');
    expect(scopes).toContain('alerts:write');
  });

  test('validateScopes rejects unknown scopes', () => {
    const validation = validateScopes(['trades:read', 'unknown:scope']);
    expect(validation.valid).toBe(false);
    expect(validation.invalid).toEqual(['unknown:scope']);
  });

  test('hasScope accepts admin wildcard', () => {
    expect(hasScope(['admin:*'], 'trades:write')).toBe(true);
  });
});
