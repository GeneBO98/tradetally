// Mobile keyboards can silently inject invisible characters (zero-width
// spaces/joiners, word joiner, BOM, soft hyphen) or stray whitespace into
// typed emails. These pass email-format validation but never match a stored
// address, so login/password-reset fails with "Invalid credentials" even
// though the visible characters are correct (issue #362).
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

function normalizeEmail(email) {
  if (typeof email !== 'string') return email;
  return email.replace(INVISIBLE_CHARS_REGEX, '').trim().toLowerCase();
}

module.exports = { normalizeEmail, INVISIBLE_CHARS_REGEX };
