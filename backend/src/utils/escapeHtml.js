/**
 * Escape HTML special characters to prevent XSS in email templates.
 * @param {string} str - The string to escape
 * @returns {string} The escaped string safe for HTML interpolation
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = escapeHtml;
