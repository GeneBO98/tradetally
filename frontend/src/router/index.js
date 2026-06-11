import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { useAnalytics } from '@/composables/useAnalytics'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      redirect: { name: 'login' }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { guest: true }
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/auth/RegisterView.vue'),
      meta: { guest: true }
    },
    {
      path: '/verify-email/:token',
      name: 'verify-email',
      component: () => import('@/views/auth/EmailVerificationView.vue'),
      meta: { guest: true }
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/auth/ForgotPasswordView.vue'),
      meta: { guest: true }
    },
    {
      path: '/reset-password/:token',
      name: 'reset-password',
      component: () => import('@/views/auth/ResetPasswordView.vue'),
      meta: { guest: true }
    },
    {
      path: '/unlock-account/:token',
      name: 'unlock-account',
      component: () => import('@/views/auth/UnlockAccountView.vue'),
      meta: { guest: true }
    },
    {
      path: '/unsubscribe',
      name: 'unsubscribe',
      component: () => import('@/views/auth/UnsubscribeView.vue'),
      meta: { public: true }
    },
    {
      path: '/trial-feedback',
      name: 'trial-feedback',
      component: () => import('@/views/auth/TrialFeedbackView.vue')
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/trades',
      name: 'trades',
      component: () => import('@/views/trades/TradeListView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/trades/new',
      name: 'trade-create',
      component: () => import('@/views/trades/TradeFormView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/trades/:id',
      name: 'trade-detail',
      // Public trades are viewable without login (shared links). The view loads
      // the trade and, if it's private/not found for a guest, redirects to login.
      component: () => import('@/views/trades/TradeDetailView.vue'),
      meta: { publicViewable: true }
    },
    {
      path: '/trades/:id/edit',
      name: 'trade-edit',
      component: () => import('@/views/trades/TradeFormView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/metrics',
      name: 'metrics',
      component: () => import('@/views/AnalyticsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/metrics/monthly',
      name: 'monthly-performance',
      component: () => import('@/views/MonthlyPerformanceView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/metrics/edge-report',
      name: 'edge-report',
      component: () => import('@/views/EdgeReportView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/analysis/prop-firm',
      name: 'prop-firm',
      component: () => import('@/views/PropFirmView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/year-wrapped/:year?',
      name: 'year-wrapped',
      component: () => import('@/views/YearWrappedView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/metrics/partial-exits',
      name: 'partial-exit-analytics',
      component: () => import('@/views/PartialExitAnalyticsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/metrics/behavioral',
      name: 'behavioral-analytics',
      component: () => import('@/views/BehavioralAnalyticsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/metrics/health',
      name: 'health-analytics',
      component: () => import('@/views/HealthAnalyticsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/diary',
      name: 'diary',
      component: () => import('@/views/DiaryView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/diary/new',
      name: 'diary-create',
      component: () => import('@/views/DiaryFormView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/diary/:id/edit',
      name: 'diary-edit',
      component: () => import('@/views/DiaryFormView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('@/views/CalendarView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/ImportView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/broker-sync',
      name: 'broker-sync',
      component: () => import('@/views/BrokerSyncView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings/broker-sync',
      name: 'settings-broker-sync',
      component: () => import('@/views/BrokerSyncView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/billing',
      name: 'billing',
      component: () => import('@/views/BillingView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/equity-history',
      name: 'equity-history',
      component: () => import('@/views/EquityHistoryView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/cashflow',
      name: 'cashflow',
      component: () => import('@/views/CashflowView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: () => import('@/views/AccountsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('@/views/admin/UserManagementView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/oauth',
      name: 'oauth-clients',
      component: () => import('@/views/OAuth/ClientManagementView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/backups',
      name: 'admin-backups',
      component: () => import('@/views/admin/BackupManagementView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/testimonials',
      name: 'admin-testimonials',
      component: () => import('@/views/admin/TestimonialManagementView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/review',
      name: 'review',
      component: () => import('@/views/ReviewView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/oauth/authorize',
      name: 'oauth-authorize',
      component: () => import('@/views/OAuth/AuthorizeView.vue')
    },
    {
      path: '/billing',
      name: 'billing',
      component: () => import('@/views/BillingView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/public',
      name: 'public-trades',
      component: () => import('@/views/PublicTradesView.vue')
    },
    {
      path: '/u/:username',
      name: 'user-profile',
      component: () => import('@/views/UserProfileView.vue')
    },
    {
      path: '/privacy',
      name: 'privacy-policy',
      component: () => import('@/views/PrivacyPolicyView.vue')
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('@/views/GamificationView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/gamification',
      redirect: '/leaderboard'
    },
    {
      path: '/markets',
      name: 'markets',
      component: () => import('@/views/MarketsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/watchlists',
      redirect: '/markets'
    },
    {
      path: '/watchlists/:id',
      name: 'watchlist-detail',
      component: () => import('@/views/WatchlistDetailView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analysis',
      name: 'analysis',
      component: () => import('@/views/InvestmentsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analysis/compare',
      name: 'analysis-compare',
      component: () => import('@/views/InvestmentsCompareView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analysis/analyze/:symbol',
      name: 'stock-analysis',
      component: () => import('@/views/StockAnalysisView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analysis/holdings/:id',
      name: 'holding-detail',
      component: () => import('@/views/HoldingDetailView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analysis/trade-management',
      name: 'trade-management',
      component: () => import('@/views/TradeManagementView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analysis/playbooks',
      name: 'playbooks',
      component: () => import('@/views/PlaybooksView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/price-alerts',
      name: 'price-alerts',
      component: () => import('@/views/PriceAlertsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/web-mentions',
      name: 'web-mentions',
      component: () => import('@/views/WebMentionsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/views/NotificationsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('@/views/GamificationView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/gamification',
      redirect: '/leaderboard'
    },
    // Backwards-compatible redirects for renamed routes
    {
      path: '/analytics',
      redirect: '/metrics'
    },
    {
      path: '/analytics/monthly',
      redirect: '/metrics/monthly'
    },
    {
      path: '/analytics/behavioral',
      redirect: '/metrics/behavioral'
    },
    {
      path: '/analytics/health',
      redirect: '/metrics/health'
    },
    {
      path: '/investments',
      redirect: '/analysis'
    },
    {
      path: '/investments/analyze/:symbol',
      redirect: to => `/analysis/analyze/${to.params.symbol}`
    },
    {
      path: '/investments/holdings/:id',
      redirect: to => `/analysis/holdings/${to.params.id}`
    },
    {
      path: '/playbooks',
      redirect: '/analysis/playbooks'
    },
    // Catch-all: unmatched URLs used to render a blank layout shell.
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const { registrationConfig, fetchRegistrationConfig, isBillingEnabled } = useRegistrationMode()

  // Block navigation when the route depends on registration/billing mode.
  // Tier-gated and admin routes must wait too, otherwise the guard can briefly
  // assume billing is disabled and let the user reach a page the backend 403s.
  const requiresRegistrationMode = to.meta.requiresTier || to.meta.requiresAdmin
  if (requiresRegistrationMode && !registrationConfig.value) {
    await fetchRegistrationConfig()
  } else if (!registrationConfig.value) {
    fetchRegistrationConfig().catch(() => {})
  }

  // Hide cloud-only admin pages when billing is disabled (private instance)
  if (!isBillingEnabled.value) {
    if (to.name === 'oauth-clients' || to.name === 'admin-testimonials') {
      next({ name: 'dashboard' })
      return
    }
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else if (to.meta.guest && authStore.isAuthenticated) {
    next({ name: 'dashboard' })
  } else if (to.meta.requiresAdmin) {
    // Ensure user data is loaded for admin check
    if (authStore.isAuthenticated && !authStore.user) {
      try {
        await authStore.fetchUser()
      } catch (error) {
        console.error('Failed to fetch user data:', error)
        next({ name: 'login' })
        return
      }
    }

    if (authStore.user?.role !== 'admin' && authStore.user?.role !== 'owner') {
      next({ name: 'dashboard' })
    } else {
      if (!isBillingEnabled.value && (to.name === 'oauth-clients' || to.name === 'admin-testimonials')) {
        next({ name: 'dashboard' })
        return
      }
      next()
    }
  } else if (to.meta.requiresTier) {
    // CRITICAL: Skip tier check if billing is disabled (self-hosted mode)
    if (!isBillingEnabled.value) {
      console.log('[ROUTER] Billing disabled - skipping tier check for', to.name)
      next()
      return
    }

    // Ensure user data is loaded for tier check
    if (authStore.isAuthenticated && !authStore.user) {
      try {
        await authStore.fetchUser()
      } catch (error) {
        console.error('Failed to fetch user data:', error)
        next({ name: 'login' })
        return
      }
    }

    const requiredTier = to.meta.requiresTier
    const userTier = authStore.user?.tier || 'free'

    // Check if user has required tier (pro is higher than free)
    if (requiredTier === 'pro' && userTier !== 'pro') {
      // Pro feature requested without a Pro tier; on a billing-enabled instance
      // this is handled before reaching here, so fall back to the dashboard.
      next({ name: 'dashboard' })
    } else {
      next()
    }
  } else {
    next()
  }
})

// PostHog: identify user and track navigation for both public and authenticated routes
router.afterEach((to) => {
  const authStore = useAuthStore()
  const { identifyUser, trackPageView, trackFeatureUsage } = useAnalytics()

  if (authStore.isAuthenticated && authStore.user?.id) {
    identifyUser(authStore.user.id, {
      email: authStore.user.email,
      tier: authStore.user.tier || 'free'
    })
  }

  if (to.name) {
    trackPageView(to.name, {
      path: to.path,
      requires_auth: to.meta.requiresAuth === true
    })
  }

  if (to.name && to.meta.requiresAuth) {
    trackFeatureUsage(to.name, { path: to.path })
  }
})

export default router
