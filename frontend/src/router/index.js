import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRegistrationMode } from '@/composables/useRegistrationMode'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
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
      component: () => import('@/views/trades/TradeDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/trades/:id/edit',
      name: 'trade-edit',
      component: () => import('@/views/trades/TradeFormView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: () => import('@/views/AnalyticsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/analytics/behavioral',
      name: 'behavioral-analytics',
      component: () => import('@/views/BehavioralAnalyticsView.vue'),
      meta: { requiresAuth: true, requiresTier: 'pro' }
    },
    {
      path: '/analytics/health',
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
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('@/views/PricingView.vue'),
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
      path: '/oauth/authorize',
      name: 'oauth-authorize',
      component: () => import('@/views/OAuth/AuthorizeView.vue')
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('@/views/PricingView.vue')
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
      path: '/faq',
      name: 'faq',
      component: () => import('@/views/FAQView.vue'),
      meta: { requiresOpen: true }
    },
    {
      path: '/compare/tradervue',
      name: 'compare-tradervue',
      component: () => import('@/views/CompareTraderVueView.vue'),
      meta: { requiresOpen: true }
    },
    {
      path: '/features',
      name: 'features',
      component: () => import('@/views/FeaturesView.vue'),
      meta: { requiresOpen: true }
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
      path: '/price-alerts',
      redirect: '/markets'
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/views/NotificationsView.vue'),
      meta: { requiresAuth: true }
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
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const { fetchRegistrationConfig, isClosedMode, showSEOPages } = useRegistrationMode()

  // Fetch registration config for all routes
  await fetchRegistrationConfig()

  // Handle closed mode - redirect home to login
  if (isClosedMode.value && to.name === 'home' && !authStore.isAuthenticated) {
    next({ name: 'login' })
    return
  }

  // Handle SEO pages - only show when registration mode is 'open'
  if (to.meta.requiresOpen && !showSEOPages.value) {
    next({ name: 'home' })
    return
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

    if (authStore.user?.role !== 'admin') {
      next({ name: 'dashboard' })
    } else {
      next()
    }
  } else if (to.meta.requiresTier) {
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
      // Redirect to pricing page with info about the feature they tried to access
      next({
        name: 'pricing',
        query: {
          upgrade: 'required',
          feature: to.name,
          from: to.fullPath
        }
      })
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router