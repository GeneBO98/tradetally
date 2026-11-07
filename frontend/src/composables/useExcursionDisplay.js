import { ref, watch } from 'vue'
import { excursionValue } from '@/utils/excursionUnits'
import { formatDecimal } from '@/utils/formatters'

const stored_unit = localStorage.getItem('excursion_display_unit')
const excursion_display_unit = ref(['auto', 'dollars', 'points', 'r'].includes(stored_unit) ? stored_unit : 'auto')
watch(excursion_display_unit, unit => localStorage.setItem('excursion_display_unit', unit))

export function useExcursionDisplay(format_currency) {
  function formatExcursionValue(trade, field) {
    const selected = excursion_display_unit.value
    const unit = selected === 'auto' ? ((trade.instrument_type ?? trade.instrumentType) === 'future' ? 'points' : 'dollars') : selected
    const value = excursionValue(trade, field, unit)
    if (value == null) return '—'
    if (unit === 'r') return `${formatDecimal(value)}R`
    if (unit === 'points') {
      const points = `${formatDecimal(value)} pts`
      return selected === 'auto' ? `${points} (${format_currency(excursionValue(trade, field, 'dollars'), trade)})` : points
    }
    return format_currency(value, trade)
  }
  return { excursion_display_unit, formatExcursionValue }
}
