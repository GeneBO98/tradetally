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

export { Chart }
export default Chart
