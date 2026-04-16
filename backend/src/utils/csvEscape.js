// Shared CSV field-escaping helper used by trade and analytics exports.
//
// Prevents two classes of output problems:
//   1. CSV-structural injection (embedded commas, quotes, newlines)
//   2. Formula injection in Excel / Sheets / LibreOffice when a cell begins
//      with =, +, -, @, \t, or \r. Prefixing with a single quote neutralizes
//      the formula interpretation without visibly changing the value for a
//      normal viewer.

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = { escapeCsv };
