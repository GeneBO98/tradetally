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
const classStrings = text => [...text.matchAll(/class="([^"]*)"/g)].map(m => m[1])
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

  it('does not redefine shared primitives in scoped styles', () => {
    const re = /<style[^>]*>[\s\S]*?(?:^|\s)\.(?:input|btn(?:-primary|-secondary)?|card|badge|modal-panel)\s*\{/m
    expect(offenders(f => re.test(f.text))).toEqual([])
  })

  it('gives every loading ring the shared .spinner class', () => {
    const bad = offenders(f => classStrings(f.text).some(c =>
      /\banimate-spin\b/.test(c) && /\brounded-full\b/.test(c) && /\bborder/.test(c) && !/\bspinner\b/.test(c)
    ))
    expect(bad).toEqual([])
  })
})
