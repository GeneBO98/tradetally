<template>
  <BaseModal :model-value="modelValue" title="Share trade" size="2xl" @update:model-value="$emit('update:modelValue', $event)">
    <div class="space-y-4">
      <!-- Card preview -->
      <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <canvas ref="canvasRef" class="block w-full" :style="{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }"></canvas>
      </div>

      <!-- Options -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Show dollar amounts</label>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Off shares percentages and R-multiples only - position size stays private.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="showDollarAmounts"
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          :class="showDollarAmounts ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'"
          @click="showDollarAmounts = !showDollarAmounts"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition"
            :class="showDollarAmounts ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <p v-if="copyState" class="text-xs" :class="copyState === 'copied' ? 'text-success' : 'text-danger'">
        {{ copyState === 'copied' ? 'Image copied to clipboard.' : 'Copy failed - your browser may not support image clipboard. Use Download instead.' }}
      </p>
    </div>

    <template #footer>
      <button type="button" class="btn-secondary" @click="copyToClipboard">
        Copy image
      </button>
      <button v-if="canNativeShare" type="button" class="btn-secondary" @click="nativeShare">
        Share
      </button>
      <button type="button" class="btn-primary" @click="downloadImage">
        Download PNG
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { formatTradeDate } from '@/utils/date'

// Social-card dimensions (Open Graph ratio). Rendered at 2x for sharpness.
const CARD_WIDTH = 1200
const CARD_HEIGHT = 630
const SCALE = 2

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  trade: { type: Object, required: true }
})

defineEmits(['update:modelValue'])

const canvasRef = ref(null)
const showDollarAmounts = ref(false)
const copyState = ref('')
const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

const COLORS = {
  background: '#101418',
  surface: '#181e25',
  textPrimary: '#f4f4f5',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  win: '#10b981',
  loss: '#ef4444',
  divider: '#262d36'
}

function themePrimary() {
  // Single source of truth: the CSS token derived from tailwind.config.js.
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim()
  return value || '#F0812A'
}

function num(value) {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(value) {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${value < 0 ? '-' : '+'}$${formatted}`
}

function formatPrice(value) {
  const parsed = num(value)
  if (parsed === null) return '-'
  const decimals = Math.abs(parsed) < 10 ? 4 : 2
  return `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: decimals })}`
}

function formatHoldTime() {
  const entry = props.trade.entry_time ? new Date(props.trade.entry_time) : null
  const exit = props.trade.exit_time ? new Date(props.trade.exit_time) : null
  if (!entry || !exit || Number.isNaN(entry.getTime()) || Number.isNaN(exit.getTime())) return null
  const minutes = Math.max(0, Math.round((exit - entry) / 60000))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`
  }
  const days = Math.floor(minutes / (60 * 24))
  return `${days}d`
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return

  const trade = props.trade
  const pnl = num(trade.pnl) ?? 0
  const pnlPercent = num(trade.pnl_percent ?? trade.pnlPercent)
  const rValue = num(trade.r_value ?? trade.rValue)
  const isWin = pnl >= 0
  const resultColor = isWin ? COLORS.win : COLORS.loss
  const primary = themePrimary()

  canvas.width = CARD_WIDTH * SCALE
  canvas.height = CARD_HEIGHT * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)

  // Background
  ctx.fillStyle = COLORS.background
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 0)
  ctx.fill()

  const PAD = 72

  // Brand mark: three rising tally bars in the theme color + wordmark
  const barWidth = 9
  const barGap = 7
  const baseY = 96
  ctx.fillStyle = primary
  const barHeights = [16, 26, 36]
  barHeights.forEach((h, i) => {
    roundedRect(ctx, PAD + i * (barWidth + barGap), baseY - h, barWidth, h, 3)
    ctx.fill()
  })
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = `600 30px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('TradeTally', PAD + 62, baseY - 2)

  // Date, top right
  ctx.fillStyle = COLORS.textSecondary
  ctx.font = `400 24px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(formatTradeDate(trade.trade_date, 'MMM dd, yyyy'), CARD_WIDTH - PAD, baseY - 4)
  ctx.textAlign = 'left'

  // Symbol + side pill
  const symbolY = 218
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = `700 76px ${FONT}`
  const symbol = String(trade.underlying_symbol || trade.symbol || '').toUpperCase()
  ctx.fillText(symbol, PAD, symbolY)
  const symbolWidth = ctx.measureText(symbol).width

  const side = String(trade.side || '').toUpperCase()
  if (side) {
    ctx.font = `700 24px ${FONT}`
    const pillPadX = 18
    const pillText = side
    const pillWidth = ctx.measureText(pillText).width + pillPadX * 2
    const pillHeight = 44
    const pillX = PAD + symbolWidth + 28
    const pillY = symbolY - 54
    const sideColor = side === 'SHORT' ? COLORS.loss : COLORS.win
    ctx.fillStyle = `${sideColor}26`
    roundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2)
    ctx.fill()
    ctx.fillStyle = sideColor
    ctx.fillText(pillText, pillX + pillPadX, pillY + 31)
  }

  // Hero number: % return by default, dollars when enabled
  const heroY = 380
  ctx.fillStyle = resultColor
  ctx.font = `700 128px ${FONT}`
  let hero
  if (showDollarAmounts.value) {
    hero = formatMoney(pnl)
  } else if (pnlPercent !== null) {
    hero = `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`
  } else if (rValue !== null) {
    hero = `${rValue >= 0 ? '+' : ''}${rValue.toFixed(1)}R`
  } else {
    hero = isWin ? 'WIN' : 'LOSS'
  }
  ctx.fillText(hero, PAD, heroY)
  const heroWidth = ctx.measureText(hero).width

  // Secondary result next to the hero
  ctx.fillStyle = COLORS.textSecondary
  ctx.font = `600 44px ${FONT}`
  const secondaryParts = []
  if (showDollarAmounts.value && pnlPercent !== null) {
    secondaryParts.push(`${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`)
  }
  if (rValue !== null) {
    secondaryParts.push(`${rValue >= 0 ? '+' : ''}${rValue.toFixed(1)}R`)
  }
  if (secondaryParts.length > 0) {
    ctx.fillText(secondaryParts.join('  ·  '), PAD + heroWidth + 36, heroY - 8)
  }

  // Stats row
  const stats = [
    { label: 'ENTRY', value: formatPrice(trade.entry_price) },
    { label: 'EXIT', value: formatPrice(trade.exit_price) }
  ]
  const hold = formatHoldTime()
  if (hold) stats.push({ label: 'HOLD', value: hold })
  if (showDollarAmounts.value && num(trade.quantity) !== null) {
    stats.push({
      label: trade.instrument_type === 'option' ? 'CONTRACTS' : 'SHARES',
      value: num(trade.quantity).toLocaleString('en-US')
    })
  }

  const statsY = 478
  let statX = PAD
  for (const stat of stats) {
    ctx.fillStyle = COLORS.textMuted
    ctx.font = `600 20px ${FONT}`
    ctx.fillText(stat.label, statX, statsY)
    ctx.fillStyle = COLORS.textPrimary
    ctx.font = `600 34px ${FONT}`
    ctx.fillText(stat.value, statX, statsY + 44)
    const width = Math.max(ctx.measureText(stat.value).width, ctx.measureText(stat.label).width)
    statX += width + 72
  }

  // Footer
  ctx.strokeStyle = COLORS.divider
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, CARD_HEIGHT - 86)
  ctx.lineTo(CARD_WIDTH - PAD, CARD_HEIGHT - 86)
  ctx.stroke()

  ctx.fillStyle = COLORS.textMuted
  ctx.font = `500 24px ${FONT}`
  ctx.fillText('Journaled with TradeTally', PAD, CARD_HEIGHT - 40)
  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.textSecondary
  ctx.fillText('tradetally.io', CARD_WIDTH - PAD, CARD_HEIGHT - 40)
  ctx.textAlign = 'left'
}

function exportBlob() {
  return new Promise((resolve, reject) => {
    canvasRef.value.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render image'))
    }, 'image/png')
  })
}

function shareFileName() {
  const symbol = String(props.trade.underlying_symbol || props.trade.symbol || 'trade').toUpperCase()
  const date = String(props.trade.trade_date || '').slice(0, 10)
  return `tradetally-${symbol}${date ? `-${date}` : ''}.png`
}

async function downloadImage() {
  const blob = await exportBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = shareFileName()
  link.click()
  URL.revokeObjectURL(url)
}

async function copyToClipboard() {
  copyState.value = ''
  try {
    const blob = await exportBlob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    copyState.value = 'copied'
  } catch (error) {
    console.error('[SHARE-CARD] Clipboard copy failed:', error)
    copyState.value = 'failed'
  }
}

async function nativeShare() {
  try {
    const blob = await exportBlob()
    const file = new File([blob], shareFileName(), { type: 'image/png' })
    await navigator.share({ files: [file] })
  } catch (error) {
    // User-cancelled shares also land here; nothing to surface.
    if (error?.name !== 'AbortError') {
      console.error('[SHARE-CARD] Native share failed:', error)
    }
  }
}

watch(
  () => [props.modelValue, showDollarAmounts.value, props.trade],
  async ([open]) => {
    if (open) {
      copyState.value = ''
      await nextTick()
      draw()
    }
  },
  { deep: false }
)
</script>
