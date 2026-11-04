// Central Chart.js setup with selective registration.
//
// Importing from 'chart.js/auto' (or registering `registerables`) pulls in
// every controller, scale, element, and plugin Chart.js ships - including
// radar, polar area, pie, time/timeseries/log/radial scales, and decimation -
// none of which this app uses. Registering only what we render keeps the
// shared `chart` vendor chunk lean.
//
// Inventory of chart usage across the app (keep in sync when adding charts):
//   line     - RPerformanceChart, AdminLineChart, BalanceEquityCurve,
//              PerformanceChart, PortfolioPerformanceChart,
//              MonthlyPerformanceView, AnalyticsView (drawdown),
//              DashboardView (P&L + equity curve; also mixed line datasets
//              inside the win-rate bar chart)
//   bar      - IncomeAnalytics, MaeMfeAnalysis (histogram),
//              MonthlyPerformanceView, AnalyticsView (x7), DashboardView
//   scatter  - HealthCorrelationChart, MaeMfeAnalysis (with line overlays)
//   doughnut - DashboardView (distribution)
//
// Scales: category + linear only (no time scale, no date adapter).
// Plugins: Tooltip and Legend everywhere; Filler (`fill:` configs);
// Title (plugins.title in RPerformanceChart and AnalyticsView).
//
// IMPORTANT: a missing registration renders a silently blank chart. If you
// add a new chart type, register its controller/elements/scales here.
import {
  Chart,
  LineController,
  BarController,
  ScatterController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  Title
} from 'chart.js'

Chart.register(
  LineController,
  BarController,
  ScatterController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  Title
)

// Theme-aware defaults. Most charts never set tick/legend/grid colors and fall
// back to Chart.defaults, which are light-mode only. Keep the defaults in step
// with the `dark` class on <html> and restyle live charts when it flips, so
// every chart that relies on defaults follows the theme without its own code.
// Charts that pass explicit colors are unaffected.
const CHART_THEMES = {
  light: { text: '#4b5563', line: '#e5e7eb' }, // gray-600 / gray-200
  dark: { text: '#9ca3af', line: 'rgba(75, 85, 99, 0.45)' } // gray-400 / gray-600 at 45%
}

// One presentation contract for every Chart.js chart: system font at 11px,
// gentle line smoothing, small markers, unrotated ticks, compact legends.
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
Chart.defaults.font.size = 12
Chart.defaults.elements.line.tension = 0.2
Chart.defaults.elements.line.borderWidth = 2
Chart.defaults.elements.point.radius = 2
Chart.defaults.elements.point.hoverRadius = 5
Chart.defaults.plugins.legend.labels.boxWidth = 12
Chart.defaults.plugins.legend.labels.boxHeight = 12
Chart.defaults.scale.ticks.maxRotation = 0
Chart.defaults.scale.ticks.autoSkipPadding = 12

function applyChartTheme(theme) {
  Chart.defaults.color = theme.text
  Chart.defaults.borderColor = theme.line
  Chart.defaults.scale.grid.color = theme.line
  Chart.defaults.scale.border.color = theme.line
}

// Chart.js copies scale defaults into each chart's own config when the chart
// is created, so changing Chart.defaults alone doesn't reach charts already on
// screen. Swap any value that still equals the previous theme's default.
function restyleChart(chart, from, to) {
  const swap = (obj, key, a, b) => {
    if (obj && obj[key] === a) obj[key] = b
  }
  const scales = chart.config?.options?.scales || {}
  Object.values(scales).forEach(scale => {
    swap(scale.grid, 'color', from.line, to.line)
    swap(scale.border, 'color', from.line, to.line)
    swap(scale.ticks, 'color', from.text, to.text)
    swap(scale.title, 'color', from.text, to.text)
  })
  chart.update('none')
}

if (typeof document !== 'undefined') {
  let dark = document.documentElement.classList.contains('dark')
  applyChartTheme(dark ? CHART_THEMES.dark : CHART_THEMES.light)
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      const next = document.documentElement.classList.contains('dark')
      if (next === dark) return
      const from = dark ? CHART_THEMES.dark : CHART_THEMES.light
      const to = next ? CHART_THEMES.dark : CHART_THEMES.light
      dark = next
      applyChartTheme(to)
      Object.values(Chart.instances).forEach(chart => restyleChart(chart, from, to))
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }
}

export { Chart }
export default Chart
