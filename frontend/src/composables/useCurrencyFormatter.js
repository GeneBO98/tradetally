import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

// Currency metadata for symbol extraction and display
const CURRENCY_OPTIONS = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'KRW', name: 'South Korean Won', symbol: '\u20A9' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'z\u0142' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'K\u010D' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '\u20AA' },
  { code: 'THB', name: 'Thai Baht', symbol: '\u0E3F' }
]

export { CURRENCY_OPTIONS }

export function useCurrencyFormatter() {
  const authStore = useAuthStore()

  const currencyCode = computed(() => {
    return authStore.user?.settings?.display_currency || 'USD'
  })

  const currencySymbol = computed(() => {
    const match = CURRENCY_OPTIONS.find(c => c.code === currencyCode.value)
    if (match) return match.symbol
    // Fallback: use Intl to extract symbol
    try {
      const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode.value }).formatToParts(0)
      const symbolPart = parts.find(p => p.type === 'currency')
      return symbolPart ? symbolPart.value : currencyCode.value
    } catch {
      return '$'
    }
  })

  /**
   * Format a value as currency using the user's display currency.
   * @param {number} value
   * @param {object} [options]
   * @param {number} [options.minimumFractionDigits=2]
   * @param {number} [options.maximumFractionDigits=2]
   * @param {boolean} [options.compact=false] - Use K/M/B abbreviations
   * @param {boolean} [options.abs=false] - Format absolute value
   */
  function formatCurrency(value, options = {}) {
    if (value === null || value === undefined || isNaN(value)) return '-'

    const {
      minimumFractionDigits = 2,
      maximumFractionDigits = 2,
      compact = false,
      abs = false
    } = options

    const num = abs ? Math.abs(value) : value

    if (compact) {
      const absVal = Math.abs(num)
      const sign = num < 0 ? '-' : ''
      const sym = currencySymbol.value
      if (absVal >= 1e12) return `${sign}${sym}${(absVal / 1e12).toFixed(1)}T`
      if (absVal >= 1e9) return `${sign}${sym}${(absVal / 1e9).toFixed(1)}B`
      if (absVal >= 1e6) return `${sign}${sym}${(absVal / 1e6).toFixed(1)}M`
      if (absVal >= 1e3) return `${sign}${sym}${(absVal / 1e3).toFixed(1)}K`
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode.value,
      minimumFractionDigits,
      maximumFractionDigits
    }).format(num)
  }

  /**
   * Format a value with explicit +/- sign prefix.
   * e.g., "+$1,234.56" or "-$567.89"
   */
  function formatSignedCurrency(value, options = {}) {
    if (value === null || value === undefined || isNaN(value)) return '-'
    const formatted = formatCurrency(Math.abs(value), { ...options, abs: false })
    const sign = value >= 0 ? '+' : '-'
    return `${sign}${formatted}`
  }

  /**
   * Format just the numeric part (no currency symbol).
   * Useful when the template handles the symbol separately.
   */
  function formatNumber(value, { minimumFractionDigits = 2, maximumFractionDigits = 2 } = {}) {
    if (value === null || value === undefined || isNaN(value)) return '0.00'
    return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })
  }

  return {
    currencyCode,
    currencySymbol,
    formatCurrency,
    formatSignedCurrency,
    formatNumber
  }
}
