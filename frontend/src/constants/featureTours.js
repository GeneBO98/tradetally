/**
 * New-feature tours ("What's new").
 *
 * Every time a user-facing feature ships, add a tour here so existing AND new
 * users find it. FeatureTourHost (mounted in App.vue) shows a small
 * "What's new" prompt; "Show me" walks the user page by page and spotlights
 * each feature. Completing or dismissing a tour is saved per user on the
 * server (user_feature_tours), so it never shows to that user again on any
 * device.
 *
 * HOW TO ADD A TOUR
 * 1. Put `data-tour="<target>"` on the element that shows the feature (a
 *    component root works too: `<MyCard data-tour="my-card" />`).
 * 2. Append an entry to FEATURE_TOURS with a NEW id. Never reuse or rename an
 *    id: anyone who finished the old tour would be treated as having seen the
 *    new one, and renaming re-shows a tour to everyone who dismissed it.
 * 3. Each step needs a title and body, plus either:
 *      route:        a router location ({ name: 'dashboard' } or '/metrics'), or
 *      resolveRoute: async ({ api }) => location | null, for pages that need
 *                    data (e.g. "open the user's latest trade"). Return null
 *                    when there is nothing to open; the step then shows
 *                    without a spotlight and uses `fallbackBody` if given.
 *    and optionally:
 *      target:       the data-tour value to spotlight. If it never appears
 *                    (hidden card, empty account, phone layout) the step shows
 *                    unanchored after a short wait instead of blocking.
 *      audience:     'all' (default) | 'pro' | 'free'
 * 4. Run `npx vitest run src/constants/featureTours.test.js`; it checks ids,
 *    dates and that every target exists somewhere in src/.
 *
 * WHO SEES A TOUR
 * - Every signed-in user, new or existing, who has not completed or dismissed
 *   it. New signups get it just like everyone else.
 * - Not the shared demo account (demo@example.com).
 * - Not while the onboarding tour (steps 3-5) is in progress; it waits until
 *   that tour is finished or skipped.
 * - Several unseen tours queue oldest first, one at a time.
 * - Optional `showUntil: 'YYYY-MM-DD'` stops prompting after that date. Leave
 *   it out unless the tour should stop reaching people who sign up later.
 *
 * TESTING
 * - Add `?tour=<id>` to any app URL to clear your own record and replay a tour.
 */

export const FEATURE_TOURS = [
  {
    id: '2026-11-new-features',
    releasedAt: '2026-11-25',
    title: 'New in TradeTally',
    summary: 'A one-number Performance Score, a 60-second session wrap-up, a What-If simulator, smarter CSV imports and real-time replay.',
    steps: [
      {
        id: 'performance-score',
        route: { name: 'dashboard' },
        target: 'performance-score',
        title: 'Your Performance Score',
        body: 'One 0-100 score for the selected date range. Click it to see the six factors behind it: profit factor, expectancy, drawdown control, consistency, win rate and risk-adjusted return.',
        fallbackBody: 'The top row of your dashboard now has a 0-100 Performance Score built from six factors. It appears once you have closed trades in the selected range.'
      },
      {
        id: 'session-wrap-up',
        route: { name: 'dashboard' },
        target: 'session-wrap-up',
        title: 'Wrap up your day in a minute',
        body: "Click Wrap up after the close. Today's trades are summarized for you, you answer two quick questions, pick a few tags and it saves straight to your journal."
      },
      {
        id: 'what-if-simulator',
        route: { name: 'metrics' },
        target: 'what-if-simulator',
        title: 'What-If Mistake Simulator',
        body: 'Test rules like a daily loss limit, a max number of trades per day or a time cutoff, or skip trades with your own mistake tags, and compare your equity curve with and without them.',
        fallbackBody: 'On the Overview tab of this page, the What-If Mistake Simulator lets you test rules like a daily loss limit or a time cutoff against your own trades. Turn it on from the layout settings if you have hidden it.'
      },
      {
        id: 'csv-ai-mapping',
        route: { name: 'import' },
        target: 'import-dropzone',
        title: 'Smarter CSV imports',
        body: "If TradeTally doesn't recognize your broker's CSV, AI can now suggest how its columns map. You review the suggestion and confirm before anything is imported. After each import you also get a first diagnosis of your biggest leak or strongest edge."
      },
      {
        id: 'real-time-replay',
        resolveRoute: async ({ api }) => {
          const response = await api.get('/trades', { params: { limit: 1 } })
          const trade = response?.data?.trades?.[0]
          return trade?.id ? { name: 'trade-detail', params: { id: trade.id } } : null
        },
        target: 'trade-replay',
        title: 'Replay trades in real time',
        body: 'Press Replay on any trade. At 1x the chart now plays at real market speed, so one second on screen is one second of the session, with your fills marked as they happen.',
        fallbackBody: 'Open any trade and press Replay. At 1x the chart now plays at real market speed, with your fills marked as they happen.'
      }
    ]
  }
]

/** YYYY-MM-DD for a Date in the user's local calendar. */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function findFeatureTour(id) {
  return FEATURE_TOURS.find(tour => tour.id === id) || null
}

/** Steps this user should see, given their plan. */
export function stepsForUser(tour, { isPro = false } = {}) {
  return (tour?.steps || []).filter(step => {
    const audience = step.audience || 'all'
    if (audience === 'pro') return isPro
    if (audience === 'free') return !isPro
    return true
  })
}

/** Whether a tour is live on a given day (released and not past showUntil). */
export function isTourLive(tour, today = localDateKey()) {
  if (!tour) return false
  if (tour.releasedAt && today < tour.releasedAt) return false
  if (tour.showUntil && today > tour.showUntil) return false
  return true
}
