const ACCOUNT_HEADER_PATTERNS = [
  'account',
  'accountid',
  'accountnumber',
  'accountidentifier',
  'acct',
  'acctid',
  'tradeaccount',
  'brokerageaccount',
  'tradingaccount',
  'portfolio'
]

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '')
}

export function findAccountHeader(headers = []) {
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    if (!normalized) continue
    if (ACCOUNT_HEADER_PATTERNS.some(pattern => normalized === pattern || normalized.includes(pattern))) {
      return header
    }
  }
  return null
}

export function collectAccountIdentifiersFromSamples(headers = [], sampleRows = {}) {
  const accountHeader = findAccountHeader(headers)
  if (!accountHeader) return []

  const values = sampleRows?.[accountHeader] || []
  const identifiers = new Set()
  for (const value of values) {
    const str = value === undefined || value === null ? '' : String(value).trim()
    if (str) identifiers.add(str)
  }
  return [...identifiers]
}

// Sierra daily logs are named like
// `TradeActivityLog_20260908_UTC.<account>.data`, simulated days add
// `.simulated` (`TradeActivityLog_20260903_UTC.Sim1.simulated.data`). Only
// `.data` daily logs carry the account in the name.
export function extractFilenameAccount(fileName) {
  const raw = String(fileName || '').trim()
  if (!raw || !/\.data$/i.test(raw)) return null
  const base = raw.replace(/\.data$/i, '').replace(/\.simulated$/i, '')
  const segments = base.split('.')
  if (segments.length < 2) return null
  const account = segments[segments.length - 1]
  return account && account.trim() ? account.trim() : null
}
