import fs from 'node:fs/promises'
import path from 'node:path'

const repository = process.env.GITHUB_REPOSITORY || 'GeneBO98/tradetally'
const token = process.env.GITHUB_TOKEN
const [owner, repo] = repository.split('/')

if (!owner || !repo) {
  throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`)
}

if (!token) {
  throw new Error('GITHUB_TOKEN is required to read repository star history')
}

const API_VERSION = '2026-03-10'
const OUTPUT_PATH = path.resolve('.github/assets/star-history.svg')
const WIDTH = 1200
const HEIGHT = 640
const PLOT = { left: 104, right: 52, top: 136, bottom: 88 }
const plotWidth = WIDTH - PLOT.left - PLOT.right
const plotHeight = HEIGHT - PLOT.top - PLOT.bottom

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

function niceStep(maximum) {
  const roughStep = Math.max(1, maximum / 4)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude

  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

async function fetchStarDates() {
  const dates = []

  for (let page = 1; ; page += 1) {
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/stargazers`)
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.star+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION
      }
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`GitHub returned ${response.status} while reading stargazers: ${body}`)
    }

    const pageData = await response.json()
    dates.push(...pageData.map(({ starred_at }) => new Date(starred_at)))

    if (pageData.length < 100) break
  }

  return dates.sort((a, b) => a - b)
}

function createChart(starDates) {
  const now = new Date()
  const firstDate = starDates[0] || now
  const lastDate = starDates.at(-1) || now
  const startTime = firstDate.getTime()
  const endTime = Math.max(lastDate.getTime(), startTime + 86_400_000)
  const totalStars = starDates.length
  const yStep = niceStep(totalStars)
  const yMaximum = Math.max(yStep, Math.ceil(totalStars / yStep) * yStep)

  const xPosition = (date) => PLOT.left + ((date.getTime() - startTime) / (endTime - startTime)) * plotWidth
  const yPosition = (count) => PLOT.top + plotHeight - (count / yMaximum) * plotHeight

  const historyPoints = [
    `${xPosition(firstDate).toFixed(2)},${yPosition(0).toFixed(2)}`,
    ...starDates.map((date, index) => `${xPosition(date).toFixed(2)},${yPosition(index + 1).toFixed(2)}`)
  ]
  const linePoints = historyPoints.join(' ')
  const areaPoints = [
    `${PLOT.left},${PLOT.top + plotHeight}`,
    ...historyPoints,
    `${xPosition(lastDate).toFixed(2)},${PLOT.top + plotHeight}`
  ].join(' ')

  const yGridLines = []
  for (let value = 0; value <= yMaximum; value += yStep) {
    const y = yPosition(value).toFixed(2)
    yGridLines.push(`<line class="grid-line" x1="${PLOT.left}" y1="${y}" x2="${WIDTH - PLOT.right}" y2="${y}" />
  <text class="axis-label" x="${PLOT.left - 20}" y="${Number(y) + 5}" text-anchor="end">${value}</text>`)
  }

  const xLabels = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const date = new Date(startTime + (endTime - startTime) * ratio)
    const x = PLOT.left + plotWidth * ratio
    return `<text class="axis-label" x="${x.toFixed(2)}" y="${HEIGHT - 45}" text-anchor="middle">${escapeXml(formatDate(date))}</text>`
  })

  const title = `${repo} GitHub star history`
  const description = `${repository} grew from its first star in ${formatDate(firstDate)} to ${totalStars.toLocaleString('en-US')} stars as of ${formatDate(lastDate)}.`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="chart-title chart-description">
  <title id="chart-title">${escapeXml(title)}</title>
  <desc id="chart-description">${escapeXml(description)}</desc>
  <style>
    .background { fill: #ffffff; }
    .panel-border { fill: none; stroke: #e5e7eb; }
    .grid-line { stroke: #e5e7eb; stroke-width: 1; }
    .axis-label { fill: #6b7280; font: 500 17px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .eyebrow { fill: #bd4f13; font: 700 16px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0.08em; }
    .heading { fill: #111827; font: 700 34px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .total { fill: #111827; font: 700 38px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .total-label { fill: #6b7280; font: 500 16px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .history-area { fill: url(#history-fill); }
    .history-line { fill: none; stroke: #e46a16; stroke-linecap: round; stroke-linejoin: round; stroke-width: 5; }
    .latest-point { fill: #ffffff; stroke: #e46a16; stroke-width: 5; }

    @media (prefers-color-scheme: dark) {
      .background { fill: #111827; }
      .panel-border, .grid-line { stroke: #374151; }
      .axis-label, .total-label { fill: #9ca3af; }
      .eyebrow { fill: #fab05b; }
      .heading, .total { fill: #f9fafb; }
      .latest-point { fill: #111827; }
    }
  </style>
  <defs>
    <linearGradient id="history-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#f0812a" stop-opacity="0.28" />
      <stop offset="1" stop-color="#f0812a" stop-opacity="0.03" />
    </linearGradient>
  </defs>
  <rect class="background" width="${WIDTH}" height="${HEIGHT}" rx="20" />
  <rect class="panel-border" x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="19.5" />

  <text class="eyebrow" x="${PLOT.left}" y="55">GITHUB GROWTH</text>
  <text class="heading" x="${PLOT.left}" y="98">TradeTally star history</text>
  <text class="total" x="${WIDTH - PLOT.right}" y="70" text-anchor="end">${totalStars.toLocaleString('en-US')}</text>
  <text class="total-label" x="${WIDTH - PLOT.right}" y="98" text-anchor="end">GitHub stars</text>

  ${yGridLines.join('\n  ')}
  <polygon class="history-area" points="${areaPoints}" />
  <polyline class="history-line" points="${linePoints}" />
  <circle class="latest-point" cx="${xPosition(lastDate).toFixed(2)}" cy="${yPosition(totalStars).toFixed(2)}" r="7" />
  ${xLabels.join('\n  ')}
</svg>
`
}

const starDates = await fetchStarDates()
const svg = createChart(starDates)

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
await fs.writeFile(OUTPUT_PATH, svg)

console.log(`[SUCCESS] Generated star history for ${repository} with ${starDates.length} stars`)
