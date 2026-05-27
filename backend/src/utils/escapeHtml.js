/**
 * Escape HTML special characters to prevent XSS in email templates.
 * Apostrophes are safe in text nodes and many email/template providers render
 * numeric apostrophe entities poorly, so leave them as literal characters.
 * @param {string} str - The string to escape
 * @returns {string} The escaped string safe for HTML interpolation
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = escapeHtml;
