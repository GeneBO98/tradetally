const zlib = require('zlib');
const cheerio = require('cheerio');

/**
 * Turn the non-CSV exports users actually upload (Excel workbooks, zipped
 * exports, HTML reports) into CSV bytes before broker detection and parsing.
 *
 * Everything downstream (detect.js, parseCSV, account detection, the stored
 * diagnostics) only ever sees CSV text, so this runs once at the upload
 * boundary and the rest of the import pipeline stays unchanged.
 */

const TEXT_EXTENSIONS = new Set(['csv', 'txt', 'tsv', 'plain', 'text', 'data']);
const WORKBOOK_EXTENSIONS = new Set(['xlsx', 'xlsm']);
const ARCHIVE_EXTENSIONS = new Set(['zip']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

const SUPPORTED_IMPORT_EXTENSIONS = [
  ...TEXT_EXTENSIONS, ...WORKBOOK_EXTENSIONS, ...ARCHIVE_EXTENSIONS, ...HTML_EXTENSIONS
];

// Extensions we recognise but cannot turn into trade rows. Each gets a
// specific hint instead of the generic "invalid file type".
const UNSUPPORTED_HINTS = {
  xls: 'Legacy Excel .xls workbooks are not supported. Open the file in Excel or LibreOffice and save it as .xlsx or CSV.',
  pdf: 'PDF statements cannot be imported. Export your trades as CSV or Excel from your broker instead.',
  png: 'Screenshots cannot be imported. Export your trades as CSV or Excel from your broker instead.',
  jpg: 'Screenshots cannot be imported. Export your trades as CSV or Excel from your broker instead.',
  jpeg: 'Screenshots cannot be imported. Export your trades as CSV or Excel from your broker instead.',
  numbers: 'Apple Numbers files are not supported. Export the sheet as CSV or Excel (.xlsx).',
  ods: 'OpenDocument spreadsheets are not supported. Save the sheet as .xlsx or CSV.'
};

// Guard rails for archives/workbooks: a 50MB upload must not inflate into
// something that exhausts the worker.
const MAX_INFLATED_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2000;

function importFileError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'UNSUPPORTED_IMPORT_FILE';
  Object.assign(error, details);
  return error;
}

function getFileExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function isSupportedImportFileName(fileName) {
  return SUPPORTED_IMPORT_EXTENSIONS.includes(getFileExtension(fileName));
}

function unsupportedFileMessage(fileName) {
  const extension = getFileExtension(fileName);
  if (UNSUPPORTED_HINTS[extension]) return UNSUPPORTED_HINTS[extension];
  const shown = extension ? `.${extension}` : 'this';
  return `${shown} files are not supported. Upload a CSV, TXT, Excel (.xlsx), HTML report, or a ZIP containing one of those.`;
}

// ---------------------------------------------------------------------------
// ZIP reader (central directory + local headers, stored/deflate only)
// ---------------------------------------------------------------------------

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50;

function isZipBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.readUInt32LE(0) === ZIP_LOCAL_HEADER;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIR) return offset;
  }
  return -1;
}

/**
 * @returns {Array<{name: string, data: Buffer}>} every file entry, decompressed
 */
function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw importFileError('The ZIP archive is damaged or uses an unsupported (ZIP64) layout.');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > MAX_ARCHIVE_ENTRIES) throw importFileError('The ZIP archive contains too many files.');

  const entries = [];
  let cursor = centralDirOffset;
  let inflatedTotal = 0;
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_HEADER) {
      throw importFileError('The ZIP archive is damaged (bad central directory).');
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue; // directory

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_HEADER) {
      throw importFileError(`The ZIP archive is damaged (bad entry "${name}").`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    inflatedTotal += uncompressedSize;
    if (inflatedTotal > MAX_INFLATED_BYTES) throw importFileError('The ZIP archive expands to more than 200MB.');

    let data;
    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_INFLATED_BYTES });
    } else {
      throw importFileError(`"${name}" inside the ZIP uses an unsupported compression method.`);
    }
    entries.push({ name, data });
  }
  return entries;
}

function isXlsxArchive(entries) {
  return entries.some(entry => entry.name === 'xl/workbook.xml');
}

// ---------------------------------------------------------------------------
// XLSX reader (OOXML: shared strings, cell styles for dates, sheet XML)
// ---------------------------------------------------------------------------

const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58
]);

function loadXml(text) {
  return cheerio.load(text, { xml: { xmlMode: true, decodeEntities: true } });
}

function entryText(entries, name) {
  const entry = entries.find(item => item.name === name || item.name === name.replace(/^\//, ''));
  return entry ? entry.data.toString('utf8') : null;
}

function isDateFormatCode(code) {
  if (!code) return false;
  // Strip quoted literals, bracketed colour/locale codes and escapes before
  // looking for date tokens, so "0.00 \"USD\"" is not mistaken for a date.
  const cleaned = String(code)
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '');
  return /[ymdhs]/i.test(cleaned) && !/^[#0,.?% E+-]*$/i.test(cleaned);
}

function readDateStyles(entries) {
  const stylesXml = entryText(entries, 'xl/styles.xml');
  const dateStyles = new Set();
  if (!stylesXml) return dateStyles;
  const $ = loadXml(stylesXml);
  const customFormats = new Map();
  $('numFmts > numFmt').each((_, node) => {
    const id = Number($(node).attr('numFmtId'));
    customFormats.set(id, $(node).attr('formatCode') || '');
  });
  $('cellXfs > xf').each((index, node) => {
    const numFmtId = Number($(node).attr('numFmtId') || 0);
    if (BUILTIN_DATE_FORMAT_IDS.has(numFmtId) || isDateFormatCode(customFormats.get(numFmtId))) {
      dateStyles.add(index);
    }
  });
  return dateStyles;
}

function readSharedStrings(entries) {
  const xml = entryText(entries, 'xl/sharedStrings.xml');
  if (!xml) return [];
  const $ = loadXml(xml);
  const strings = [];
  $('sst > si').each((_, node) => {
    // Rich-text runs split one string across several <t> nodes.
    strings.push($(node).find('t').map((__, t) => $(t).text()).get().join(''));
  });
  return strings;
}

function readSheetList(entries) {
  const workbookXml = entryText(entries, 'xl/workbook.xml');
  if (!workbookXml) throw importFileError('The Excel workbook has no sheet index (xl/workbook.xml).');
  const relsXml = entryText(entries, 'xl/_rels/workbook.xml.rels') || '';
  const $rels = loadXml(relsXml);
  const targets = new Map();
  $rels('Relationship').each((_, node) => {
    const target = String($rels(node).attr('Target') || '');
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    targets.set($rels(node).attr('Id'), path.replace(/^xl\/xl\//, 'xl/'));
  });
  const $wb = loadXml(workbookXml);
  const sheets = [];
  $wb('sheets > sheet').each((index, node) => {
    const relId = $wb(node).attr('r:id') || $wb(node).attr('id');
    const path = targets.get(relId) || `xl/worksheets/sheet${index + 1}.xml`;
    sheets.push({ name: $wb(node).attr('name') || `Sheet${index + 1}`, path });
  });
  return sheets;
}

function columnIndexFromRef(ref) {
  const letters = String(ref || '').match(/^[A-Z]+/i);
  if (!letters) return null;
  let index = 0;
  for (const char of letters[0].toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function excelSerialToIso(serial) {
  const value = Number(serial);
  if (!Number.isFinite(value)) return String(serial);
  const wholeDays = Math.floor(value);
  const fraction = value - wholeDays;
  const seconds = Math.round(fraction * 86400);
  const date = new Date(EXCEL_EPOCH_MS + wholeDays * 86400000 + seconds * 1000);
  const iso = date.toISOString();
  return seconds === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function formatNumericCell(raw) {
  // Sheet XML stores floats like 1.0000000000000001E-2; Number() normalises them.
  const value = Number(raw);
  if (!Number.isFinite(value)) return String(raw);
  return String(value);
}

function readSheetRows(xml, { sharedStrings, dateStyles }) {
  const $ = loadXml(xml);
  const rows = [];
  $('sheetData > row').each((_, rowNode) => {
    const cells = [];
    let fallbackColumn = 0;
    $(rowNode).children('c').each((__, cellNode) => {
      const $cell = $(cellNode);
      const column = columnIndexFromRef($cell.attr('r'));
      const index = column === null ? fallbackColumn : column;
      fallbackColumn = index + 1;
      const type = $cell.attr('t') || 'n';
      const style = Number($cell.attr('s') || -1);
      const rawValue = $cell.children('v').text();
      let value = '';
      if (type === 's') {
        value = sharedStrings[Number(rawValue)] ?? '';
      } else if (type === 'inlineStr') {
        value = $cell.find('is t').map((___, t) => $(t).text()).get().join('');
      } else if (type === 'str') {
        value = rawValue;
      } else if (type === 'b') {
        value = rawValue === '1' ? 'TRUE' : 'FALSE';
      } else if (type === 'e') {
        value = '';
      } else if (type === 'd') {
        value = rawValue;
      } else if (rawValue !== '') {
        value = dateStyles.has(style) ? excelSerialToIso(rawValue) : formatNumericCell(rawValue);
      }
      cells[index] = value;
    });
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.some(cell => String(cell).trim() !== '')) rows.push(cells);
  });
  return rows;
}

function csvEscapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows
    .map(row => {
      const padded = row.slice();
      while (padded.length < width) padded.push('');
      return padded.map(csvEscapeCell).join(',');
    })
    .join('\n') + '\n';
}

/**
 * Convert the sheet that looks most like a trade table (most non-empty rows)
 * into CSV text.
 * @returns {{csv: string, sheetName: string, sheetCount: number}}
 */
function xlsxEntriesToCsv(entries) {
  const sharedStrings = readSharedStrings(entries);
  const dateStyles = readDateStyles(entries);
  const sheets = readSheetList(entries);
  let best = null;
  for (const sheet of sheets) {
    const xml = entryText(entries, sheet.path);
    if (!xml) continue;
    const rows = readSheetRows(xml, { sharedStrings, dateStyles });
    if (rows.length >= 2 && (!best || rows.length > best.rows.length)) {
      best = { sheet, rows };
    }
  }
  if (!best) throw importFileError('The Excel workbook has no sheet with a header row and data rows.');
  return { csv: rowsToCsv(best.rows), sheetName: best.sheet.name, sheetCount: sheets.length };
}

function xlsxToCsv(buffer) {
  return xlsxEntriesToCsv(readZipEntries(buffer));
}

// ---------------------------------------------------------------------------
// HTML report → CSV (largest table wins)
// ---------------------------------------------------------------------------

function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, 2048).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<table');
}

function htmlToCsv(buffer) {
  const $ = cheerio.load(buffer.toString('utf8'));
  let best = null;
  $('table').each((_, table) => {
    // Skip nested tables: their rows are counted by the outer table already.
    if ($(table).parents('table').length) return;
    const rows = [];
    $(table).find('tr').each((__, tr) => {
      if ($(tr).parents('table')[0] !== table) return;
      const cells = $(tr).children('th,td').map((___, cell) => {
        const text = $(cell).text().replace(/\s+/g, ' ').trim();
        const span = Math.max(1, Number($(cell).attr('colspan') || 1));
        return [text, ...new Array(span - 1).fill('')];
      }).get();
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (cells.some(cell => cell !== '')) rows.push(cells);
    });
    if (rows.length >= 2 && (!best || rows.length > best.length)) best = rows;
  });
  if (!best) throw importFileError('No table with a header row and data rows was found in the HTML report.');
  return rowsToCsv(best);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const ARCHIVE_SKIP_PATTERN = /(^|\/)(__MACOSX|\.)/;

function pickArchiveEntry(entries, archiveName) {
  const candidates = entries.filter(entry =>
    !ARCHIVE_SKIP_PATTERN.test(entry.name) && isSupportedImportFileName(entry.name) && !ARCHIVE_EXTENSIONS.has(getFileExtension(entry.name))
  );
  if (!candidates.length) {
    const listed = entries.slice(0, 8).map(entry => entry.name.split('/').pop()).join(', ');
    throw importFileError(
      `No importable file (CSV, TXT, Excel or HTML) was found inside ${archiveName || 'the ZIP'}.${listed ? ` It contains: ${listed}.` : ''}`
    );
  }
  candidates.sort((a, b) => b.data.length - a.data.length);
  return candidates[0];
}

/**
 * Normalize an uploaded broker export into CSV bytes.
 *
 * @param {Buffer} input raw upload
 * @param {string} fileName original file name (drives format detection)
 * @returns {{buffer: Buffer, fileName: string, originalFileName: string, sourceFormat: string, sheetName?: string, archiveEntry?: string}}
 * @throws {Error} with statusCode 400 when the file cannot be imported
 */
function normalizeImportFile(input, fileName) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || '');
  const originalFileName = fileName || 'upload';
  const extension = getFileExtension(originalFileName);

  if (!isSupportedImportFileName(originalFileName)) {
    throw importFileError(unsupportedFileMessage(originalFileName), { extension });
  }

  if (ARCHIVE_EXTENSIONS.has(extension) || (isZipBuffer(buffer) && !WORKBOOK_EXTENSIONS.has(extension))) {
    const entries = readZipEntries(buffer);
    if (isXlsxArchive(entries)) {
      // A .zip (or mislabeled file) that is really a workbook.
      const workbook = xlsxEntriesToCsv(entries);
      return {
        buffer: Buffer.from(workbook.csv, 'utf8'),
        fileName: originalFileName.replace(/\.[a-z0-9]+$/i, '.csv'),
        originalFileName,
        sourceFormat: 'xlsx',
        sheetName: workbook.sheetName
      };
    }
    const entry = pickArchiveEntry(entries, originalFileName);
    const inner = normalizeImportFile(entry.data, entry.name.split('/').pop());
    return { ...inner, originalFileName, sourceFormat: `zip:${inner.sourceFormat}`, archiveEntry: entry.name };
  }

  if (WORKBOOK_EXTENSIONS.has(extension)) {
    if (!isZipBuffer(buffer)) {
      throw importFileError('The file has an Excel extension but is not an Excel workbook. If it is a CSV, rename it to .csv.');
    }
    const workbook = xlsxToCsv(buffer);
    return {
      buffer: Buffer.from(workbook.csv, 'utf8'),
      fileName: originalFileName.replace(/\.[a-z0-9]+$/i, '.csv'),
      originalFileName,
      sourceFormat: 'xlsx',
      sheetName: workbook.sheetName
    };
  }

  if (HTML_EXTENSIONS.has(extension) || (extension !== 'data' && looksLikeHtml(buffer))) {
    return {
      buffer: Buffer.from(htmlToCsv(buffer), 'utf8'),
      fileName: originalFileName.replace(/\.[a-z0-9]+$/i, '.csv'),
      originalFileName,
      sourceFormat: 'html'
    };
  }

  // CSV / TXT / TSV / .plain / Sierra Chart .data pass straight through; the
  // existing parsers handle delimiters and binary Sierra files themselves.
  return { buffer, fileName: originalFileName, originalFileName, sourceFormat: 'text' };
}

module.exports = {
  normalizeImportFile,
  isSupportedImportFileName,
  unsupportedFileMessage,
  getFileExtension,
  SUPPORTED_IMPORT_EXTENSIONS,
  // exported for tests
  readZipEntries,
  xlsxToCsv,
  htmlToCsv,
  rowsToCsv
};
