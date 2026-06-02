/**
 * CSV preview parsing for the import column-mapping flow.
 * Handles semicolon/tab exports (e.g. NinjaTrader) where decimal commas must not
 * be mistaken for column delimiters.
 */

export const CSV_DELIMITERS = [',', ';', '\t', '|']

const HEADER_KEYWORDS = [
  'date', 'time', 'symbol', 'side', 'type', 'action', 'price', 'qty', 'quantity',
  'commission', 'description', 'order', 'profit', 'pnl', 'fill', 'entry', 'exit',
  'trade', 'status', 'account', 'instrument', 'position', 'rate', 'connection'
]

export function splitCSVLine(line, delimiter) {
  return line
    .split(delimiter)
    .map(cell => cell.trim().replace(/^["']|["']$/g, ''))
}

export function countDelimiterSplits(line, delimiter) {
  if (!line || !delimiter) return 0
  return line.split(delimiter).length - 1
}

/**
 * Pick the delimiter that yields the most columns on this line.
 * Optional preferred delimiter wins when it produces at least 2 columns.
 */
export function detectBestDelimiter(line, preferredDelimiter = null) {
  if (!line) return preferredDelimiter || ','

  if (preferredDelimiter && countDelimiterSplits(line, preferredDelimiter) >= 1) {
    return preferredDelimiter
  }

  let bestDelimiter = ','
  let bestCount = 0
  for (const delimiter of CSV_DELIMITERS) {
    const count = countDelimiterSplits(line, delimiter)
    if (count > bestCount) {
      bestCount = count
      bestDelimiter = delimiter
    }
  }

  return bestCount >= 1 ? bestDelimiter : (preferredDelimiter || ',')
}

function countHeaderKeywordMatches(fields) {
  const lowerFields = fields.map(field => field.toLowerCase())
  return lowerFields.filter(field =>
    HEADER_KEYWORDS.some(keyword => field.includes(keyword))
  ).length
}

/**
 * Find the most likely header row and delimiter in the first N lines.
 */
export function findHeaderLineInfo(lines, options = {}) {
  const maxLines = options.maxLines ?? 15
  const preferredDelimiter = options.delimiter ?? null
  let fallback = null

  for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
    const line = lines[i].trim()
    if (!line) continue

    const delimiter = detectBestDelimiter(line, preferredDelimiter)
    const fields = splitCSVLine(line, delimiter).filter(Boolean)
    if (fields.length < 2) continue

    const keywordMatches = countHeaderKeywordMatches(fields)
    const candidate = { line, index: i, delimiter, fields, keywordMatches }

    if (keywordMatches >= 2) {
      return candidate
    }

    if (!fallback || fields.length > fallback.fields.length) {
      fallback = candidate
    }
  }

  return fallback
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/**
 * Parse headers and sample rows for the mapping modal / import pre-check.
 */
export async function parseCSVFilePreview(file, options = {}) {
  if (!file) {
    return { headers: [], sampleRows: {}, delimiter: options.delimiter || ',' }
  }

  try {
    const text = await readFileAsText(file)
    const lines = text.split(/\r?\n/)
    const hasHeaderRow = options.has_header_row !== false

    const headerInfo = findHeaderLineInfo(lines, {
      delimiter: options.delimiter,
      maxLines: options.maxLines
    })

    if (!headerInfo) {
      return { headers: [], sampleRows: {}, delimiter: options.delimiter || ',' }
    }

    const delimiter = options.delimiter || headerInfo.delimiter
    const headers = splitCSVLine(headerInfo.line, delimiter).filter(Boolean)

    if (headers.length < 2) {
      return { headers: [], sampleRows: {}, delimiter }
    }

    const samples = {}
    headers.forEach(header => {
      samples[header] = []
    })

    const startIndex = hasHeaderRow ? headerInfo.index + 1 : headerInfo.index
    const sampleCount = options.sampleCount ?? 2
    let collected = 0

    for (let i = startIndex; i < lines.length && collected < sampleCount; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = splitCSVLine(line, delimiter)
      headers.forEach((header, idx) => {
        if (cols[idx] !== undefined) {
          samples[header].push(cols[idx])
        }
      })
      collected++
    }

    return { headers, sampleRows: samples, delimiter }
  } catch {
    return { headers: [], sampleRows: {}, delimiter: options.delimiter || ',' }
  }
}

export async function parseCSVHeaders(file, options = {}) {
  const { headers } = await parseCSVFilePreview(file, {
    ...options,
    sampleCount: 0
  })
  return headers
}

export async function parseCSVSampleRows(file, headers, options = {}) {
  if (!file || !headers?.length) return {}
  const { sampleRows } = await parseCSVFilePreview(file, {
    ...options,
    sampleCount: options.sampleCount ?? 2
  })
  return sampleRows
}
