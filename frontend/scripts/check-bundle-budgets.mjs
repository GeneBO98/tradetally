import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const distDir = path.resolve(process.cwd(), 'dist/assets')
const resultsDir = path.resolve(process.cwd(), 'test-results')
const summaryPath = process.env.BUNDLE_BUDGET_SUMMARY_PATH || path.join(resultsDir, 'bundle-budget-summary.json')
const historyPath = process.env.BUNDLE_BUDGET_HISTORY_PATH || path.join(resultsDir, 'bundle-budget-history.jsonl')
const commentPath = process.env.BUNDLE_BUDGET_COMMENT_PATH || path.join(resultsDir, 'bundle-budget-pr-comment.md')
const budgets = {
  mainIndexGzip: Number(process.env.BUNDLE_BUDGET_MAIN_INDEX_GZIP || 110 * 1024),
  pdfjsGzip: Number(process.env.BUNDLE_BUDGET_PDFJS_GZIP || 180 * 1024),
  chartGzip: Number(process.env.BUNDLE_BUDGET_CHART_GZIP || 85 * 1024),
  routeChunkGzip: Number(process.env.BUNDLE_BUDGET_ROUTE_CHUNK_GZIP || 140 * 1024)
}

function gzipSize(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath)).length
}

function jsFiles() {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Missing Vite assets directory: ${distDir}`)
  }
  return fs.readdirSync(distDir)
    .filter(file => file.endsWith('.js') || file.endsWith('.mjs'))
    .map(file => ({
      file,
      path: path.join(distDir, file)
    }))
}

function kb(bytes) {
  return `${Math.round(bytes / 102.4) / 10} KiB`
}

const files = jsFiles().map(item => ({
  ...item,
  gzip: gzipSize(item.path),
  text: fs.readFileSync(item.path, 'utf8')
}))

const failures = []
const mainIndex = files.find(item => /^index-[A-Za-z0-9_-]+\.js$/.test(item.file))
if (!mainIndex) {
  failures.push('Could not find main index-*.js bundle')
} else {
  if (mainIndex.gzip > budgets.mainIndexGzip) {
    failures.push(`${mainIndex.file} gzip ${kb(mainIndex.gzip)} exceeds main budget ${kb(budgets.mainIndexGzip)}`)
  }
  if (mainIndex.text.includes('pdfjs-dist') || mainIndex.text.includes('PDFWorker')) {
    failures.push(`${mainIndex.file} appears to contain pdfjs runtime code`)
  }
}

for (const item of files) {
  if (/^pdfjs-/.test(item.file) && item.gzip > budgets.pdfjsGzip) {
    failures.push(`${item.file} gzip ${kb(item.gzip)} exceeds pdfjs budget ${kb(budgets.pdfjsGzip)}`)
  }
  if (/^chart-/.test(item.file) && item.gzip > budgets.chartGzip) {
    failures.push(`${item.file} gzip ${kb(item.gzip)} exceeds chart budget ${kb(budgets.chartGzip)}`)
  }
  const routeLike = /^[A-Z][A-Za-z0-9_-]+-/.test(item.file) || /^TradeManagementView-/.test(item.file) || /^ExecutionRunsAdminView-/.test(item.file)
  const allowLargeRoute = /^(TradeManagementView|ExecutionRunsAdminView|ImportView|AnalyticsView|BehavioralAnalyticsView|TradeFormView|TradeDetailView|DashboardView)-/.test(item.file)
  if (routeLike && !allowLargeRoute && item.gzip > budgets.routeChunkGzip) {
    failures.push(`${item.file} gzip ${kb(item.gzip)} exceeds route chunk budget ${kb(budgets.routeChunkGzip)}`)
  }
}

const summary = files
  .filter(item => /^index-|^pdfjs-|^chart-|^lightweight-charts-/.test(item.file))
  .map(item => ({ file: item.file, gzip: item.gzip, gzipLabel: `${kb(item.gzip)} gzip` }))

function readPreviousHistory() {
  if (!fs.existsSync(historyPath)) return null
  const lines = fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean)
  if (lines.length === 0) return null
  try {
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return null
  }
}

const previous = readPreviousHistory()
const previousByFilePrefix = new Map((previous?.summary || []).map(item => [String(item.file).split('-')[0], item]))
const trends = summary.map(item => {
  const previousItem = previousByFilePrefix.get(String(item.file).split('-')[0])
  return {
    file: item.file,
    gzip: item.gzip,
    gzipLabel: item.gzipLabel,
    previousGzip: previousItem?.gzip || null,
    deltaGzip: previousItem ? item.gzip - previousItem.gzip : null,
    deltaLabel: previousItem ? `${item.gzip >= previousItem.gzip ? '+' : ''}${kb(item.gzip - previousItem.gzip)}` : 'n/a'
  }
})

const artifact = {
  generatedAt: new Date().toISOString(),
  checked: files.length,
  budgets: Object.fromEntries(Object.entries(budgets).map(([key, value]) => [key, kb(value)])),
  summary,
  trends,
  failures
}

fs.mkdirSync(resultsDir, { recursive: true })
fs.writeFileSync(summaryPath, `${JSON.stringify(artifact, null, 2)}\n`)
fs.appendFileSync(historyPath, `${JSON.stringify({ generatedAt: artifact.generatedAt, summary })}\n`)
fs.writeFileSync(commentPath, [
  '### Bundle Budget Report',
  '',
  failures.length ? `Status: failed (${failures.length} budget issue${failures.length === 1 ? '' : 's'})` : 'Status: passed',
  '',
  '| Bundle | Gzip | Delta |',
  '| --- | ---: | ---: |',
  ...trends.map(item => `| ${item.file} | ${item.gzipLabel} | ${item.deltaLabel} |`),
  '',
  ...failures.map(failure => `- ${failure}`)
].join('\n'))

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${fs.readFileSync(commentPath, 'utf8')}\n`)
}

console.log(JSON.stringify({
  checked: artifact.checked,
  budgets: artifact.budgets,
  summary: summary.map(item => `${item.file}: ${item.gzipLabel}`),
  summaryPath,
  historyPath,
  commentPath
}, null, 2))

if (failures.length > 0) {
  failures.forEach(failure => console.error(`BUNDLE_BUDGET ${failure}`))
  process.exit(1)
}
