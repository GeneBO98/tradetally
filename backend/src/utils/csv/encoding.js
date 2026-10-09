const { isSierraChartBinary } = require('./parsers/sierraChart');

/**
 * Normalize uploaded CSV bytes to UTF-8 before any parsing or logging.
 *
 * Excel and some Windows broker tools save CSVs as UTF-16 (with or without a
 * BOM). Read as UTF-8 those files are full of NUL bytes, which break header
 * detection and make PostgreSQL reject text/jsonb writes
 * ("unsupported Unicode escape sequence").
 */
function detectUtf16(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return { encoding: 'utf16le', bomLength: 2 };
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return { encoding: 'utf16be', bomLength: 2 };
  }

  const sampleLength = Math.min(buffer.length - (buffer.length % 2), 512);
  if (sampleLength < 4) return null;

  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < sampleLength; i += 2) {
    if (buffer[i] === 0) evenZeros++;
    if (buffer[i + 1] === 0) oddZeros++;
  }
  const pairs = sampleLength / 2;
  if (oddZeros / pairs > 0.3 && evenZeros / pairs < 0.05) return { encoding: 'utf16le', bomLength: 0 };
  if (evenZeros / pairs > 0.3 && oddZeros / pairs < 0.05) return { encoding: 'utf16be', bomLength: 0 };
  return null;
}

function decodeUtf16be(buffer) {
  const swapped = Buffer.allocUnsafe(buffer.length - (buffer.length % 2));
  for (let i = 0; i < swapped.length; i += 2) {
    swapped[i] = buffer[i + 1];
    swapped[i + 1] = buffer[i];
  }
  return swapped.toString('utf16le');
}

function normalizeCsvBuffer(input) {
  if (!input) return input;
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  // Binary uploads (Sierra Chart .data activity logs) are decoded by their
  // own parser and must keep their bytes.
  if (isSierraChartBinary(buffer)) return buffer;

  const utf16 = detectUtf16(buffer);
  if (utf16) {
    const body = buffer.subarray(utf16.bomLength);
    const text = utf16.encoding === 'utf16le' ? body.toString('utf16le') : decodeUtf16be(body);
    return Buffer.from(text.replace(/\u0000/g, ''), 'utf8');
  }

  if (buffer.includes(0)) {
    return Buffer.from(buffer.toString('utf8').replace(/\u0000/g, ''), 'utf8');
  }

  return buffer;
}

function stripNullCharacters(value) {
  if (typeof value === 'string') return value.replace(/\u0000/g, '');
  if (Array.isArray(value)) return value.map(stripNullCharacters);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripNullCharacters(item)]));
  }
  return value;
}

module.exports = {
  normalizeCsvBuffer,
  stripNullCharacters
};
