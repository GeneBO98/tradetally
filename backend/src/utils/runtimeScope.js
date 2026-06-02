function isBackgroundJobsDisabled() {
  return String(process.env.DISABLE_BACKGROUND_JOBS || '').toLowerCase() === 'true';
}

function getScopedUserEmail() {
  const rawValue = process.env.DEV_SCOPED_USER_EMAIL;
  if (!rawValue) {
    return null;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  return normalized || null;
}

function buildScopedUserCte(paramIndex = 1, cteName = 'scoped_user') {
  const email = getScopedUserEmail();
  if (!email) {
    return {
      enabled: false,
      cte: '',
      params: [],
      ref: cteName
    };
  }

  return {
    enabled: true,
    cte: `${cteName} AS (
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($${paramIndex})
    )`,
    params: [email],
    ref: cteName
  };
}

module.exports = {
  isBackgroundJobsDisabled,
  getScopedUserEmail,
  buildScopedUserCte
};
