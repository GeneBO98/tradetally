const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'email-templates');
const EXAMPLE_TEMPLATES_DIR = path.join(__dirname, '..', 'email-templates.example');

/**
 * Load a template file by name from email-templates/ (custom) or email-templates.example/ (default).
 * @param {string} templateName - e.g. 'trial-conversion.html'
 * @returns {string|null} The template contents, or null if not found in either location
 */
function loadTemplate(templateName) {
  const customPath = path.join(TEMPLATES_DIR, templateName);
  if (fs.existsSync(customPath)) {
    return fs.readFileSync(customPath, 'utf8');
  }

  const examplePath = path.join(EXAMPLE_TEMPLATES_DIR, templateName);
  if (fs.existsSync(examplePath)) {
    return fs.readFileSync(examplePath, 'utf8');
  }

  return null;
}

/**
 * Replace {{key}} placeholders in a template string with values from a variables object.
 * @param {string} html - Template string with {{key}} placeholders
 * @param {object} variables - Key-value pairs to substitute
 * @returns {string} Rendered HTML
 */
function renderTemplate(html, variables) {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables.hasOwnProperty(key) ? variables[key] : match;
  });
}

module.exports = { loadTemplate, renderTemplate };
