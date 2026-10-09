/**
 * Mask an email address for safe logging.
 * Keeps at most the first two characters of the local part and the full domain.
 * @param {string} email - The email address to mask
 * @returns {string} The masked email (e.g. "jo***@example.com")
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

module.exports = maskEmail;
