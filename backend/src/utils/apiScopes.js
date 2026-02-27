const READ_SCOPES = Object.freeze([
  'trades:read',
  'analytics:read',
  'watchlists:read',
  'accounts:read',
  'investments:read',
  'alerts:read'
]);

const WRITE_SCOPES = Object.freeze([
  'trades:write',
  'watchlists:write',
  'alerts:write'
]);

const ADMIN_SCOPES = Object.freeze([
  'admin:*'
]);

const ALL_SCOPES = Object.freeze([
  ...READ_SCOPES,
  ...WRITE_SCOPES,
  ...ADMIN_SCOPES
]);

function toUniqueStringArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))];
}

function expandPermissionsToScopes(permissions = []) {
  const normalizedPermissions = toUniqueStringArray(permissions);
  const expanded = new Set();

  if (normalizedPermissions.includes('read')) {
    READ_SCOPES.forEach((scope) => expanded.add(scope));
  }

  if (normalizedPermissions.includes('write')) {
    // Write permission implies read access for backward compatibility.
    READ_SCOPES.forEach((scope) => expanded.add(scope));
    WRITE_SCOPES.forEach((scope) => expanded.add(scope));
  }

  if (normalizedPermissions.includes('admin')) {
    READ_SCOPES.forEach((scope) => expanded.add(scope));
    WRITE_SCOPES.forEach((scope) => expanded.add(scope));
    ADMIN_SCOPES.forEach((scope) => expanded.add(scope));
  }

  return [...expanded];
}

function resolveEffectiveScopes({ permissions, scopes } = {}) {
  const explicitScopes = toUniqueStringArray(scopes);
  const permissionScopes = expandPermissionsToScopes(permissions);
  return toUniqueStringArray([...permissionScopes, ...explicitScopes]);
}

function validateScopes(scopes = []) {
  const normalized = toUniqueStringArray(scopes);
  const invalid = normalized.filter((scope) => !ALL_SCOPES.includes(scope));
  return {
    valid: invalid.length === 0,
    invalid
  };
}

function hasScope(scopes = [], requiredScope) {
  const normalized = toUniqueStringArray(scopes);

  if (normalized.includes('admin:*')) {
    return true;
  }

  if (!requiredScope) {
    return true;
  }

  return normalized.includes(requiredScope);
}

module.exports = {
  ADMIN_SCOPES,
  ALL_SCOPES,
  READ_SCOPES,
  WRITE_SCOPES,
  expandPermissionsToScopes,
  hasScope,
  resolveEffectiveScopes,
  validateScopes
};
