// Design-system consistency guard. Each rule here reflects a convention in
// src/assets/main.css (see the comments there). If a rule fails, prefer the
// shared class it names over adding the file to an allowlist.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname)
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}
const files = walk(ROOT).map(f => ({ path: relative(ROOT, f), text: readFileSync(f, 'utf8') }))
const classStrings = text => [
  ...[...text.matchAll(/(?<![:@])class="([^"]*)"/g)].map(m => m[1]),
  ...[...text.matchAll(/:class="([^"]*)"/g)].flatMap(m => [...m[1].matchAll(/'([^']*)'/g)].map(q => q[1]))
]
const offenders = pred => files.filter(pred).map(f => f.path)

// Intentional exceptions: full-screen media/celebration overlays and the
// presentation-style Year Wrapped slides.
const FULLSCREEN_OVERLAYS = [
  'components/trades/TradeImageViewer.vue',
  'components/gamification/CelebrationOverlay.vue',
  'components/layout/Sidebar.vue',
  'components/yearWrapped/YearWrappedModal.vue'
]
const PRESENTATION = path => path.includes('components/yearWrapped/') || path.endsWith('CelebrationOverlay.vue')

describe('design system consistency', () => {
  it('uses the theme accent instead of hardcoded blue/indigo/sky/violet', () => {
    const re = /(?:^|[\s"'`:])(?:bg|text|border|ring|from|to|via|divide|placeholder)-(?:blue|indigo|sky|violet)-\d+/
    expect(offenders(f => re.test(f.text))).toEqual([])
  })

  it('does not reference undefined palette steps', () => {
    expect(offenders(f => /gray-(?:750|850)\b/.test(f.text))).toEqual([])
  })

  it('builds dialogs on the shared modal classes', () => {
    const bad = offenders(f =>
      /fixed inset-0/.test(f.text) &&
      !/modal-overlay|modal-backdrop|modal-panel|BaseModal/.test(f.text) &&
      !FULLSCREEN_OVERLAYS.includes(f.path)
    )
    expect(bad).toEqual([])
  })

  it('keeps one surface radius (rounded-lg) outside presentation views', () => {
    expect(offenders(f => !PRESENTATION(f.path) && /rounded-(?:2xl|3xl)\b/.test(f.text))).toEqual([])
  })

  it('styles uppercase table headers with .table-th', () => {
    const bad = offenders(f =>
      [...f.text.matchAll(/<th\b[^>]*?\sclass="([^"]*)"/g)].some(m =>
        /\buppercase\b/.test(m[1]) && /\btracking-wider?\b/.test(m[1]) && !/\btable-th\b/.test(m[1])
      )
    )
    expect(bad).toEqual([])
  })

  it('keeps white button text on the contrast-safe primary-700 fill', () => {
    const bad = offenders(f => classStrings(f.text).some(c => /(?<![:\w-])bg-primary-600\b/.test(c) && /\btext-white\b/.test(c)))
    expect(bad).toEqual([])
  })

  it('uses .heading-page for every page title', () => {
    const bad = offenders(f =>
      [...f.text.matchAll(/<h1\b[^>]*?\sclass="([^"]*)"/g)].some(m => !/\bheading-page\b/.test(m[1]))
    )
    expect(bad).toEqual([])
  })

  it('keeps persistent text at 12px or larger', () => {
    const bad = offenders(f => !f.path.endsWith('layout/Sidebar.vue') && !PRESENTATION(f.path) && /text-\[(?:[6-9]|1[01])px\]/.test(f.text))
    expect(bad).toEqual([])
  })

  it('does not use the undefined text-md size', () => {
    expect(offenders(f => /\btext-md\b/.test(f.text))).toEqual([])
  })

  it('gives every table header row the .table-head treatment', () => {
    const bad = offenders(f => [...f.text.matchAll(/<thead\b([^>]*)>/g)].some(m => !/\btable-head\b/.test(m[1])))
    expect(bad).toEqual([])
  })

  it('uses the contrast-safe 700 shade for green and accent text on light surfaces', () => {
    const re = /(?:^|[\s"'`])text-(?:green|primary)-600\b/
    expect(offenders(f => re.test(f.text))).toEqual([])
  })

  it('gives dialogs a responsive width instead of a fixed w-96', () => {
    expect(offenders(f => /modal-panel[^"]*(?<![:\w-])w-96\b/.test(f.text))).toEqual([])
  })

  it('keeps JavaScript-generated badge classes on the shared primitive', () => {
    const js = readFileSync(join(ROOT, 'utils', 'tradeBadges.js'), 'utf8')
    expect(/text-\[\d+px\]/.test(js)).toBe(false)
    expect(/\bbadge\b/.test(js)).toBe(true)
  })

  it('uses one warning ramp (yellow) and one win green; no emerald/amber/cyan/teal/sky/rose', () => {
    const re = /(?:^|[\s"'`:])(?:bg|text|border|ring|from|to|via|divide)-(?:emerald|amber|cyan|teal|sky|rose)-\d+/
    expect(offenders(f => !PRESENTATION(f.path) && re.test(f.text))).toEqual([])
  })

  it('keeps purple to the gamification rarity scale', () => {
    const re = /(?:bg|text|border|ring)-purple-\d+/
    expect(offenders(f => !PRESENTATION(f.path) && !/[Gg]amification/.test(f.path) && re.test(f.text))).toEqual([])
  })

  it('only references button classes that exist in main.css', () => {
    const css = readFileSync(join(ROOT, 'assets', 'main.css'), 'utf8')
    const defined = new Set([...css.matchAll(/\.(btn[\w-]*)\s*\{/g)].map(m => m[1]))
    const bad = offenders(f => !PRESENTATION(f.path) && [...f.text.matchAll(/\b(btn-[\w-]+)\b/g)].some(m => !defined.has(m[1])))
    expect(bad).toEqual([])
  })

  it('has retired the legacy ring-opacity surface recipe', () => {
    expect(offenders(f => /ring-black ring-opacity-5/.test(f.text))).toEqual([])
  })

  it('keeps the shared stylesheets on the surface radius too', () => {
    const extra = readdirSync(join(ROOT, 'assets')).filter(n => n.endsWith('.css')).map(n => readFileSync(join(ROOT, 'assets', n), 'utf8'))
    expect(extra.some(t => /rounded-(?:xl|2xl|3xl)\b/.test(t))).toBe(false)
  })

  it('puts every table header cell on .table-th', () => {
    const bad = offenders(f => [...f.text.matchAll(/<th\b([^>]*)>/g)].some(m => !/\btable-th\b/.test(m[1]) && !/\bsr-only\b/.test(m[1])))
    expect(bad).toEqual([])
  })

  it('does not use orange as a second warning ramp', () => {
    expect(offenders(f => !PRESENTATION(f.path) && /(?:bg|text|border|ring)-orange-\d+/.test(f.text))).toEqual([])
  })

  it('keeps the win green and loss red tokens in tailwind.config.js', () => {
    const cfg = readFileSync(join(ROOT, '..', 'tailwind.config.js'), 'utf8')
    expect(cfg).toMatch(/success: '#15803d'/)
    expect(cfg).not.toMatch(/#10b981|#f59e0b/i)
  })

  it('keeps chart and effect colours on the one win green and the yellow warning ramp', () => {
    const re = /#(?:059669|10b981|16a34a|d97706|f59e0b)\b/i
    const vue = offenders(f => !PRESENTATION(f.path) && re.test(f.text))
    const js = readdirSync(join(ROOT, 'lib')).filter(n => n.endsWith('.js')).filter(n => re.test(readFileSync(join(ROOT, 'lib', n), 'utf8')))
    expect(vue).toEqual([])
    expect(js).toEqual([])
  })

  it('leaves disabled styling to the shared .btn rule', () => {
    const bad = offenders(f => classStrings(f.text).some(c => /\bbtn(?:-\w+)?\b/.test(c) && /\bdisabled:opacity-\d+/.test(c)))
    expect(bad).toEqual([])
  })

  it('uses two table body densities: px-4 py-3 (standard) or px-3 py-2 (compact)', () => {
    const bad = offenders(f => [...f.text.matchAll(/<td\b[^>]*?\sclass="([^"]*)"/g)].some(m => {
      const t = m[1].split(/\s+/)
      const px = t.filter(x => /^px-/.test(x)).join(' '), py = t.filter(x => /^py-/.test(x)).join(' ')
      if (!px && !py) return false
      return !((px === 'px-4' && py === 'py-3') || (px === 'px-3' && py === 'py-2') || (px === '' && py === 'py-2') || (px === '' && py === 'py-3'))
    }))
    expect(bad).toEqual([])
  })

  it('does not reinvent the dialog panel with the legacy align-bottom recipe', () => {
    expect(offenders(f => /modal-panel[^"]*\balign-bottom\b|\balign-bottom\b[^"]*modal-panel/.test(f.text))).toEqual([])
  })

  it('tints native checkboxes and radios with the shared classes', () => {
    const bad = offenders(f => [...f.text.matchAll(/<input\b(?:"[^"]*"|[^>"])*>/g)].some(m => /type="(?:checkbox|radio)"/.test(m[0]) && !/\bclass="[^"]*\b(?:checkbox|radio|sr-only|peer)\b/.test(m[0]) && !/\bswitch\b/.test(m[0])))
    expect(bad).toEqual([])
  })

  it('puts every h2/h3/h4 on a heading role', () => {
    const bad = offenders(f => !PRESENTATION(f.path) && !/views\/auth\//.test(f.path) && [...f.text.matchAll(/<h[234]\b[^>]*?\sclass="([^"]*)"/g)].some(m => !/\b(?:heading-(?:page|section|card|sub)|modal-title|text-label|sr-only)\b/.test(m[1])))
    expect(bad).toEqual([])
  })

  it('keeps source lines readable (guards against a codemod collapsing a script block)', () => {
    expect(offenders(f => f.text.split('\n').some(l => l.length > 2500))).toEqual([])
  })

  it('does not redefine shared primitives in scoped styles', () => {
    const re = /<style[^>]*>[\s\S]*?(?:^|\s)\.(?:input|btn(?:-primary|-secondary)?|card|badge|modal-panel)\s*\{/m
    expect(offenders(f => re.test(f.text))).toEqual([])
  })

  it('declares initialLoading wherever a template or script uses it', () => {
    const bad = offenders(f =>
      /(?<![.\w])initialLoading\b/.test(f.text) &&
      !/(?:const|let)\s+initialLoading\b|\binitialLoading\s*:/.test(f.text)
    )
    expect(bad).toEqual([])
  })

  it('routes P&L and R values through pnlClass instead of binding the number as a class', () => {
    const raw = /^\(?\s*[\w$.]+\.(?:pnl|pnl_percent|total_r_value|avg_r_value|r_value)\s*(?:\?\?|\)|$)/
    const branch = /(?<!pnlClass\([^()]*)\?\s*[\w$.]+\.(?:pnl|pnl_percent|total_r_value|avg_r_value|r_value)\s*:/
    const bad = offenders(f => [...f.text.matchAll(/:class="([^"]*)"/g)].some(m => raw.test(m[1]) || branch.test(m[1])))
    expect(bad).toEqual([])
  })

  it('does not resize metric and heading roles with text-size utilities', () => {
    const size = /\btext-(?:xs|sm|base|lg|xl|\dxl)\b/
    const bad = offenders(f => classStrings(f.text).some(c =>
      (/\bstat-value\b/.test(c) || /\bheading-(?:page|section|card|sub)\b/.test(c)) && size.test(c)
    ))
    expect(bad).toEqual([])
  })

  it('keeps helper paragraphs readable (gray-500 light / gray-400 dark at minimum)', () => {
    expect(offenders(f => /<p\b[^>]*class="[^"]*text-gray-400 dark:text-gray-500/.test(f.text))).toEqual([])
  })

  it('does not combine btn-link with the switch primitive', () => {
    expect(offenders(f => /class="btn-link"[^>]{0,500}?'switch\b/.test(f.text))).toEqual([])
  })

  it('keeps chart text at the 12px default', () => {
    expect(offenders(f => /font:\s*\{\s*size:\s*(?:[1-9]|1[01])\s*[,}]/.test(f.text))).toEqual([])
  })

  it('lets table-head own the header background', () => {
    expect(offenders(f => /<thead class="table-head">\s*<tr class="[^"]*\bbg-/.test(f.text))).toEqual([])
  })

  it('uses the stacking scale instead of inline z-index', () => {
    expect(offenders(f => /style="[^"]*z-index/.test(f.text))).toEqual([])
  })

  it('formats money through a formatter instead of a literal $ before a raw number', () => {
    // A literal "$" in front of {{ value }} prints "$-12.30" for losses and
    // drops thousands separators. Remaining exceptions are always-positive
    // unit labels (Stripe price, point value, per-point multiplier, prices).
    const ALLOWED = [
      'views/BillingView.vue', 'views/backtest/BacktestSandboxView.vue', 'views/trades/TradeFormView.vue',
      'components/settings/FeeProfileSettings.vue', 'components/TickDataChart.vue', 'views/WatchlistDetailView.vue'
    ]
    const bad = offenders(f => !ALLOWED.includes(f.path) && /(?<![\w`])\$\s*\{\{/.test(f.text.split('<script')[0]))
    expect(bad).toEqual([])
  })

  it('formats share and contract counts instead of printing the raw NUMERIC string', () => {
    expect(offenders(f => /\{\{\s*[\w?.]+\.(?:quantity|shares)\s*\}\}/.test(f.text.split('<script')[0]))).toEqual([])
  })

  it('does not pin decorative accent bars to the edge of cards and notices', () => {
    // The one allowed edge accent marks state: the selected comparison row.
    const ALLOWED = ['views/InvestmentsView.vue']
    expect(offenders(f => /\bborder-l-(?:4|\[\d+px\])\b/.test(f.text) && !ALLOWED.includes(f.path))).toEqual([])
  })

  it('gives every loading ring the shared .spinner class', () => {
    const bad = offenders(f => classStrings(f.text).some(c =>
      /\banimate-spin\b/.test(c) && /\brounded-full\b/.test(c) && /\bborder/.test(c) && !/\bspinner\b/.test(c)
    ))
    expect(bad).toEqual([])
  })
})
