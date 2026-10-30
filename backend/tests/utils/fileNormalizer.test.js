const zlib = require('zlib');
const {
  normalizeImportFile,
  readZipEntries,
  xlsxToCsv,
  htmlToCsv,
  isSupportedImportFileName,
  unsupportedFileMessage
} = require('../../src/utils/csv/fileNormalizer');

// Minimal ZIP writer (stored or deflate) so the tests need no fixtures on disk.
function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function buildZip(entries, { deflate = true } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const stored = deflate ? zlib.deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, stored);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + stored.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function buildXlsx({ sheets, sharedStrings = [], styles = null }) {
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
</Relationships>`;
  const entries = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/sharedStrings.xml': sst
  };
  if (styles) entries['xl/styles.xml'] = styles;
  sheets.forEach((sheet, i) => {
    entries[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet.xml}</sheetData></worksheet>`;
  });
  return buildZip(entries);
}

const DATE_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd hh:mm:ss"/></numFmts>
<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>
</styleSheet>`;

describe('fileNormalizer', () => {
  describe('xlsx', () => {
    test('converts the data sheet to CSV with shared strings, inline strings, dates and booleans', () => {
      const xlsx = buildXlsx({
        sharedStrings: ['Symbol', 'Qty', 'Price', 'Date', 'Filled', 'AAPL', 'MSFT, Inc'],
        styles: DATE_STYLES,
        sheets: [
          { name: 'Summary', xml: '<row r="1"><c r="A1" t="inlineStr"><is><t>Account summary</t></is></c></row>' },
          {
            name: 'Trades',
            xml: [
              '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>',
              '<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2"><v>100</v></c><c r="C2"><v>1.0000000000000001E-2</v></c><c r="D2" s="1"><v>46036</v></c><c r="E2" t="b"><v>1</v></c></row>',
              '<row r="3"><c r="A3" t="s"><v>6</v></c><c r="B3"><v>-5</v></c><c r="C3"><v>412.5</v></c><c r="D3" s="2"><v>46036.520833333336</v></c><c r="E3" t="b"><v>0</v></c></row>',
              '<row r="4"><c r="A4"></c></row>'
            ].join('')
          }
        ]
      });

      const { csv, sheetName, sheetCount } = xlsxToCsv(xlsx);
      expect(sheetName).toBe('Trades');
      expect(sheetCount).toBe(2);
      expect(csv.split('\n').filter(Boolean)).toEqual([
        'Symbol,Qty,Price,Date,Filled',
        'AAPL,100,0.01,2026-01-14,TRUE',
        '"MSFT, Inc",-5,412.5,2026-01-14 12:30:00,FALSE'
      ]);
    });

    test('normalizeImportFile returns CSV bytes and a .csv file name', () => {
      const xlsx = buildXlsx({
        sharedStrings: ['A', 'B'],
        sheets: [{ name: 'Sheet1', xml: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>2</v></c></row>' }]
      });
      const result = normalizeImportFile(xlsx, 'trading-activity.xlsx');
      expect(result.sourceFormat).toBe('xlsx');
      expect(result.fileName).toBe('trading-activity.csv');
      expect(result.originalFileName).toBe('trading-activity.xlsx');
      expect(result.buffer.toString('utf8')).toBe('A,B\n1,2\n');
    });

    test('rejects a text file with an .xlsx extension', () => {
      expect(() => normalizeImportFile(Buffer.from('a,b\n1,2\n'), 'fake.xlsx')).toThrow(/not an Excel workbook/);
    });
  });

  describe('zip', () => {
    test('reads stored and deflated entries', () => {
      for (const deflate of [true, false]) {
        const entries = readZipEntries(buildZip({ 'a.csv': 'x,y\n1,2\n', 'dir/': '' }, { deflate }));
        expect(entries.map(e => e.name)).toEqual(['a.csv']);
        expect(entries[0].data.toString()).toBe('x,y\n1,2\n');
      }
    });

    test('picks the largest importable entry and skips macOS metadata', () => {
      const zip = buildZip({
        '__MACOSX/._orders.csv': 'junk,junk,junk,junk,junk,junk,junk\n',
        'readme.pdf': 'not a trade file',
        'orders.csv': 'Symbol,Qty\nAAPL,1\n',
        'fills.csv': 'Symbol,Qty\nAAPL,1\nMSFT,2\nTSLA,3\n'
      });
      const result = normalizeImportFile(zip, 'webull_orders_records.zip');
      expect(result.sourceFormat).toBe('zip:text');
      expect(result.archiveEntry).toBe('fills.csv');
      expect(result.fileName).toBe('fills.csv');
      expect(result.originalFileName).toBe('webull_orders_records.zip');
      expect(result.buffer.toString()).toContain('TSLA,3');
    });

    test('converts a workbook found inside a zip', () => {
      const xlsx = buildXlsx({
        sharedStrings: ['Symbol'],
        sheets: [{ name: 'S', xml: '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>ES</t></is></c></row>' }]
      });
      const result = normalizeImportFile(buildZip({ 'export/history.xlsx': xlsx }), 'LBank_Futures_TransactionHistory.zip');
      expect(result.sourceFormat).toBe('zip:xlsx');
      expect(result.buffer.toString()).toBe('Symbol\nES\n');
    });

    test('explains when a zip has nothing importable', () => {
      expect(() => normalizeImportFile(buildZip({ 'statement.pdf': 'x' }), 'export.zip'))
        .toThrow(/No importable file .* It contains: statement.pdf/);
    });

    test('treats a mislabeled zip that is really a workbook as xlsx', () => {
      const xlsx = buildXlsx({
        sharedStrings: ['H'],
        sheets: [{ name: 'S', xml: '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>7</v></c></row>' }]
      });
      expect(normalizeImportFile(xlsx, 'export.zip').sourceFormat).toBe('xlsx');
    });
  });

  describe('html', () => {
    test('extracts the largest table into CSV', () => {
      const html = `<!DOCTYPE html><html><body>
        <table><tr><th>Summary</th></tr><tr><td>Total</td></tr></table>
        <table id="trades">
          <thead><tr><th>Symbol</th><th>Side</th><th colspan="2">Price</th></tr></thead>
          <tbody>
            <tr><td> AAPL </td><td>Buy</td><td>190.10</td><td>USD</td></tr>
            <tr><td>MSFT</td><td>Sell</td><td>412,5</td><td>USD</td></tr>
          </tbody>
        </table></body></html>`;
      expect(htmlToCsv(Buffer.from(html))).toBe('Symbol,Side,Price,\nAAPL,Buy,190.10,USD\nMSFT,Sell,"412,5",USD\n');
      const result = normalizeImportFile(Buffer.from(html), 'ReportHistory-54873621.html');
      expect(result.sourceFormat).toBe('html');
      expect(result.fileName).toBe('ReportHistory-54873621.csv');
    });

    test('detects HTML content behind a .txt extension', () => {
      const html = '<html><body><table><tr><th>A</th></tr><tr><td>1</td></tr></table></body></html>';
      expect(normalizeImportFile(Buffer.from(html), 'report.txt').sourceFormat).toBe('html');
    });
  });

  describe('text and unsupported files', () => {
    test('passes CSV, TXT, .plain and Sierra .data through untouched', () => {
      for (const name of ['trades.csv', 'TradeActivityLogExport.txt', 'IBKR_content_123.plain', 'activity.data']) {
        const buffer = Buffer.from('Symbol\tQty\nAAPL\t1\n');
        const result = normalizeImportFile(buffer, name);
        expect(result.sourceFormat).toBe('text');
        expect(result.buffer).toBe(buffer);
        expect(result.fileName).toBe(name);
      }
    });

    test('gives format-specific hints for files we cannot import', () => {
      expect(isSupportedImportFileName('a.xls')).toBe(false);
      expect(() => normalizeImportFile(Buffer.from('x'), 'trades.xls')).toThrow(/save it as \.xlsx or CSV/);
      expect(() => normalizeImportFile(Buffer.from('x'), 'statement.pdf')).toThrow(/PDF statements cannot be imported/);
      expect(() => normalizeImportFile(Buffer.from('x'), 'Screenshot (12).png')).toThrow(/Screenshots cannot be imported/);
      expect(unsupportedFileMessage('weird.bin')).toMatch(/\.bin files are not supported/);
      try {
        normalizeImportFile(Buffer.from('x'), 'statement.pdf');
      } catch (error) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('UNSUPPORTED_IMPORT_FILE');
      }
    });
  });
});
