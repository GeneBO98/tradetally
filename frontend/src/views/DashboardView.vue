<template>
  <div class="content-wrapper py-8">
    <!-- Header with Filters -->
    <div class="mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="heading-page">Dashboard</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Trading performance analytics and insights
          </p>
          <div
            v-if="selectedAccount"
            class="mt-2 inline-flex max-w-full items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
          >
            Viewing: <span class="ml-1 truncate">{{ selectedAccountLabel }}</span>
          </div>
          
          <!-- Market Status and Refresh Indicator -->
          <div class="mt-2 flex items-center space-x-4 text-xs">
            <div class="flex items-center space-x-2">
              <div class="flex items-center">
                <div 
                  class="w-2 h-2 rounded-full mr-2"
                  :class="[
                    marketStatus.isOpen ? 'bg-green-500' : 'bg-red-500'
                  ]"
                ></div>
                <span class="text-gray-600 dark:text-gray-400">
                  {{ marketStatus.status }}
                </span>
              </div>
            </div>
            
            <div v-if="isAutoUpdating" class="text-gray-500 dark:text-gray-400">
              <span>{{ nextRefreshIn }}s</span>
            </div>
          </div>
        </div>
        
        <!-- Filters and Customization Controls — icon-only to keep the header
             clean. Filter button shows a dot when a non-default range is
             active. Customize button highlights primary when in edit mode. -->
        <div class="mt-4 sm:mt-0 flex flex-wrap gap-2 items-center justify-end">
          <div class="relative" data-dropdown="timeRange">
            <button
              @click.stop="showTimeRangeDropdown = !showTimeRangeDropdown"
              class="relative w-10 h-10 inline-flex items-center justify-center rounded-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              type="button"
              :title="`Date range: ${getSelectedTimeRangeText()}`"
              aria-label="Date range filter"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18M6 8h12M10 12h4M11 16h2" />
              </svg>
              <span
                v-if="filters.timeRange !== 'all'"
                class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-white dark:ring-gray-900"
                aria-hidden="true"
              />
            </button>
            <div v-if="showTimeRangeDropdown" class="absolute right-0 z-10 mt-1 w-44 bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
              <div
                v-for="option in timeRangeOptions"
                :key="option.value"
                @click="selectTimeRange(option.value)"
                class="px-3 py-2 cursor-pointer text-sm"
                :class="filters.timeRange === option.value ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'"
              >
                {{ option.label }}
              </div>
            </div>
          </div>

          <!-- Custom Date Range Inputs -->
          <div v-if="filters.timeRange === 'custom'" class="flex gap-2">
            <input
              type="date"
              v-model="filters.startDate"
              @change="applyFilters"
              @keydown.enter="applyFilters"
              class="input text-sm"
              placeholder="Start Date"
            />
            <input
              type="date"
              v-model="filters.endDate"
              @change="applyFilters"
              @keydown.enter="applyFilters"
              class="input text-sm"
              placeholder="End Date"
            />
          </div>

          <!-- Advanced filters (tags, strategies, brokers, etc.) — opens the
               shared TradeFilters panel in a modal. Subtle icon-only button to
               match the rest of the header; shows the active filter count when
               anything beyond the time range is set. -->
          <button
            @click="showFiltersModal = true"
            class="relative h-10 px-3 inline-flex items-center justify-center gap-1.5 rounded-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            type="button"
            :title="activeAdvancedFilterCount > 0 ? `${activeAdvancedFilterCount} filter${activeAdvancedFilterCount === 1 ? '' : 's'} active` : 'More filters'"
            aria-label="More filters"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="hidden sm:inline">Filters</span>
            <span
              v-if="activeAdvancedFilterCount > 0"
              class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-primary-600 text-white text-[10px] font-semibold ring-2 ring-white dark:ring-gray-900"
              aria-hidden="true"
            >{{ activeAdvancedFilterCount }}</span>
          </button>

          <button
            v-if="isCustomizing"
            @click="resetDashboardLayout"
            class="px-3 h-10 text-sm font-medium border rounded-md transition-colors bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Reset layout to defaults"
          >
            Reset
          </button>
          <button
            @click="isCustomizing = !isCustomizing"
            class="w-10 h-10 inline-flex items-center justify-center rounded-md border transition-colors"
            :class="isCustomizing
              ? 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'"
            :title="isCustomizing ? 'Exit customize mode' : 'Customize dashboard'"
            :aria-label="isCustomizing ? 'Exit customize mode' : 'Customize dashboard'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="!isCustomizing" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path v-if="!isCustomizing" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <!-- Account filter is now global in the navbar -->
        </div>
      </div>
    </div>

    <!-- Year Wrapped Banner -->
    <YearWrappedBanner />

    <!-- Guided onboarding: step 1 of tour -->
    <OnboardingCard
      v-if="authStore.onboardingStep === 0 || authStore.onboardingStep === 1"
      :step="1"
      :total-steps="5"
      :next-step="2"
      title="Welcome to TradeTally"
      description="We've loaded sample trades so you can see your dashboard in action. Let's take a quick tour of the key features."
      cta-label="Next: Import Trades"
      cta-route="import"
    />

    <!-- Sample data banner: shown when user has sample trades -->
    <div
      v-if="!initialLoading && hasSampleData && authStore.onboardingStep >= 6"
      class="card bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 mb-6"
    >
      <div class="card-body">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-amber-900 dark:text-amber-100">You're exploring with sample data.</p>
            <p class="mt-0.5 text-sm text-amber-700 dark:text-amber-300">Import your own trades or remove the sample data when you're ready.</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-4">
            <RouterLink
              :to="{ name: 'import' }"
              class="btn-primary text-sm"
            >
              Import Trades
            </RouterLink>
            <button
              type="button"
              class="btn-secondary text-sm text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              :disabled="removingSampleData"
              @click="removeSampleData"
            >
              {{ removingSampleData ? 'Removing...' : 'Remove Sample Data' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- First-value onboarding banner: new users who have not imported yet (hidden while guided onboarding card is shown) -->
    <div
      v-if="!initialLoading && !authStore.showOnboardingModal && onboardingStatus?.is_new && !onboardingStatus?.has_activated && !onboardingBannerDismissed"
      class="card bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 mb-6"
    >
      <div class="card-body">
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40">
            <svg class="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-primary-900 dark:text-primary-100">Get started with TradeTally</h3>
            <p class="mt-1 text-sm text-primary-700 dark:text-primary-300">
              Import your first trades to see your P&L, win rate, and analytics here.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <RouterLink
                :to="{ name: 'import' }"
                class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
              >
                Import your first trades
              </RouterLink>
              <RouterLink
                :to="{ name: 'broker-sync' }"
                class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-primary-600 text-primary-700 dark:text-primary-300 dark:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30"
              >
                Connect a broker
              </RouterLink>
              <button
                type="button"
                class="inline-flex items-center px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                @click="onboardingBannerDismissed = true"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            type="button"
            class="flex-shrink-0 p-1 rounded text-primary-500 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-200"
            aria-label="Dismiss"
            @click="onboardingBannerDismissed = true"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Year Wrapped Modal -->
    <YearWrappedModal />

    <!-- Trial countdown: show when on active trial -->
    <div
      v-if="!initialLoading && billingAvailable && subscription?.trial?.active && !trialBannerDismissed"
      class="card bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 mb-6"
    >
      <div class="card-body">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-800 dark:text-primary-200">
              Pro Trial
            </span>
            <span class="text-sm text-primary-800 dark:text-primary-200">
              {{ subscription.trial.days_remaining }} day{{ subscription.trial.days_remaining === 1 ? '' : 's' }} left. Upgrade before your trial ends to keep Pro features.
            </span>
          </div>
          <div class="flex items-center gap-2">
            <RouterLink
              :to="{ name: 'billing' }"
              class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              Upgrade before trial ends
            </RouterLink>
            <button
              type="button"
              class="p-1 rounded text-primary-500 hover:text-primary-700 dark:text-primary-400"
              aria-label="Dismiss"
              @click="trialBannerDismissed = true"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Post-trial expiry: show when trial ended and user is on free tier -->
    <div
      v-if="!initialLoading && billingAvailable && showPostTrialBanner && !postTrialBannerDismissed"
      class="card bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 mb-6"
    >
      <div class="card-body">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Your trial ended</p>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Upgrade to Pro to keep advanced analytics, AI insights, and more.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <RouterLink
              :to="{ name: 'billing' }"
              class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              View Pro plans
            </RouterLink>
            <button
              type="button"
              class="p-1 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400"
              aria-label="Dismiss"
              @click="postTrialBannerDismissed = true"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Full page spinner only on initial load -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Content with optional refresh indicator -->
    <div v-else class="space-y-8">
      <div
        v-if="!hasVisibleDashboardSections"
        class="card border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20"
      >
        <div class="card-body flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="heading-card">Dashboard Sections Hidden</h2>
            <p class="mt-1 text-sm text-primary-700 dark:text-primary-300">
              Your saved dashboard layout is hiding every section. Reset the layout to restore the default dashboard.
            </p>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="btn-secondary"
              @click="isCustomizing = true"
            >
              Customize
            </button>
            <button
              type="button"
              class="btn-primary"
              @click="resetDashboardLayout"
            >
              Reset Layout
            </button>
          </div>
        </div>
      </div>

      <!-- Customize-mode banner -->
      <div
        v-if="isCustomizing"
        class="mb-4 card bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800"
      >
        <div class="card-body py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-sm text-primary-900 dark:text-primary-100">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Drag sections by the handle to reorder · click the eye to show or hide</span>
            </div>
            <button
              type="button"
              class="text-sm font-medium text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-white"
              @click="isCustomizing = false"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <!-- Two-column layout: main draggable dashboard + sticky news rail.
           News + Earnings live in the rail, OUT of the dashboard flow, so
           they stay visible while the user scrolls and scroll their own
           internal content independently. -->
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- Main column — all the draggable dashboard sections -->
        <div class="flex-1 min-w-0">
      <!-- Draggable Dashboard Sections.
           Auto-scroll while dragging is handled manually via @start/@end
           hooks because SortableJS 1.14's built-in scroll/bubbleScroll
           doesn't reliably scroll the window when there is no overflow
           scroll-parent in the chain. -->
      <draggable
        v-model="dashboardLayout"
        :disabled="!isCustomizing"
        item-key="id"
        class="space-y-6"
        handle=".drag-handle"
        @start="onSectionDragStart"
        @end="onSectionDragEnd"
        @change="onDragChange"
      >
        <template #item="{ element }">
          <div
            class="relative"
            :class="{
              'opacity-50': isCustomizing && !element.visible,
              'hidden': getSectionDefinition(element.id)?.location === 'rail'
                || (!element.visible && !isCustomizing)
            }"
          >
            <!-- Customize-mode header: drag handle, title, visibility toggle -->
            <div
              v-if="isCustomizing"
              class="flex items-center justify-between gap-2 px-3 py-1.5 mb-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md"
            >
              <button
                type="button"
                class="drag-handle flex items-center gap-2 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-900 dark:hover:text-white"
                title="Drag to reorder"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="7" cy="5" r="1.5" />
                  <circle cx="13" cy="5" r="1.5" />
                  <circle cx="7" cy="10" r="1.5" />
                  <circle cx="13" cy="10" r="1.5" />
                  <circle cx="7" cy="15" r="1.5" />
                  <circle cx="13" cy="15" r="1.5" />
                </svg>
                <span class="text-xs font-medium">{{ getSectionDefinition(element.id)?.title || element.id }}</span>
              </button>
              <button
                type="button"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
                :class="element.visible
                  ? 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                :title="element.visible ? 'Hide section' : 'Show section'"
                @click="toggleSectionVisibility(element.id)"
              >
                <svg v-if="element.visible" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <span class="hidden sm:inline">{{ element.visible ? 'Visible' : 'Hidden' }}</span>
              </button>
            </div>

            <!-- Hidden sections collapse to just their header row in customize
                 mode: the "Hidden" eye state already says everything, and nine
                 stacked placeholder cards (mostly legacy duplicates of visible
                 widgets) made the picker a wall of noise. Legacy entries get a
                 hint about which current section replaced them. -->
            <div
              v-if="!element.visible && isCustomizing && legacyReplacementHint(element.id)"
              class="px-3 pb-1.5 -mt-1 text-xs text-gray-400 dark:text-gray-500"
            >
              Replaced by {{ legacyReplacementHint(element.id) }} — enable only if you want both.
            </div>
            <template v-if="element.visible">
            <!-- Hero Metrics Ribbon -->
            <template v-if="element.id === 'hero-metrics'">
              <HeroMetricsRibbon :analytics="analytics" :range-label="heroRangeLabel" :r-mode="dashboardRMode" @update:r-mode="setDashboardRMode" />
            </template>

            <!-- AI Insight of the Day -->
            <template v-if="element.id === 'ai-insight'">
              <AiInsightCard
                :insights="aiInsights"
                :loading="aiInsightLoading"
                :error="aiInsightError"
                @refresh="fetchAiInsight"
              />
            </template>

            <!-- Equity Curve + Calendar Heatmap -->
            <template v-if="element.id === 'equity-and-calendar'">
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2">
                  <div class="card-dense h-full flex flex-col">
                    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <h3 class="heading-card">Cumulative P&amp;L</h3>
                      <span class="text-xs text-gray-500 dark:text-gray-400 text-mono-num">
                        {{ analytics?.dailyPnL?.length || 0 }} {{ analytics?.dailyPnL?.length === 1 ? 'day' : 'days' }}
                      </span>
                    </div>
                    <!-- Body grows to fill the card so the chart matches the
                         height of the calendar beside it. flex-1 + min-h-0
                         lets the chart container stretch; the 280px floor
                         keeps it usable when stacked on mobile. -->
                    <div class="card-dense-body flex-1 min-h-0 flex flex-col">
                      <div v-if="(analytics?.dailyPnL?.length || 0) === 0" class="flex-1 flex items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                        Your equity curve appears here once you log trades.
                      </div>
                      <div v-else class="flex-1 min-h-[280px]">
                        <canvas ref="equityCurveCanvas" />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <CalendarHeatmap :daily-pn-l="analytics?.dailyPnL || []" />
                </div>
              </div>
            </template>

            <!-- Momentum + Risk Signals (side-by-side) -->
            <template v-if="element.id === 'momentum-and-risk'">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <StreakMomentumCard
                  :daily-pn-l="analytics?.dailyPnL || []"
                  :recent-trade-pnls="analytics?.recentTradePnls || []"
                />
                <BehavioralAlertsCard
                  :summary="behavioralSummary"
                  :loading="behavioralLoading"
                  :upgrade-required="behavioralUpgradeRequired"
                  :fetch-status="behavioralFetchStatus"
                  :error="behavioralError"
                />
              </div>
            </template>

            <!-- Recent Trades Timeline (standalone — legacy / power-user) -->
            <template v-if="element.id === 'recent-trades'">
              <RecentTradesTimeline :trades="recentTrades" :loading="recentTradesLoading" />
            </template>

            <!-- Recent Trades + Win/Loss Distribution (combined, default).
                 Split is 3fr / 2fr — Recent Trades stays larger but Win Rate
                 gets meaningfully more breathing room than a 2/1 split. -->
            <template v-if="element.id === 'recent-trades-and-distribution'">
              <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div class="lg:col-span-3">
                  <RecentTradesTimeline :trades="recentTrades" :loading="recentTradesLoading" />
                </div>
                <div class="lg:col-span-2">
                  <WinLossPulse
                    :summary="analytics?.summary || {}"
                    @navigate="navigateToTradesByPnLType"
                  />
                </div>
              </div>
            </template>

            <!-- News + Upcoming Earnings now render in the sticky right rail
                 outside the draggable area, not as a section. -->

            <!-- Today's Journal Entry -->
            <template v-if="element.id === 'journal-entry'">
              <TodaysJournalEntry />
            </template>

            <!-- Open Trades Section -->
            <template v-if="element.id === 'open-positions'">
              <div v-if="openTrades.length > 0" class="card">
                <div class="card-body">
                  <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                      <h3 class="heading-card">Open Positions</h3>
                      <button 
                        @click="navigateToOpenTrades"
                        class="ml-3 text-sm text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        View all →
                      </button>
                    </div>
                    <div class="flex items-center gap-2">
                      <div v-if="loading" class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        <div class="animate-spin rounded-full h-3 w-3 border-[1.5px] border-primary-600 border-t-transparent"></div>
                        <span>Updating...</span>
                      </div>
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400">
                        {{ openTrades.length }} {{ openTrades.length === 1 ? 'position' : 'positions' }}
                      </span>
                    </div>
                  </div>
                  <!-- Mobile Card View -->
                  <div class="block lg:hidden space-y-3">
            <div v-for="position in displayedOpenTrades" :key="getOpenPositionKey(position)" class="table-card-item">
              <!-- Position Header -->
              <div class="flex justify-between items-start mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-3">
                  <StockLogo
                    :symbol="position.symbol"
                    size-class="w-10 h-10"
                  />
                  <div>
                    <div class="text-lg font-bold text-gray-900 dark:text-white">
                      {{ position.symbol }}
                    </div>
                    <div v-if="formatOptionContract(position)" class="text-xs text-gray-500 dark:text-gray-400">
                      {{ formatOptionContract(position) }}
                    </div>
                    <span class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full mt-1"
                      :class="[
                        position.side === 'long'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : position.side === 'short'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      ]">
                      {{ position.side === 'neutral' ? 'hedged' : position.side }}
                    </span>
                  </div>
                </div>
                <div v-if="position.requires_manual_price" class="text-right">
                  <template v-if="getOptionPnL(position).unrealizedPnL !== null">
                    <div class="text-lg font-bold" :class="[
                      getOptionPnL(position).unrealizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    ]">
                      {{ formatSignedCurrency(getOptionPnL(position).unrealizedPnL) }}
                    </div>
                    <div class="text-xs font-medium" :class="[
                      getOptionPnL(position).unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                    ]">
                      {{ getOptionPnL(position).unrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(getOptionPnL(position).unrealizedPnLPercent) }}%
                    </div>
                  </template>
                  <span v-else class="text-xs text-gray-400">Enter premium below</span>
                </div>
                <div v-else-if="position.unrealizedPnL !== null" class="text-right">
                  <div class="text-lg font-bold" :class="[
                    position.unrealizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  ]">
                    {{ formatSignedCurrency(position.unrealizedPnL) }}
                  </div>
                  <div class="text-xs font-medium" :class="[
                    position.unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                  ]">
                    {{ position.unrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(position.unrealizedPnLPercent) }}%
                  </div>
                </div>
              </div>

              <!-- Key Metrics Grid -->
              <div class="grid grid-cols-2 gap-3 mb-3">
                <div class="table-card-row">
                  <span class="table-card-label">Traded</span>
                  <span class="table-card-value">
                    {{ (position.totalSharesTraded || position.totalQuantity || 0).toLocaleString() }}
                  </span>
                </div>
                <div class="table-card-row">
                  <span class="table-card-label">Shares Held</span>
                  <span class="table-card-value">
                    {{ position.totalQuantity === 0 ? 'Hedged' : (position.totalQuantity || 0).toLocaleString() }}
                  </span>
                </div>
                <div class="table-card-row">
                  <span class="table-card-label">Avg Price</span>
                  <span class="table-card-value">{{ formatCurrency(position.avgPrice) }}</span>
                </div>
                <div class="table-card-row">
                  <span class="table-card-label">Total Cost</span>
                  <span class="table-card-value">{{ formatCurrency(position.totalCost) }}</span>
                </div>
                <div class="table-card-row">
                  <span class="table-card-label">{{ position.requires_manual_price ? 'Premium' : 'Current Price' }}<span v-if="position.quoteSource === 'alpaca'" class="ml-1 text-gray-400 font-normal">(via Alpaca)</span></span>
                  <span class="table-card-value">
                    <template v-if="position.requires_manual_price">
                      <div class="flex items-center space-x-1">
                        <span class="text-xs text-gray-400">{{ currencySymbol }}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Enter"
                          :value="getManualOptionPrice(position) ?? ''"
                          @input="setManualOptionPrice(position, $event.target.value)"
                          class="w-20 text-right text-sm font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-900 dark:text-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>
                    </template>
                    <template v-else>
                      <span v-if="position.currentPrice !== null">{{ formatCurrency(position.currentPrice) }}</span>
                      <span v-else class="text-xs text-gray-400">-</span>
                    </template>
                  </span>
                </div>
              </div>

              <!-- Individual Trades (only show when position has multiple trades) -->
              <div v-if="position.trades.length > 1" class="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {{ position.trades.length }} trades
                </div>
                <div class="space-y-2">
                  <div v-for="trade in position.trades" :key="trade.id"
                       class="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 rounded px-3 py-2">
                    <div class="flex items-center space-x-2">
                      <span class="text-xs text-gray-500">Trade #{{ trade.id }}</span>
                      <span class="px-1.5 text-xs leading-4 font-medium rounded"
                        :class="[
                          trade.side === 'long'
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/10 dark:text-green-400'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-400'
                        ]">
                        {{ trade.side }}
                      </span>
                      <span class="text-xs text-gray-600 dark:text-gray-400">
                        {{ (trade.quantity || 0).toLocaleString() }} @ {{ formatCurrency(trade.entry_price) }}
                      </span>
                    </div>
                    <router-link
                      :to="`/trades/${trade.id}`"
                      class="text-xs text-primary-600 hover:text-primary-900 dark:hover:text-primary-400 font-medium"
                    >
                      View →
                    </router-link>
                  </div>
                </div>
              </div>
              <!-- Single trade: just show a View link -->
              <div v-else class="pt-3 border-t border-gray-200 dark:border-gray-700">
                <router-link
                  :to="`/trades/${position.trades[0].id}`"
                  class="text-sm text-primary-600 hover:text-primary-900 dark:hover:text-primary-400 font-medium"
                >
                  View Trade →
                </router-link>
              </div>
            </div>

            <!-- Total Summary Card -->
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border-2 border-gray-300 dark:border-gray-600">
              <div class="flex justify-between items-center">
                <div class="text-sm font-bold text-gray-900 dark:text-white">Total Position</div>
                <div class="text-right">
                  <div class="text-sm font-bold text-gray-900 dark:text-white">
                    {{ formatCurrency(totalOpenCost) }}
                  </div>
                  <div v-if="totalUnrealizedPnL !== null" class="text-sm font-bold" :class="[
                    totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    {{ formatSignedCurrency(totalUnrealizedPnL) }}
                  </div>
                </div>
              </div>
            </div>
                  </div>

                  <!-- Desktop Table View -->
                  <div class="hidden lg:block overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Side
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Traded
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Shares Held
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Entry Price
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Current Price
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unrealized P&L
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Individual Trades
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <template v-for="position in displayedOpenTrades" :key="getOpenPositionKey(position)">
                  <!-- Position Summary Row -->
                  <tr class="bg-gray-50 dark:bg-gray-800/50 font-medium">
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white">
                      <div class="flex items-center gap-2">
                        <StockLogo
                          :symbol="position.symbol"
                          size-class="w-8 h-8"
                        />
                        <div>
                          <span>{{ position.symbol }}</span>
                          <div v-if="formatOptionContract(position)" class="text-xs font-normal text-gray-500 dark:text-gray-400">
                            {{ formatOptionContract(position) }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-sm">
                      <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                        :class="[
                          position.side === 'long'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : position.side === 'short'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        ]">
                        {{ position.side === 'neutral' ? 'hedged' : position.side }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      {{ (position.totalSharesTraded || position.totalQuantity || 0).toLocaleString() }}
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-right">
                      {{ position.totalQuantity === 0 ? 'Hedged' : (position.totalQuantity || 0).toLocaleString() }}
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-right">
                      {{ formatCurrency(position.avgPrice) }}
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-right">
                      {{ formatCurrency(position.totalCost) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right">
                      <!-- Option: manual premium input -->
                      <template v-if="position.requires_manual_price">
                        <div class="flex items-center justify-end space-x-1">
                          <span class="text-xs text-gray-400">{{ currencySymbol }}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Premium"
                            :value="getManualOptionPrice(position) ?? ''"
                            @input="setManualOptionPrice(position, $event.target.value)"
                            class="w-20 text-right text-sm font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-900 dark:text-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </template>
                      <!-- Stock/Future: Finnhub price -->
                      <template v-else>
                        <div v-if="position.currentPrice !== null" class="font-bold text-gray-900 dark:text-white">
                          {{ formatCurrency(position.currentPrice) }}
                          <div v-if="position.dayChange !== undefined" class="text-xs" :class="[
                            position.dayChange >= 0 ? 'text-green-600' : 'text-red-600'
                          ]">
                            {{ formatSignedCurrency(position.dayChange) }}
                            ({{ position.dayChangePercent >= 0 ? '+' : '' }}{{ formatNumber(position.dayChangePercent) }}%)
                          </div>
                          <div v-if="position.quoteSource === 'alpaca'" class="text-xs text-gray-400">via Alpaca</div>
                        </div>
                        <span v-else class="text-xs text-gray-400">-</span>
                      </template>
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-right">
                      <template v-if="position.requires_manual_price">
                        <span v-if="getOptionPnL(position).currentValue !== null" class="text-gray-900 dark:text-white">
                          {{ formatCurrency(getOptionPnL(position).currentValue) }}
                        </span>
                        <span v-else class="text-xs text-gray-400">-</span>
                      </template>
                      <template v-else>
                        <span v-if="position.currentValue !== null" class="text-gray-900 dark:text-white">
                          {{ formatCurrency(position.currentValue) }}
                        </span>
                        <span v-else class="text-xs text-gray-400">-</span>
                      </template>
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-right">
                      <template v-if="position.requires_manual_price">
                        <div v-if="getOptionPnL(position).unrealizedPnL !== null">
                          <div :class="[
                            getOptionPnL(position).unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                          ]">
                            {{ formatSignedCurrency(getOptionPnL(position).unrealizedPnL) }}
                          </div>
                          <div class="text-xs" :class="[
                            getOptionPnL(position).unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                          ]">
                            {{ getOptionPnL(position).unrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(getOptionPnL(position).unrealizedPnLPercent) }}%
                          </div>
                        </div>
                        <span v-else class="text-xs text-gray-400">Enter premium</span>
                      </template>
                      <template v-else>
                        <div v-if="position.unrealizedPnL !== null">
                          <div :class="[
                            position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                          ]">
                            {{ formatSignedCurrency(position.unrealizedPnL) }}
                          </div>
                          <div class="text-xs" :class="[
                            position.unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                          ]">
                            {{ position.unrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(position.unrealizedPnLPercent) }}%
                          </div>
                        </div>
                        <span v-else class="text-xs text-gray-400">-</span>
                      </template>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {{ position.trades.length }} {{ position.trades.length === 1 ? 'trade' : 'trades' }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right">
                      <router-link
                        v-if="position.trades.length === 1"
                        :to="`/trades/${position.trades[0].id}`"
                        class="text-primary-600 hover:text-primary-900 dark:hover:text-primary-400 font-medium text-xs"
                      >
                        View
                      </router-link>
                      <span v-else class="text-xs text-gray-400">Position Total</span>
                    </td>
                  </tr>
                  
                  <!-- Individual Trade Rows (only show when position has multiple trades) -->
                  <tr v-if="position.trades.length > 1" v-for="trade in position.trades" :key="trade.id" class="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 pl-6">
                      <span class="text-xs">└─</span> Trade #{{ trade.id }}
                    </td>
                    <td class="px-3 py-2 text-sm">
                      <span class="px-1.5 inline-flex text-xs leading-4 font-medium rounded"
                        :class="[
                          trade.side === 'long' 
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/10 dark:text-green-400'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-400'
                        ]">
                        {{ trade.side }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      {{ (trade.quantity || 0).toLocaleString() }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      {{ formatCurrency(trade.entry_price) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      {{ formatCurrency(trade.entry_price * trade.quantity) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {{ formatDate(trade.trade_date) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right">
                      <router-link
                        :to="`/trades/${trade.id}`"
                        class="text-primary-600 hover:text-primary-900 dark:hover:text-primary-400 font-medium text-xs"
                      >
                        View
                      </router-link>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot class="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <tr>
                  <td colspan="5" class="px-3 py-3 text-sm font-bold text-gray-900 dark:text-white text-right">
                    Total:
                  </td>
                  <td class="px-3 py-3 text-sm font-bold text-gray-900 dark:text-white text-right tabular-nums">
                    {{ formatCurrency(totalOpenCost) }}
                  </td>
                  <td class="px-3 py-3"></td>
                  <td class="px-3 py-3 text-sm font-bold text-gray-900 dark:text-white text-right tabular-nums">
                    <span v-if="totalCurrentValue !== null">{{ formatCurrency(totalCurrentValue) }}</span>
                    <span v-else class="text-xs text-gray-400">-</span>
                  </td>
                  <td class="px-3 py-3 text-sm font-bold text-right tabular-nums">
                    <div v-if="totalUnrealizedPnL !== null">
                      <div :class="[
                        totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      ]">
                        {{ formatSignedCurrency(totalUnrealizedPnL) }}
                      </div>
                      <div class="text-xs" :class="[
                        totalUnrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                      ]">
                        {{ totalUnrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(totalUnrealizedPnLPercent) }}%
                      </div>
                    </div>
                    <span v-else class="text-xs text-gray-400">-</span>
                  </td>
                  <td colspan="2" class="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
                  </div>

                  <!-- Show all / Show less toggle. Only rendered when the
                       user actually has more positions than the preview cap,
                       to avoid a useless button when they have ≤5. -->
                  <div
                    v-if="hasMoreOpenTrades"
                    class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center"
                  >
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                      @click="showAllOpenTrades = !showAllOpenTrades"
                    >
                      <template v-if="showAllOpenTrades">
                        Show less
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                        </svg>
                      </template>
                      <template v-else>
                        Show all {{ openTrades.length }} positions
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </template>
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- Upcoming Earnings Section (Pro Only) -->
            <template v-if="element.id === 'upcoming-earnings'">
              <UpcomingEarningsSection
                v-if="openTradeSymbols.length > 0 && authStore.user?.tier === 'pro'"
                :symbols="openTradeSymbols"
              />
            </template>

            <!-- Trade News Section (Pro Only) -->
            <template v-if="element.id === 'trade-news'">
              <TradeNewsSection
                v-if="openTradeSymbols.length > 0 && authStore.user?.tier === 'pro'"
                :symbols="openTradeSymbols"
              />
            </template>

            <!-- Key Metrics Cards -->
            <template v-if="element.id === 'key-metrics'">
              <!-- Skeleton while analytics loads -->
              <div v-if="analyticsLoading" class="flex-card-container">
                <div v-for="n in 4" :key="n" class="card card-mobile-safe flex-1">
                  <div class="card-body">
                    <div class="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div class="mt-3 h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div class="mt-3 h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
              <div v-else class="flex-card-container">
                <div class="card card-mobile-safe flex-1">
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      Total P&L
                    </dt>
                    <div class="mt-1 space-y-2">
                      <div>
                        <div class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Gross</div>
                        <dd class="text-xl sm:text-2xl lg:text-3xl font-semibold whitespace-nowrap" :class="[
                          dashboardGrossPnl >= 0 ? 'text-green-600' : 'text-red-600'
                        ]">
                          {{ formatCurrency(dashboardGrossPnl) }}
                        </dd>
                      </div>
                      <div>
                        <div class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Net</div>
                        <dd class="text-base sm:text-lg font-semibold whitespace-nowrap" :class="[
                          dashboardNetPnl >= 0 ? 'text-green-600' : 'text-red-600'
                        ]">
                          {{ formatCurrency(dashboardNetPnl) }}
                        </dd>
                      </div>
                    </div>
                    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {{ calculationMethod }} net avg: {{ formatCurrency(dashboardAvgNetPnl) }}
                    </div>
                  </div>
                </div>

                <div class="card card-mobile-safe flex-1">
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      Win Rate
                    </dt>
                    <dd class="mt-1 text-xl sm:text-2xl lg:text-3xl font-semibold whitespace-nowrap" :class="[
                      analytics.summary.winRate >= 50 ? 'text-green-600' : 'text-red-600'
                    ]">
                      {{ formatPercent(analytics.summary.winRate) }}%
                    </dd>
                    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {{ analytics.summary.winningTrades }}/{{ analytics.summary.totalTrades }} trades
                    </div>
                  </div>
                </div>

                <div class="card card-mobile-safe flex-1">
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      Profit Factor
                    </dt>
                    <dd class="mt-1 text-xl sm:text-2xl lg:text-3xl font-semibold whitespace-nowrap" :class="[
                      analytics.summary.profitFactor >= 1 ? 'text-green-600' : 'text-red-600'
                    ]">
                      {{ formatNumber(analytics.summary.profitFactor) }}
                    </dd>
                    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {{ analytics.summary.profitFactor >= 1 ? 'Profitable' : 'Unprofitable' }}
                    </div>
                  </div>
                </div>

                <div
                  class="card card-mobile-safe flex-1 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  role="button"
                  tabindex="0"
                  aria-label="View max drawdown trades"
                  @click="navigateToAnalytics('drawdown')"
                  @keydown.enter.prevent="navigateToAnalytics('drawdown')"
                  @keydown.space.prevent="navigateToAnalytics('drawdown')"
                >
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      Max Drawdown
                    </dt>
                    <dd class="mt-1 text-xl sm:text-2xl lg:text-3xl font-semibold text-red-600 whitespace-nowrap">
                      {{ formatCurrency(analytics.summary.maxDrawdown, { abs: true }) }}
                    </dd>
                    <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Peak decline
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Additional Metrics Row -->
            <template v-if="element.id === 'additional-metrics'">
              <div v-if="analyticsLoading" class="flex-card-container">
                <div v-for="n in 4" :key="n" class="card card-mobile-safe flex-1">
                  <div class="card-body">
                    <div class="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div class="mt-3 h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
              <div v-else class="flex-card-container">
                <div
                  class="card card-mobile-safe flex-1 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  role="button"
                  tabindex="0"
                  :aria-label="`View ${calculationMethod} winning trades`"
                  @click="navigateToTradesFiltered('avgWin')"
                  @keydown.enter.prevent="navigateToTradesFiltered('avgWin')"
                  @keydown.space.prevent="navigateToTradesFiltered('avgWin')"
                >
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      {{ calculationMethod }} Win
                    </dt>
                    <dd class="mt-1 text-lg sm:text-xl lg:text-2xl font-semibold text-green-600 whitespace-nowrap">
                      {{ formatCurrency(analytics.summary.avgWin) }}
                    </dd>
                  </div>
                </div>

                <div
                  class="card card-mobile-safe flex-1 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  role="button"
                  tabindex="0"
                  :aria-label="`View ${calculationMethod} losing trades`"
                  @click="navigateToTradesFiltered('avgLoss')"
                  @keydown.enter.prevent="navigateToTradesFiltered('avgLoss')"
                  @keydown.space.prevent="navigateToTradesFiltered('avgLoss')"
                >
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      {{ calculationMethod }} Loss
                    </dt>
                    <dd class="mt-1 text-lg sm:text-xl lg:text-2xl font-semibold text-red-600 whitespace-nowrap">
                      {{ formatCurrency(analytics.summary.avgLoss, { abs: true }) }}
                    </dd>
                  </div>
                </div>

                <div
                  class="card card-mobile-safe flex-1 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  role="button"
                  tabindex="0"
                  aria-label="View best trade"
                  @click="navigateToTradesFiltered('best')"
                  @keydown.enter.prevent="navigateToTradesFiltered('best')"
                  @keydown.space.prevent="navigateToTradesFiltered('best')"
                >
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      Best Trade
                    </dt>
                    <dd class="mt-1 text-lg sm:text-xl lg:text-2xl font-semibold text-green-600 whitespace-nowrap">
                      {{ formatCurrency(analytics.summary.bestTrade) }}
                    </dd>
                  </div>
                </div>

                <div
                  class="card card-mobile-safe flex-1 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  role="button"
                  tabindex="0"
                  aria-label="View worst trade"
                  @click="navigateToTradesFiltered('worst')"
                  @keydown.enter.prevent="navigateToTradesFiltered('worst')"
                  @keydown.space.prevent="navigateToTradesFiltered('worst')"
                >
                  <div class="card-body">
                    <dt class="text-data-secondary truncate">
                      Worst Trade
                    </dt>
                    <dd class="mt-1 text-lg sm:text-xl lg:text-2xl font-semibold text-red-600 whitespace-nowrap">
                      {{ formatCurrency(analytics.summary.worstTrade) }}
                    </dd>
                  </div>
                </div>
              </div>
            </template>

            <!-- Charts Row -->
            <template v-if="element.id === 'charts'">
              <!-- Equity curve moved to the equity-and-calendar section.
                   This section now hosts just the Win/Loss Distribution. -->
              <div v-if="analyticsLoading" class="grid grid-cols-1 gap-6">
                <div class="card">
                  <div class="card-body">
                    <div class="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4"></div>
                    <div class="h-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
              <div v-else class="grid grid-cols-1">
                <!-- Win/Loss Distribution -->
                <div class="card">
                  <div class="card-body">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Win/Loss Distribution
                    </h3>
                    <div class="h-64 relative">
                      <canvas ref="distributionChart"></canvas>
                      <!-- Center label below the arc -->
                      <div class="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none" style="margin-bottom: 0.25rem;">
                        <div class="text-center">
                          <div class="text-3xl font-bold text-gray-900 dark:text-white">
                            {{ computedWinRate }}%
                          </div>
                          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Win Rate
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- Custom legend -->
                    <div class="flex justify-center gap-5 mt-2">
                      <button
                        class="flex items-center gap-1.5 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                        @click="navigateToTradesByPnLType('profit')"
                      >
                        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <span class="text-gray-600 dark:text-gray-400">{{ parseInt(analytics?.summary?.winningTrades) || 0 }} Wins</span>
                      </button>
                      <button
                        class="flex items-center gap-1.5 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                        @click="navigateToTradesByPnLType('loss')"
                      >
                        <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                        <span class="text-gray-600 dark:text-gray-400">{{ parseInt(analytics?.summary?.losingTrades) || 0 }} Losses</span>
                      </button>
                      <button
                        class="flex items-center gap-1.5 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                        @click="navigateToTradesByPnLType('breakeven')"
                      >
                        <span class="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                        <span class="text-gray-600 dark:text-gray-400">{{ parseInt(analytics?.summary?.breakevenTrades) || 0 }} BE</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Daily Win Rate Chart Row -->
            <template v-if="element.id === 'win-rate-chart'">
              <div class="grid grid-cols-1 gap-8">
                <div class="card">
                  <div class="card-body">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Daily Win Rate &amp; P/L Ratio
                    </h3>
                    <div class="h-80">
                      <canvas ref="winRateChart"></canvas>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Performance Tables Row -->
            <template v-if="element.id === 'performance-tables'">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Performance by Symbol -->
                <div class="card">
                  <div class="card-body">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Performance by Symbol
                    </h3>
                    <div class="overflow-x-auto">
                      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead>
                          <tr>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Symbol
                            </th>
                            <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Trades
                            </th>
                            <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              P&L
                            </th>
                            <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Avg
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                          <tr v-for="symbol in analytics.performanceBySymbol.slice(0, 10)" :key="symbol.symbol" 
                              @click="navigateToTradesWithSymbol(symbol.symbol)"
                              class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td class="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                              <div class="flex items-center gap-2">
                                <StockLogo
                                  :symbol="symbol.symbol"
                                  size-class="w-8 h-8"
                                />
                                <span>{{ symbol.symbol }}</span>
                              </div>
                            </td>
                            <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                              {{ symbol.trades }}
                            </td>
                            <td class="px-3 py-2 text-sm text-right" :class="[
                              symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                            ]">
                              {{ formatCurrency(symbol.total_pnl) }}
                            </td>
                            <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                              {{ formatCurrency(symbol.avg_pnl) }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <!-- Best and Worst Trades -->
                <div class="card">
                  <div class="card-body">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Top Trades
                    </h3>
                    
                    <div class="space-y-4">
                      <div>
                        <h4 class="text-sm font-medium text-green-600 mb-2">Best Trades</h4>
                        <div class="space-y-1">
                          <div v-for="trade in analytics.topTrades.best" :key="`best-${trade.id}-${trade.symbol}-${trade.trade_date}`"
                               @click="navigateToTradesBySymbolAndDate(trade.symbol, trade.trade_date)"
                               class="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-2 transition-colors">
                            <span class="text-gray-900 dark:text-white flex items-center min-w-0">
                              <span class="truncate">{{ trade.symbol }} {{ formatDate(trade.trade_date) }}</span>
                              <span v-if="trade.group_detected_strategy"
                                class="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 whitespace-nowrap flex-shrink-0"
                                :title="`Auto-detected strategy: ${formatGroupStrategy(trade.group_detected_strategy)} (${trade.group_leg_count}-leg position)`">
                                {{ formatGroupStrategy(trade.group_detected_strategy) }}
                              </span>
                            </span>
                            <span class="text-green-600 font-medium">
                              {{ formatCurrency(trade.pnl) }}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 class="text-sm font-medium text-red-600 mb-2">Worst Trades</h4>
                        <div class="space-y-1">
                          <div v-if="analytics.topTrades.worst && analytics.topTrades.worst.length > 0"
                               v-for="trade in analytics.topTrades.worst" :key="`worst-${trade.id}-${trade.symbol}-${trade.trade_date}`"
                               @click="navigateToTradesBySymbolAndDate(trade.symbol, trade.trade_date)"
                               class="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-2 transition-colors">
                            <span class="text-gray-900 dark:text-white flex items-center min-w-0">
                              <span class="truncate">{{ trade.symbol }} {{ formatDate(trade.trade_date) }}</span>
                              <span v-if="trade.group_detected_strategy"
                                class="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 whitespace-nowrap flex-shrink-0"
                                :title="`Auto-detected strategy: ${formatGroupStrategy(trade.group_detected_strategy)} (${trade.group_leg_count}-leg position)`">
                                {{ formatGroupStrategy(trade.group_detected_strategy) }}
                              </span>
                            </span>
                            <span :class="[
                              trade.pnl >= 0 ? 'text-green-600' : 'text-red-600',
                              'font-medium'
                            ]">
                              {{ formatCurrency(trade.pnl) }}
                            </span>
                          </div>
                          <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic py-2 flex items-center">
                            <MdiIcon :icon="mdiCheckCircle" :size="16" class="mr-1 text-green-500" />
                            No losing trades found
                          </div>
                        </div>
                      </div>

                      <!-- Net P&L Difference -->
                      <div v-if="analytics.topTrades.best?.length && analytics.topTrades.worst?.length" class="border-t border-gray-200 dark:border-gray-600 pt-3">
                        <div class="flex justify-between items-center px-2">
                          <span class="text-sm font-semibold text-gray-900 dark:text-white">Net Difference</span>
                          <span class="text-sm font-semibold" :class="topTradesNetPnl >= 0 ? 'text-green-600' : 'text-red-600'">
                            {{ formatCurrency(topTradesNetPnl) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Additional Stats -->
            <template v-if="element.id === 'additional-stats'">
              <div class="card">
                <div class="card-body">
                  <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Additional Statistics
                  </h3>
                  <!-- Each cell is a flex column with the value pushed to the
                       bottom via mt-auto so values always align across the row
                       even when one label happens to wrap to two lines. -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="flex flex-col">
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Sharpe Ratio
                      </dt>
                      <dd class="mt-auto pt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {{ formatNumber(analytics.summary.sharpeRatio) }}
                      </dd>
                    </div>
                    <div class="flex flex-col">
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Commissions
                      </dt>
                      <dd class="mt-auto pt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {{ formatCurrency(analytics.summary.totalCosts) }}
                      </dd>
                    </div>
                    <div class="flex flex-col">
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Symbols Traded
                      </dt>
                      <dd class="mt-auto pt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {{ analytics.summary.symbolsTraded }}
                      </dd>
                    </div>
                    <div class="flex flex-col">
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Trading Days
                      </dt>
                      <dd class="mt-auto pt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {{ analytics.summary.tradingDays }}
                      </dd>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            </template>
          </div>
        </template>
      </draggable>
        </div>

        <!-- Right rail: News + Upcoming Earnings. Pro-gated and only shown
             when the user has open positions to query. Sticky to the top of
             the viewport on desktop with its own internal scroll so it stays
             visible while the main dashboard scrolls. On mobile it collapses
             to a regular block below the main column. Visibility is wired to
             the `news-rail` section in the dashboardLayout so the user can
             hide it from Customize. -->
        <aside
          v-if="showNewsRail"
          class="lg:w-80 xl:w-96 shrink-0"
        >
          <div
            class="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1"
          >
            <!-- Customize header on the rail — only visible in customize mode.
                 No drag handle (the rail isn't reorderable), just a title and
                 the visibility toggle so users can hide the whole rail. -->
            <div
              v-if="isCustomizing"
              class="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md"
            >
              <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
                News &amp; Earnings (right rail)
              </span>
              <button
                type="button"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
                :class="newsRailUserVisible
                  ? 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                :title="newsRailUserVisible ? 'Hide news rail' : 'Show news rail'"
                @click="toggleSectionVisibility('news-rail')"
              >
                <svg v-if="newsRailUserVisible" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <span class="hidden sm:inline">{{ newsRailUserVisible ? 'Visible' : 'Hidden' }}</span>
              </button>
            </div>

            <!-- Hidden-state placeholder shown only in customize mode so the
                 user has something visible to click the eye on. -->
            <div
              v-if="isCustomizing && !newsRailUserVisible"
              class="card-dense opacity-60"
            >
              <div class="card-dense-body text-center text-sm text-gray-500 dark:text-gray-400">
                The news rail is hidden. Click the eye icon above to show it.
              </div>
            </div>

            <template v-if="newsRailUserVisible">
              <TradeNewsSection :symbols="openTradeSymbols" />
              <UpcomingEarningsSection :symbols="openTradeSymbols" />
            </template>
          </div>
        </aside>
      </div>
    </div>

    <!-- Advanced filters modal -->
    <div
      v-if="showFiltersModal"
      class="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-filters-modal-title"
    >
      <div class="flex min-h-full items-start justify-center p-4 sm:p-6">
        <div
          class="fixed inset-0 bg-gray-900/50 transition-opacity"
          @click="showFiltersModal = false"
        ></div>
        <div class="relative w-full max-w-5xl bg-white dark:bg-gray-800 rounded-lg shadow-xl">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 id="dashboard-filters-modal-title" class="heading-card">Filter dashboard</h3>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="showFiltersModal = false"
                class="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close filters"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div class="px-6 py-5">
            <!-- :auto-apply-on-mount="false" prevents the mount-time emit
                 from immediately closing the modal we just opened.
                 No max-h/overflow here — would clip TradeFilters' absolutely
                 positioned dropdowns. Outer modal (`overflow-y-auto`) scrolls. -->
            <TradeFilters :auto-apply-on-mount="false" :hide-time-period="true" @filter="handleAdvancedFilter" />
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { format } from 'date-fns'
import { formatTradeDate, formatLocalDate } from '@/utils/date'
import Chart from 'chart.js/auto'
import api from '@/services/api'
import TradeNewsSection from '@/components/dashboard/TradeNewsSection.vue'
import UpcomingEarningsSection from '@/components/dashboard/UpcomingEarningsSection.vue'
import TodaysJournalEntry from '@/components/diary/TodaysJournalEntry.vue'
import HeroMetricsRibbon from '@/components/dashboard/HeroMetricsRibbon.vue'
import AiInsightCard from '@/components/dashboard/AiInsightCard.vue'
import CalendarHeatmap from '@/components/dashboard/CalendarHeatmap.vue'
import StreakMomentumCard from '@/components/dashboard/StreakMomentumCard.vue'
import BehavioralAlertsCard from '@/components/dashboard/BehavioralAlertsCard.vue'
import RecentTradesTimeline from '@/components/dashboard/RecentTradesTimeline.vue'
import WinLossPulse from '@/components/dashboard/WinLossPulse.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiCheckCircle } from '@mdi/js'
import { getRefreshInterval, shouldRefreshPrices, getMarketStatus } from '@/utils/marketHours'
import YearWrappedBanner from '@/components/yearWrapped/YearWrappedBanner.vue'
import YearWrappedModal from '@/components/yearWrapped/YearWrappedModal.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import StockLogo from '@/components/common/StockLogo.vue'
import TradeFilters from '@/components/trades/TradeFilters.vue'
import { useYearWrappedStore } from '@/stores/yearWrapped'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import { useTradesStore } from '@/stores/trades'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import {
  normalizeTradeFiltersForSharedState,
  loadTradeFiltersFromStorage
} from '@/utils/tradeFilterState'
import draggable from 'vuedraggable'

const authStore = useAuthStore()
const { formatTime: formatTimeTz } = useUserTimezone()
const { formatCurrency, currencySymbol, formatSignedCurrency } = useCurrencyFormatter()
const { selectedAccount, selectedAccountLabel } = useGlobalAccountFilter()
const yearWrappedStore = useYearWrappedStore()
const uiPreferencesStore = useUiPreferencesStore()
const tradesStore = useTradesStore()
const router = useRouter()

const loading = computed(() => analyticsLoading.value || quotesLoading.value)
const initialLoading = ref(true) // Track initial load separately to preserve scroll on refresh
const userSettings = ref(null)
const analytics = ref({
  summary: {},
  performanceBySymbol: [],
  dailyPnL: [],
  dailyWinRate: [],
  topTrades: { best: [], worst: [] }
})

// Auto-update state
const lastRefresh = ref(null)
const nextRefreshIn = ref(0)
const isAutoUpdating = ref(false)
const marketStatus = ref({ isOpen: false, status: 'Market Closed' })

const calculationMethod = computed(() => {
  return userSettings.value?.statisticsCalculation === 'median' ? 'Median' : 'Average'
})
const openTrades = ref([])

// Open positions are capped at 5 by default to keep the card from
// dominating the dashboard when a user has many active positions.
// "Show all" expands to render the full list inline; "Show less"
// collapses back. Totals row stays unchanged (it computes across
// the full openTrades array, not the displayed slice).
const OPEN_TRADES_PREVIEW_COUNT = 5
const showAllOpenTrades = ref(false)
const displayedOpenTrades = computed(() => {
  if (showAllOpenTrades.value) return openTrades.value
  return openTrades.value.slice(0, OPEN_TRADES_PREVIEW_COUNT)
})
const hasMoreOpenTrades = computed(
  () => openTrades.value.length > OPEN_TRADES_PREVIEW_COUNT
)
const quotesLoading = ref(false) // True while Finnhub quotes are being fetched
const analyticsLoading = ref(true) // True while analytics data is being fetched
let openPositionsRequestId = 0

// Manual option price tracking (persisted in localStorage)
const manualOptionPrices = ref({})

function loadManualOptionPrices() {
  try {
    const stored = localStorage.getItem('tradetally_manual_option_prices')
    if (stored) manualOptionPrices.value = JSON.parse(stored)
  } catch (e) {
    console.log('[DASHBOARD] Failed to load manual option prices:', e)
  }
}

function saveManualOptionPrices() {
  localStorage.setItem('tradetally_manual_option_prices', JSON.stringify(manualOptionPrices.value))
}

// Manual prices are keyed by position key so two contracts on the same
// underlying never share one input. Legacy entries were keyed by bare symbol;
// reads fall back to them and the first write retires them.
function setManualOptionPrice(position, value) {
  const key = getOpenPositionKey(position)
  const num = parseFloat(value)
  if (isNaN(num) || num < 0) {
    delete manualOptionPrices.value[key]
  } else {
    manualOptionPrices.value[key] = num
  }
  if (key !== position.symbol) {
    delete manualOptionPrices.value[position.symbol]
  }
  saveManualOptionPrices()
}

function getManualOptionPrice(position) {
  return manualOptionPrices.value[getOpenPositionKey(position)] ?? manualOptionPrices.value[position.symbol]
}

function getOptionPnL(position) {
  const price = getManualOptionPrice(position)
  if (price === undefined || price === null) return { currentValue: null, unrealizedPnL: null, unrealizedPnLPercent: null }
  const multiplier = position.contractSize || 100
  const currentValue = price * position.totalQuantity * multiplier
  const unrealizedPnL = position.side === 'short'
    ? position.totalCost - currentValue
    : currentValue - position.totalCost
  const unrealizedPnLPercent = position.totalCost !== 0 ? (unrealizedPnL / position.totalCost) * 100 : 0
  return { currentValue, unrealizedPnL, unrealizedPnLPercent }
}

const filters = ref({
  timeRange: 'all',
  startDate: '',
  endDate: ''
})

// Hero ribbon display mode: false = dollars, true = R-multiples. Persisted +
// synced so the choice (e.g. hide dollar values when sharing) follows the user.
const dashboardRMode = ref(false)

function setDashboardRMode(value) {
  dashboardRMode.value = value
  try {
    localStorage.setItem('dashboardRMode', JSON.stringify(value))
    uiPreferencesStore.notifyChanged('dashboardRMode', value)
  } catch (e) {
    console.error('Failed to save dashboard R mode:', e)
  }
}

// Advanced filter spec from the shared TradeFilters component (tags, strategies,
// brokers, instrument types, etc.). Date/account come from the dashboard's own
// controls, so we strip those before applying so they don't double up.
const appliedFilters = ref({})
const showFiltersModal = ref(false)

// Keys that are managed by the dashboard's primary controls (time range +
// global account selector). We ignore them in the advanced-filter spec so the
// modal doesn't quietly override the header dropdowns.
const ADVANCED_FILTER_IGNORE_KEYS = new Set([
  'startDate', 'endDate', 'accounts'
])

// Boolean false means "toggle off" (e.g. symbolExact persisted by the trades
// filter panel) — not an active filter. Counting it produced a phantom
// "1 filter active" badge that wouldn't clear (issue #350).
function isActiveAdvancedFilterValue(v) {
  if (v === null || v === undefined || v === '' || v === false) return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

const activeAdvancedFilterCount = computed(() => {
  let count = 0
  for (const [k, v] of Object.entries(appliedFilters.value || {})) {
    if (ADVANCED_FILTER_IGNORE_KEYS.has(k)) continue
    if (!isActiveAdvancedFilterValue(v)) continue
    count++
  }
  return count
})

function appendAdvancedFilterParams(params) {
  for (const [k, v] of Object.entries(appliedFilters.value || {})) {
    if (ADVANCED_FILTER_IGNORE_KEYS.has(k)) continue
    if (!isActiveAdvancedFilterValue(v)) continue
    params.append(k, Array.isArray(v) ? v.join(',') : String(v))
  }
}

function handleAdvancedFilter(newFilters) {
  const normalizedFilters = normalizeTradeFiltersForSharedState(newFilters || {})
  appliedFilters.value = normalizedFilters
  tradesStore.setFilters(normalizedFilters)
  showFiltersModal.value = false
  // Same refresh set as the time-range / global-account watchers.
  fetchAnalytics()
  fetchAiInsight()
  fetchRecentTrades()
  fetchBehavioralSummary()
}

function hydrateSharedTradeFilters() {
  const savedFilters = loadTradeFiltersFromStorage()
  appliedFilters.value = savedFilters
  tradesStore.setFilters(savedFilters)
}

const showTimeRangeDropdown = ref(false)

const timeRangeOptions = [
  { value: 'all', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'custom', label: 'Custom Range' }
]

function getSelectedTimeRangeText() {
  const option = timeRangeOptions.find(o => o.value === filters.value.timeRange)
  return option ? option.label : 'All Time'
}

function selectTimeRange(value) {
  filters.value.timeRange = value
  showTimeRangeDropdown.value = false
  applyFilters()
}

const pnlChart = ref(null)
const distributionChart = ref(null)
const winRateChart = ref(null)
const equityCurveCanvas = ref(null) // command-center equity curve in new equity-and-calendar section
let pnlChartInstance = null
let distributionChartInstance = null
let winRateChartInstance = null
let equityCurveChartInstance = null
let updateInterval = null
let countdownInterval = null

// Dashboard layout customization
// Default section order — optimized for "what convinces in 5 seconds":
// hero metrics → journal → AI insight → equity+calendar → positions →
// momentum + risk signals → recent trades + win/loss → news+earnings.
// `defaultVisible: false` marks sections that exist in the registry but
// are hidden by default to keep the dashboard focused. Power users can
// re-enable any of them via the Customize panel.
const sectionDefinitions = [
  { id: 'hero-metrics', title: 'Hero Metrics Ribbon', category: 'stats', defaultVisible: true },
  { id: 'journal-entry', title: "Today's Journal Entry", category: 'content', defaultVisible: true },
  { id: 'ai-insight', title: 'AI Insight of the Day', category: 'stats', defaultVisible: true },
  { id: 'equity-and-calendar', title: 'Equity Curve & Calendar', category: 'charts', defaultVisible: true },
  { id: 'open-positions', title: 'Open Positions', category: 'content', defaultVisible: true },
  { id: 'momentum-and-risk', title: 'Momentum & Risk Signals', category: 'stats', defaultVisible: true },
  { id: 'recent-trades-and-distribution', title: 'Recent Trades & Win Rate', category: 'tables', defaultVisible: true },
  // News + Earnings live in a sticky right rail outside the draggable flow.
  // `location: 'rail'` flags it so the draggable template skips rendering it,
  // but the standard visibility toggle still works from customize mode.
  { id: 'news-rail', title: 'News & Earnings (right rail)', category: 'content', defaultVisible: true, location: 'rail' },
  // Legacy / power-user sections — hidden by default but available in Customize.
  { id: 'key-metrics', title: 'Key Metrics (legacy)', category: 'stats', defaultVisible: false },
  { id: 'additional-metrics', title: 'Additional Metrics (legacy)', category: 'stats', defaultVisible: false },
  { id: 'charts', title: 'Win/Loss Doughnut (legacy)', category: 'charts', defaultVisible: false },
  { id: 'win-rate-chart', title: 'Daily Win Rate & P/L Ratio Chart', category: 'charts', defaultVisible: false },
  { id: 'performance-tables', title: 'Performance by Symbol & Top Trades', category: 'tables', defaultVisible: false },
  { id: 'additional-stats', title: 'Additional Statistics', category: 'stats', defaultVisible: false },
  { id: 'recent-trades', title: 'Recent Trades (standalone)', category: 'tables', defaultVisible: false },
  { id: 'upcoming-earnings', title: 'Upcoming Earnings (standalone)', category: 'content', defaultVisible: false },
  { id: 'trade-news', title: 'Trade News (standalone)', category: 'content', defaultVisible: false }
]

const defaultDashboardLayout = sectionDefinitions.map(section => ({
  id: section.id,
  visible: section.defaultVisible !== false
}))

const dashboardLayout = ref(JSON.parse(JSON.stringify(defaultDashboardLayout)))
const hasVisibleDashboardSections = computed(() => dashboardLayout.value.some(section => section.visible))

// AI Insight Card state (driven by /analytics/recommendations?summary=true).
// Backend returns `summaries: [Insight, ...]` ordered by priority.
// Falls back to the single `summary` field for older backend builds.
const aiInsights = ref([])
const aiInsightLoading = ref(false)
const aiInsightError = ref(null)

async function fetchAiInsight() {
  aiInsightLoading.value = true
  aiInsightError.value = null
  try {
    const params = new URLSearchParams({ summary: 'true' })
    const dateRange = getDateRange(filters.value.timeRange)
    if (dateRange.startDate) params.append('startDate', dateRange.startDate)
    if (dateRange.endDate) params.append('endDate', dateRange.endDate)
    if (selectedAccount.value) params.append('accounts', selectedAccount.value)
    appendAdvancedFilterParams(params)
    const response = await api.get(`/analytics/recommendations?${params}`)
    const payload = response.data || {}
    if (Array.isArray(payload.summaries) && payload.summaries.length > 0) {
      aiInsights.value = payload.summaries
    } else if (payload.summary) {
      aiInsights.value = [payload.summary]
    } else {
      aiInsights.value = []
    }
  } catch (err) {
    console.warn('[DASHBOARD] AI insight summary failed:', err?.message)
    aiInsightError.value = err?.response?.data?.error || err?.message || 'unavailable'
  } finally {
    aiInsightLoading.value = false
  }
}

// Behavioral alerts summary (Pro-tier; gracefully degrades for free users).
const behavioralSummary = ref(null)
const behavioralLoading = ref(false)
const behavioralUpgradeRequired = ref(false)
// Track the fetch outcome explicitly so the card can distinguish "didn't
// load yet" / "endpoint missing" from "loaded but no signals to show."
const behavioralFetchStatus = ref('idle') // 'idle' | 'ok' | 'error' | 'forbidden'
const behavioralError = ref(null)

async function fetchBehavioralSummary() {
  behavioralLoading.value = true
  behavioralUpgradeRequired.value = false
  behavioralError.value = null
  try {
    const params = new URLSearchParams()
    const dateRange = getDateRange(filters.value.timeRange)
    if (dateRange.startDate) params.append('startDate', dateRange.startDate)
    if (dateRange.endDate) params.append('endDate', dateRange.endDate)
    if (selectedAccount.value) params.append('accounts', selectedAccount.value)
    appendAdvancedFilterParams(params)
    const qs = params.toString()
    const response = await api.get(`/behavioral-analytics/dashboard-summary${qs ? `?${qs}` : ''}`)
    behavioralSummary.value = response.data?.data || null
    behavioralFetchStatus.value = 'ok'
  } catch (err) {
    behavioralSummary.value = null
    if (err?.response?.status === 403) {
      behavioralUpgradeRequired.value = true
      behavioralFetchStatus.value = 'forbidden'
    } else {
      console.warn('[DASHBOARD] Behavioral summary failed:', err?.message)
      behavioralFetchStatus.value = 'error'
      behavioralError.value = err?.response?.status === 404
        ? 'Endpoint not found. Restart the backend to pick up the latest routes.'
        : (err?.response?.data?.error || err?.message || 'Request failed')
    }
  } finally {
    behavioralLoading.value = false
  }
}

// Recent trades (top 10 closed) — drives RecentTradesTimeline.
const recentTrades = ref([])
const recentTradesLoading = ref(false)

async function fetchRecentTrades() {
  recentTradesLoading.value = true
  try {
    const params = new URLSearchParams({ limit: '10', status: 'closed', skipCount: 'true' })
    if (selectedAccount.value) params.append('accounts', selectedAccount.value)
    appendAdvancedFilterParams(params)
    const response = await api.get(`/trades?${params}`)
    recentTrades.value = response.data?.trades || []
  } catch (err) {
    console.warn('[DASHBOARD] Recent trades fetch failed:', err?.message)
  } finally {
    recentTradesLoading.value = false
  }
}

// Range label shown in HeroMetricsRibbon
const heroRangeLabel = computed(() => getSelectedTimeRangeText())

// News + Earnings live in a sticky right rail outside the draggable dashboard
// flow. Shown when:
//   1) The user toggled it visible in Customize (default: visible).
//   2) They're Pro and have at least one open position to query.
// In customize mode itself we keep rendering the rail wrapper even when
// "hidden" so the user has a header to re-enable it.
const newsRailSection = computed(
  () => dashboardLayout.value.find(s => s.id === 'news-rail')
)
const newsRailUserVisible = computed(() => newsRailSection.value?.visible !== false)
const showNewsRail = computed(() => {
  if (openTradeSymbols.value.length === 0) return false
  if (authStore.user?.tier !== 'pro') return false
  // While customizing, keep the rail mounted so the toggle/header is visible.
  return newsRailUserVisible.value || isCustomizing.value
})
// Customize mode is inline on the dashboard surface: users see a drag
// handle + visibility toggle on each section, hidden sections render as
// ghosted placeholders so they can be re-enabled in place.
const isCustomizing = ref(false)
const onboardingStatus = ref(null)
const onboardingBannerDismissed = ref(false)
const hasSampleData = ref(false)
const removingSampleData = ref(false)
const billingAvailable = ref(false)
const subscription = ref(null)
const trialBannerDismissed = ref(false)
const postTrialBannerDismissed = ref(false)

const showPostTrialBanner = computed(() => {
  if (!subscription.value) return false
  return subscription.value.tier === 'free' &&
    subscription.value.has_used_trial === true &&
    !subscription.value.subscription
})

// Get section definition by ID
function getSectionDefinition(id) {
  return sectionDefinitions.find(section => section.id === id)
}

// Handle drag change event (fires when order actually changes)
function onDragChange() {
  saveDashboardLayout()
}

// Handle drag end event
function onDragEnd() {
  // Force save immediately after drag ends to ensure order is saved
  nextTick(() => {
    if (saveLayoutTimeout) clearTimeout(saveLayoutTimeout)
    saveDashboardLayout()
  })
}

// Edge-of-viewport auto-scroll while dragging a section. SortableJS 1.14's
// built-in scroll feature doesn't reliably scroll the window when no
// overflow-scroll parent is present in the chain, so we run our own loop.
let dragScrollRAF = null
let dragPointerY = 0
const DRAG_EDGE_PX = 100      // distance from viewport edge that triggers scroll
const DRAG_MAX_SPEED = 22     // max pixels per animation frame

function onDragPointerMove(event) {
  dragPointerY = event.clientY
}

function dragScrollLoop() {
  const viewportH = window.innerHeight
  let dy = 0
  if (dragPointerY < DRAG_EDGE_PX) {
    // Closer to the edge → faster scroll, smooth ramp 0→max
    const factor = (DRAG_EDGE_PX - dragPointerY) / DRAG_EDGE_PX
    dy = -DRAG_MAX_SPEED * Math.max(0, Math.min(1, factor))
  } else if (dragPointerY > viewportH - DRAG_EDGE_PX) {
    const factor = (dragPointerY - (viewportH - DRAG_EDGE_PX)) / DRAG_EDGE_PX
    dy = DRAG_MAX_SPEED * Math.max(0, Math.min(1, factor))
  }
  if (dy !== 0) {
    window.scrollBy(0, dy)
  }
  dragScrollRAF = requestAnimationFrame(dragScrollLoop)
}

function onSectionDragStart(event) {
  // Seed pointer position with the start event so the loop has a value
  // before the first pointermove fires.
  if (event?.originalEvent) {
    dragPointerY = event.originalEvent.clientY ?? 0
  }
  document.addEventListener('pointermove', onDragPointerMove, { passive: true })
  document.addEventListener('dragover', onDragPointerMove, { passive: true })
  if (dragScrollRAF) cancelAnimationFrame(dragScrollRAF)
  dragScrollRAF = requestAnimationFrame(dragScrollLoop)
}

function onSectionDragEnd(event) {
  document.removeEventListener('pointermove', onDragPointerMove)
  document.removeEventListener('dragover', onDragPointerMove)
  if (dragScrollRAF) {
    cancelAnimationFrame(dragScrollRAF)
    dragScrollRAF = null
  }
  onDragEnd(event)
}

// Toggle section visibility
function toggleSectionVisibility(sectionId) {
  const section = dashboardLayout.value.find(s => s.id === sectionId)
  if (section) {
    section.visible = !section.visible
  }
}

// Reset dashboard layout to defaults
async function resetDashboardLayout() {
  dashboardLayout.value = JSON.parse(JSON.stringify(defaultDashboardLayout))
  await saveDashboardLayout()
}

// Save dashboard layout
async function saveDashboardLayout() {
  try {
    const layoutToSave = JSON.parse(JSON.stringify(dashboardLayout.value))
    const response = await api.put('/settings', {
      dashboardLayout: layoutToSave
    })
    if (response.data?.settings) {
      userSettings.value = response.data.settings
    }
  } catch (error) {
    console.error('[DASHBOARD] Failed to save layout:', error)
  }
}

// Load dashboard layout from user settings.
// Migration behavior: new sections are appended at the end with their
// defaultVisible from the registry. When a redesigned combined section is
// appended (it wasn't in the user's saved layout), the legacy sections it
// replaces are auto-hidden in the user's layout so they don't see duplicate
// data. The user can still re-enable any legacy section via Customize.
//
// Replacement map: when this NEW section is visible, hide these LEGACY
// sections in the layout to avoid duplicate data.
//   - hero-metrics ribbon shows Net P&L / Win Rate / Profit Factor / Streak,
//     fully replacing the old "Key Metrics" 4-card grid.
//   - recent-trades-and-distribution embeds Win Rate gauge with avg win,
//     avg loss, best, worst, expectancy — replacing both the old doughnut
//     and the "Additional Metrics" (Avg Win / Avg Loss / Best / Worst) row.
const SECTION_REPLACES = {
  'hero-metrics': ['key-metrics'],
  'recent-trades-and-distribution': ['charts', 'recent-trades', 'additional-metrics']
}

// Inverse lookup for the customize picker: which current section supersedes
// this legacy one (null for non-legacy sections).
function legacyReplacementHint(sectionId) {
  for (const [replacementId, legacyIds] of Object.entries(SECTION_REPLACES)) {
    if (legacyIds.includes(sectionId)) {
      return getSectionDefinition(replacementId)?.title || replacementId
    }
  }
  return null
}

// Legacy sections that have moved OUT of the draggable dashboard entirely.
// News + Earnings now render in a sticky right rail. These sections should
// always be hidden so users don't see duplicate Pro news/earnings blocks.
const ALWAYS_HIDE_SECTIONS = ['upcoming-earnings', 'trade-news']

function loadDashboardLayout() {
  if (userSettings.value?.dashboardLayout && Array.isArray(userSettings.value.dashboardLayout)) {
    const savedLayout = userSettings.value.dashboardLayout
    const normalizedById = new Map(
      defaultDashboardLayout.map(section => [section.id, { ...section }])
    )
    const normalizedLayout = []

    for (const savedSection of savedLayout) {
      const savedId = typeof savedSection === 'string' ? savedSection : savedSection?.id
      const defaultSection = normalizedById.get(savedId)

      if (!defaultSection) {
        continue
      }

      const visible = typeof savedSection === 'object' && savedSection && typeof savedSection.visible === 'boolean'
        ? savedSection.visible
        : true

      normalizedLayout.push({
        ...defaultSection,
        ...(typeof savedSection === 'object' && savedSection ? savedSection : {}),
        id: savedId,
        visible
      })

      normalizedById.delete(savedId)
    }

    // Hide legacy sections whenever their canonical replacement is also
    // visible. This handles both first-time migration AND users who landed
    // in a duplicate state from earlier iterations of the redesign.
    // If a user genuinely wants the legacy section back, they can re-enable
    // it via Customize and it stays enabled as long as the replacement
    // isn't also enabled at the same time.
    const newSectionVisible = id => {
      const inSaved = normalizedLayout.find(s => s.id === id)
      if (inSaved) return !!inSaved.visible
      // Not yet in saved layout — being appended now. Use its default.
      const def = normalizedById.get(id)
      return !!def && def.visible !== false
    }
    const legacyToHide = new Set(ALWAYS_HIDE_SECTIONS)
    for (const newId of Object.keys(SECTION_REPLACES)) {
      if (newSectionVisible(newId)) {
        for (const legacyId of SECTION_REPLACES[newId]) {
          legacyToHide.add(legacyId)
        }
      }
    }
    if (legacyToHide.size > 0) {
      for (const section of normalizedLayout) {
        if (legacyToHide.has(section.id) && section.visible) {
          section.visible = false
        }
      }
    }

    // Append new sections at the end using their registry defaults.
    const appendedNew = Array.from(normalizedById.values())

    dashboardLayout.value = [
      ...normalizedLayout,
      ...appendedNew
    ]
  }
}

// Save layout when dashboard layout changes (with debounce)
let saveLayoutTimeout = null
let isInitialLoad = true
watch(dashboardLayout, () => {
  // Don't save during initial load
  if (isInitialLoad) {
    return
  }
  
  if (saveLayoutTimeout) clearTimeout(saveLayoutTimeout)
  saveLayoutTimeout = setTimeout(() => {
    saveDashboardLayout()
  }, 1000) // Save 1 second after user stops making changes
}, { deep: true })

// Stable symbol list - only updates the ref when symbols actually change.
// This prevents child components (UpcomingEarnings, TradeNews) from re-fetching
// on every auto-update cycle when open positions refresh but symbols stay the same.
const openTradeSymbols = ref([])
watch(
  [openTrades, selectedAccount],
  () => {
    const filteredPositions = selectedAccount.value
      ? openTrades.value.filter(position => {
          return position.trades && position.trades.some(trade =>
            trade.account_identifier === selectedAccount.value
          )
        })
      : openTrades.value

    const symbols = [...new Set(filteredPositions.map(position => position.symbol))].sort()
    const newKey = symbols.join(',')
    const oldKey = openTradeSymbols.value.slice().sort().join(',')
    if (newKey !== oldKey) {
      openTradeSymbols.value = symbols
    }
  },
  { immediate: true }
)

const totalOpenCost = computed(() => {
  return openTrades.value.reduce((sum, position) => sum + (position.totalCost || 0), 0)
})

const totalUnrealizedPnL = computed(() => {
  let total = 0
  let hasAny = false
  openTrades.value.forEach(position => {
    if (position.requires_manual_price) {
      const optPnL = getOptionPnL(position)
      if (optPnL.unrealizedPnL !== null) {
        total += optPnL.unrealizedPnL
        hasAny = true
      }
    } else if (position.unrealizedPnL !== null) {
      total += position.unrealizedPnL
      hasAny = true
    }
  })
  return hasAny ? total : null
})

const totalCurrentValue = computed(() => {
  let total = 0
  let hasAny = false
  openTrades.value.forEach(position => {
    if (position.requires_manual_price) {
      const optPnL = getOptionPnL(position)
      if (optPnL.currentValue !== null) {
        total += optPnL.currentValue
        hasAny = true
      }
    } else if (position.currentValue !== null) {
      total += position.currentValue
      hasAny = true
    }
  })
  return hasAny ? total : null
})

const totalUnrealizedPnLPercent = computed(() => {
  if (totalUnrealizedPnL.value === null || totalOpenCost.value === 0) return 0
  return (totalUnrealizedPnL.value / totalOpenCost.value) * 100
})

const computedWinRate = computed(() => {
  const summary = analytics.value?.summary
  if (!summary) return '0'
  const wins = parseInt(summary.winningTrades) || 0
  const losses = parseInt(summary.losingTrades) || 0
  const be = parseInt(summary.breakevenTrades) || 0
  const total = wins + losses + be
  if (total === 0) return '0'
  return ((wins / total) * 100).toFixed(1)
})

const topTradesNetPnl = computed(() => {
  const bestTotal = (analytics.value?.topTrades?.best || []).reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0)
  const worstTotal = (analytics.value?.topTrades?.worst || []).reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0)
  return bestTotal + worstTotal
})

const dashboardNetPnl = computed(() => parseFloat(analytics.value?.summary?.totalNetPnL ?? analytics.value?.summary?.totalPnL ?? 0) || 0)
const dashboardGrossPnl = computed(() => parseFloat(analytics.value?.summary?.totalGrossPnl ?? (dashboardNetPnl.value + (parseFloat(analytics.value?.summary?.totalCosts) || 0))) || 0)
const dashboardAvgNetPnl = computed(() => parseFloat(analytics.value?.summary?.avgNetPnL ?? analytics.value?.summary?.avgPnL ?? 0) || 0)
function formatNumber(num) {
  if (!num && num !== 0) return '0.00'
  return parseFloat(num).toFixed(2)
}

function formatPercent(num) {
  if (!num && num !== 0) return '0.0'
  return parseFloat(num).toFixed(1)
}

function formatDate(dateStr) {
  return formatTradeDate(dateStr, 'MMM dd')
}

function formatGroupStrategy(strategy) {
  if (!strategy) return ''
  return strategy.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatLastRefresh(timestamp) {
  if (!timestamp) return ''
  const now = new Date()
  const diff = Math.floor((now - timestamp) / 1000)
  
  if (diff < 60) {
    return `${diff}s ago`
  } else if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`
  } else {
    return formatTimeTz(timestamp)
  }
}

function getDateRange(range) {
  if (range === 'all') {
    return { startDate: undefined, endDate: undefined }
  }
  
  if (range === 'custom') {
    return {
      startDate: filters.value.startDate || undefined,
      endDate: filters.value.endDate || undefined
    }
  }
  
  // Handle dynamic month ranges (e.g., month_2026_2 = March 2026)
  const monthMatch = range.match(/^month_(\d{4})_(\d{1,2})$/)
  if (monthMatch) {
    const year = parseInt(monthMatch[1])
    const month = parseInt(monthMatch[2])
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    return {
      startDate: formatLocalDate(firstDay),
      endDate: formatLocalDate(lastDay)
    }
  }

  const now = new Date()
  const start = new Date()

  switch (range) {
    case '7d':
      start.setDate(now.getDate() - 7)
      break
    case '30d':
      start.setDate(now.getDate() - 30)
      break
    case '90d':
      start.setDate(now.getDate() - 90)
      break
    case '1y':
      start.setFullYear(now.getFullYear() - 1)
      break
    case 'ytd':
      start.setMonth(0, 1)
      break
    default:
      return { startDate: undefined, endDate: undefined }
  }

  // Use formatLocalDate to avoid timezone issues (e.g., 8PM CST showing as next day)
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(now)
  }
}

function getAnalyticsCacheKey() {
  const dateRange = getDateRange(filters.value.timeRange)
  // Stable serialisation of advanced filters: sort keys, drop nulls/empties.
  const advancedParts = Object.keys(appliedFilters.value || {})
    .filter(k => !ADVANCED_FILTER_IGNORE_KEYS.has(k))
    .filter(k => {
      const v = appliedFilters.value[k]
      if (v === null || v === undefined || v === '') return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    })
    .sort()
    .map(k => `${k}=${Array.isArray(appliedFilters.value[k]) ? appliedFilters.value[k].slice().sort().join(',') : appliedFilters.value[k]}`)
    .join('&')
  const parts = [
    dateRange.startDate || '',
    dateRange.endDate || '',
    selectedAccount.value || '',
    advancedParts
  ]
  return 'dashboard_analytics_' + parts.join('_')
}

function loadCachedAnalytics() {
  try {
    const key = getAnalyticsCacheKey()
    const stored = sessionStorage.getItem(key)
    if (stored) {
      const data = JSON.parse(stored)
      analytics.value = data
      analyticsLoading.value = false
      nextTick(() => createCharts())
      return true
    }
  } catch (e) {
    // sessionStorage read failed
  }
  return false
}

async function fetchAnalytics() {
  try {
    // Only show skeleton if we have no cached data to display
    if (!analytics.value?.summary?.totalTrades && analytics.value?.summary?.totalTrades !== 0) {
      analyticsLoading.value = true
    }

    const dateRange = getDateRange(filters.value.timeRange)
    const params = new URLSearchParams()

    // Only add parameters if they have values
    if (dateRange.startDate) params.append('startDate', dateRange.startDate)
    if (dateRange.endDate) params.append('endDate', dateRange.endDate)
    // Use global account filter
    if (selectedAccount.value) params.append('accounts', selectedAccount.value)
    // Advanced filters from the filter modal (tags, strategies, brokers, etc.)
    appendAdvancedFilterParams(params)

    const response = await api.get(`/trades/analytics?${params}`)
    analytics.value = response.data

    // Persist to sessionStorage for instant display on page reload
    try {
      const key = getAnalyticsCacheKey()
      sessionStorage.setItem(key, JSON.stringify(response.data))
    } catch (e) {
      // sessionStorage write failed (quota, private mode, etc.)
    }

    await nextTick()
    createCharts()
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
  } finally {
    analyticsLoading.value = false
  }
}

async function fetchOnboardingStatus() {
  try {
    const response = await api.get('/users/onboarding-status')
    onboardingStatus.value = response.data
  } catch (err) {
    console.warn('[Dashboard] Could not fetch onboarding status:', err?.message)
  }
}

async function checkSampleData() {
  try {
    const response = await api.get('/trades/sample-data/check')
    hasSampleData.value = response.data.has_sample_data
  } catch (err) {
    console.warn('[Dashboard] Could not check sample data:', err?.message)
  }
}

async function removeSampleData() {
  removingSampleData.value = true
  try {
    await api.delete('/trades/sample-data')
    hasSampleData.value = false
    // Refresh dashboard data
    fetchAnalytics()
    fetchOpenTrades()
  } catch (err) {
    console.error('[Dashboard] Failed to remove sample data:', err)
  } finally {
    removingSampleData.value = false
  }
}

async function fetchBillingAndSubscription() {
  try {
    const statusRes = await api.get('/billing/status')
    billingAvailable.value = statusRes.data?.data?.billing_available === true
    if (!billingAvailable.value) return
    const subRes = await api.get('/billing/subscription')
    subscription.value = subRes.data?.data ?? null
  } catch (err) {
    if (err.response?.status !== 400 && err.response?.data?.error !== 'billing_unavailable') {
      console.warn('[Dashboard] Could not fetch billing/subscription:', err?.message)
    }
  }
}

function getOpenPositionsCacheKey() {
  return 'dashboard_open_positions_' + (selectedAccount.value || 'all')
}

function loadCachedOpenPositions() {
  try {
    const key = getOpenPositionsCacheKey()
    const stored = sessionStorage.getItem(key)
    if (stored) {
      const data = JSON.parse(stored)
      openTrades.value = data
      quotesLoading.value = false
      console.log(`Restored ${data.length} cached open positions`)
      return true
    }
  } catch (e) {
    // sessionStorage read failed
  }
  return false
}

function cacheOpenPositions(positions) {
  try {
    const key = getOpenPositionsCacheKey()
    sessionStorage.setItem(key, JSON.stringify(positions))
  } catch (e) {
    // sessionStorage write failed (quota, private mode, etc.)
  }
}

function getOpenPositionKey(position) {
  // The backend stamps a stable position_key on every position; the composite
  // fallback only covers positions cached in sessionStorage before upgrade.
  if (position.position_key) return position.position_key
  if (position.instrumentType === 'option' && position.underlying_symbol && position.strike_price && position.expiration_date && position.option_type) {
    return [
      position.underlying_symbol,
      position.strike_price,
      String(position.expiration_date).slice(0, 10),
      position.option_type
    ].join('_')
  }
  return position.symbol
}

function formatOptionContract(position) {
  if (position.instrumentType !== 'option' || !position.strike_price || !position.option_type || !position.expiration_date) return ''
  const type = position.option_type === 'call' ? 'Call' : 'Put'
  return `${formatCurrency(position.strike_price)} ${type} exp ${formatTradeDate(position.expiration_date, 'MM/dd/yy')}`
}

function preserveExistingQuoteData(positions) {
  const existingByKey = new Map(openTrades.value.map(position => [getOpenPositionKey(position), position]))
  const quoteFields = [
    'currentPrice',
    'dayChange',
    'dayChangePercent',
    'high',
    'low',
    'open',
    'previousClose',
    'quoteSource',
    'bid',
    'ask',
    'quoteTime'
  ]

  return positions.map(position => {
    if (position.currentPrice !== null && position.currentPrice !== undefined) return position

    const existing = existingByKey.get(getOpenPositionKey(position))
    if (!existing || existing.currentPrice === null || existing.currentPrice === undefined) return position

    const merged = { ...position }
    quoteFields.forEach(field => {
      if (existing[field] !== undefined) merged[field] = existing[field]
    })

    const multiplier = merged.instrumentType === 'option'
      ? (merged.contractSize || 100)
      : merged.instrumentType === 'future'
        ? (merged.pointValue || 1)
        : 1
    merged.currentValue = merged.currentPrice * merged.totalQuantity * multiplier
    merged.unrealizedPnL = merged.side === 'short'
      ? merged.totalCost - merged.currentValue
      : merged.currentValue - merged.totalCost
    merged.unrealizedPnLPercent = merged.totalCost !== 0
      ? (merged.unrealizedPnL / merged.totalCost) * 100
      : 0

    return merged
  })
}

async function fetchOpenPositionsRequest({ skipQuotes = false } = {}) {
  const params = {}
  if (selectedAccount.value) {
    params.accounts = selectedAccount.value
  }
  if (skipQuotes) {
    params.skipQuotes = 'true'
  }

  return api.get('/trades/open-positions-quotes', { params })
}

function cleanupManualOptionPrices() {
  // Entries may be keyed by position key (current) or bare symbol (legacy).
  const validKeys = new Set()
  openTrades.value.filter(p => p.requires_manual_price).forEach(p => {
    validKeys.add(getOpenPositionKey(p))
    validKeys.add(p.symbol)
  })
  let cleaned = false
  Object.keys(manualOptionPrices.value).forEach(key => {
    if (!validKeys.has(key)) {
      delete manualOptionPrices.value[key]
      cleaned = true
    }
  })
  if (cleaned) saveManualOptionPrices()
}

async function fetchOpenTrades(options = {}) {
  const { fastFirst = true } = options
  const requestId = ++openPositionsRequestId
  quotesLoading.value = true
  let fastRequestSucceeded = false

  try {
    if (fastFirst) {
      try {
        const fastResponse = await fetchOpenPositionsRequest({ skipQuotes: true })
        if (requestId !== openPositionsRequestId) return

        const fastPositions = preserveExistingQuoteData(fastResponse.data.positions || [])
        openTrades.value = fastPositions
        cacheOpenPositions(openTrades.value)
        cleanupManualOptionPrices()
        fastRequestSucceeded = true
      } catch (fastError) {
        console.error('Failed to fetch open positions fast path:', fastError)
      }
    }

    const response = await fetchOpenPositionsRequest({ skipQuotes: false })
    if (requestId !== openPositionsRequestId) return

    if (response.data.error) {
      console.warn('Real-time quotes not available:', response.data.error)
    }

    openTrades.value = response.data.positions || []
    cacheOpenPositions(openTrades.value)
    cleanupManualOptionPrices()
  } catch (error) {
    console.error('Failed to fetch open trades:', error)
    // Keep existing positions on refresh failure - don't wipe what we have
  } finally {
    if (requestId === openPositionsRequestId) {
      quotesLoading.value = false
      if (!fastRequestSucceeded && openTrades.value.length === 0) {
        loadCachedOpenPositions()
      }
    }
  }
}

function createPnLChart() {
  console.log('Dashboard: Creating P&L chart...');
  if (pnlChartInstance) {
    pnlChartInstance.destroy();
  }

  const ctx = pnlChart.value.getContext('2d');
  const dailyData = analytics.value.dailyPnL || [];
  const pnlValues = dailyData.map(d => parseFloat(d.cumulative_pnl) || 0);

  const positiveColor = 'rgba(16, 185, 129, 1)'; // Solid green
  const negativeColor = 'rgba(239, 68, 68, 1)'; // Solid red
  const positiveFillColor = 'rgba(16, 185, 129, 0.2)'; // Lighter green fill
  const negativeFillColor = 'rgba(239, 68, 68, 0.2)'; // Lighter red fill

  try {
    pnlChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dailyData.map(d => formatTradeDate(d.trade_date, 'MMM dd')),
        datasets: [{
          label: 'Cumulative P&L',
          data: pnlValues,
          fill: {
            target: 'origin',
            above: positiveFillColor, 
            below: negativeFillColor
          },
          segment: {
            borderColor: ctx => {
              const y = ctx.p1.parsed.y;
              return y >= 0 ? positiveColor : negativeColor;
            },
          },
          tension: 0.1,
          pointBackgroundColor: 'orange',
          pointBorderColor: 'orange',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const clickedDate = dailyData[index].trade_date;
            navigateToTradesByDate(clickedDate);
          }
        },
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            },
            ticks: {
              callback: function(value) {
                return currencySymbol.value + value.toLocaleString();
              }
            }
          },
          x: {
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            }
          }
        }
      }
    });
    console.log('Dashboard: P&L chart created successfully');
  } catch (error) {
    console.error('Dashboard: Error creating P&L chart:', error);
  }
}

// Command-center equity curve, used by the new equity-and-calendar section.
// Separate from createPnLChart because it renders to a different canvas ref
// (equityCurveCanvas) and has a sparser, more command-center style.
function createEquityCurveChart() {
  if (equityCurveChartInstance) {
    equityCurveChartInstance.destroy()
  }
  if (!equityCurveCanvas.value) return

  const ctx = equityCurveCanvas.value.getContext('2d')
  const dailyData = analytics.value.dailyPnL || []
  if (dailyData.length === 0) return

  const pnlValues = dailyData.map(d => parseFloat(d.cumulative_pnl) || 0)
  const positiveColor = 'rgba(22, 163, 74, 1)'
  const negativeColor = 'rgba(220, 38, 38, 1)'
  const positiveFill = 'rgba(22, 163, 74, 0.12)'
  const negativeFill = 'rgba(220, 38, 38, 0.12)'

  try {
    equityCurveChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dailyData.map(d => formatTradeDate(d.trade_date, 'MMM dd')),
        datasets: [{
          label: 'Cumulative P&L',
          data: pnlValues,
          fill: {
            target: 'origin',
            above: positiveFill,
            below: negativeFill
          },
          segment: {
            borderColor: c => (c.p1.parsed.y >= 0 ? positiveColor : negativeColor)
          },
          borderWidth: 2,
          tension: 0.15,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#F0812A',
          pointHoverBorderColor: '#F0812A'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        onClick: (_event, elements) => {
          if (elements.length > 0) {
            navigateToTradesByDate(dailyData[elements[0].index].trade_date)
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#fff',
            bodyColor: '#e5e7eb',
            padding: 8,
            displayColors: false,
            callbacks: {
              label: ctx => `${currencySymbol.value}${Number(ctx.parsed.y).toLocaleString()}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: { color: 'rgba(156, 163, 175, 0.08)' },
            ticks: {
              font: { family: 'ui-monospace, SFMono-Regular, Menlo, monospace', size: 10 },
              callback: v => currencySymbol.value + Number(v).toLocaleString()
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { family: 'ui-monospace, SFMono-Regular, Menlo, monospace', size: 10 },
              maxRotation: 0,
              autoSkipPadding: 24
            }
          }
        }
      }
    })
  } catch (error) {
    console.error('[DASHBOARD] equity curve chart create failed:', error)
  }
}

function createDistributionChart() {
  if (distributionChartInstance) {
    distributionChartInstance.destroy()
  }

  const ctx = distributionChart.value.getContext('2d')
  const summary = analytics.value.summary
  const isDark = document.documentElement.classList.contains('dark')

  const wins = parseInt(summary.winningTrades) || 0
  const losses = parseInt(summary.losingTrades) || 0
  const breakeven = parseInt(summary.breakevenTrades) || 0

  distributionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses', 'Breakeven'],
      datasets: [{
        data: [wins, losses, breakeven],
        backgroundColor: ['#10b981', '#ef4444', '#9ca3af'],
        hoverBackgroundColor: ['#34d399', '#f87171', '#b0b5bf'],
        borderWidth: 0,
        hoverOffset: 6,
        spacing: 4,
        borderRadius: 20
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: '72%',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedSegment = ['profit', 'loss', 'breakeven'][index]
          navigateToTradesByPnLType(clickedSegment)
        }
      },
      animation: {
        animateRotate: true,
        duration: 800
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#374151' : '#1f2937',
          titleColor: '#f9fafb',
          bodyColor: '#d1d5db',
          borderColor: isDark ? '#4b5563' : '#374151',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          displayColors: true,
          boxPadding: 4,
          callbacks: {
            label: function(context) {
              const total = wins + losses + breakeven
              const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0
              return ` ${context.raw} trades (${pct}%)`
            }
          }
        }
      }
    }
  })
}

function createWinRateChart() {
  console.log('Dashboard: Creating win rate chart...')
  console.log('Dashboard: winRateChart.value exists:', !!winRateChart.value)
  console.log('Dashboard: dailyWinRate data:', analytics.value.dailyWinRate)
  
  if (winRateChartInstance) {
    winRateChartInstance.destroy()
  }
  
  const ctx = winRateChart.value.getContext('2d')
  const winRateData = analytics.value.dailyWinRate || []
  
  console.log('Dashboard: Processed winRateData for chart:', winRateData)
  
  // Color each bar by its win rate using four discrete bands:
  //   <40%      red    — meaningfully losing day
  //   40–50%    orange — slightly underwater
  //   50–60%    yellow — barely profitable
  //   ≥60%      green  — solid winning day
  const barColorPair = pct => {
    const v = parseFloat(pct) || 0
    if (v >= 60) return { fill: 'rgba(22, 163, 74, 0.7)',  border: '#16a34a' }  // green-600
    if (v >= 50) return { fill: 'rgba(234, 179, 8, 0.7)',  border: '#eab308' }  // yellow-500
    if (v >= 40) return { fill: 'rgba(240, 129, 42, 0.7)', border: '#F0812A' }  // primary orange
    return         { fill: 'rgba(220, 38, 38, 0.7)',  border: '#dc2626' }       // red-600
  }
  const winRateColors = winRateData.map(d => barColorPair(d.win_rate))

  // Cap P/L ratio display at 5.0 so a single outsized day doesn't squash
  // the rest of the scale. Tooltips still show the true value.
  const PL_DISPLAY_CAP = 5
  const rawPlRatios = winRateData.map(d => parseFloat(d.pl_ratio) || 0)
  const cappedPlRatios = rawPlRatios.map(v => Math.min(v, PL_DISPLAY_CAP))

  winRateChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: winRateData.map(d => formatTradeDate(d.trade_date, 'MMM dd')),
      datasets: [
        {
          label: 'Win Rate (%)',
          data: winRateData.map(d => parseFloat(d.win_rate) || 0),
          backgroundColor: winRateColors.map(c => c.fill),
          borderColor: winRateColors.map(c => c.border),
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'P/L Ratio',
          data: cappedPlRatios,
          showLine: false,
          pointStyle: 'line',
          pointRadius: 8,
          pointHoverRadius: 10,
          pointBorderColor: '#3f3f46',  // zinc-700
          pointBorderWidth: 2,
          yAxisID: 'yPL'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedDate = winRateData[index].trade_date
          navigateToTradesByDate(clickedDate)
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.dataset.label === 'P/L Ratio') {
                const raw = rawPlRatios[context.dataIndex] || 0
                if (raw >= 999) return ' P/L Ratio: ∞ (no losses)'
                if (raw > PL_DISPLAY_CAP) return ` P/L Ratio: ${raw.toFixed(2)} (capped at ${PL_DISPLAY_CAP} on chart)`
                return ` P/L Ratio: ${raw.toFixed(2)}`
              }
              return ` Win Rate: ${(parseFloat(context.raw) || 0).toFixed(1)}%`
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          position: 'left',
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          },
          title: {
            display: true,
            text: 'Win Rate'
          }
        },
        yPL: {
          beginAtZero: true,
          max: PL_DISPLAY_CAP,
          position: 'right',
          grid: { display: false },
          ticks: {
            callback: function(value) {
              return value === PL_DISPLAY_CAP ? `${value}+` : value
            }
          },
          title: {
            display: true,
            text: 'P/L Ratio'
          }
        },
        x: {
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          }
        }
      }
    }
  })
}

function createCharts() {
  console.log('Dashboard: createCharts called')
  console.log('Dashboard: pnlChart.value exists:', !!pnlChart.value)
  console.log('Dashboard: distributionChart.value exists:', !!distributionChart.value)
  console.log('Dashboard: winRateChart.value exists:', !!winRateChart.value)
  console.log('Dashboard: analytics.value exists:', !!analytics.value)
  console.log('Dashboard: Chart.js imported:', typeof Chart)

  // Create each chart independently based on whether its canvas ref exists
  // This allows charts to render even if some layout sections are hidden
  if (pnlChart.value) {
    createPnLChart()
  }
  if (equityCurveCanvas.value) {
    createEquityCurveChart()
  }
  if (distributionChart.value) {
    createDistributionChart()
  }
  if (winRateChart.value) {
    createWinRateChart()
  }

  // Log if any charts couldn't be created due to missing refs
  if (!pnlChart.value || !distributionChart.value || !winRateChart.value) {
    console.log('Dashboard: Some charts not created - canvas refs:', {
      pnlChart: !!pnlChart.value,
      distributionChart: !!distributionChart.value,
      winRateChart: !!winRateChart.value
    })
  }
}

// Save filters to localStorage immediately when they change
function saveFiltersToStorage() {
  try {
    localStorage.setItem('dashboardTimeRange', filters.value.timeRange)
    uiPreferencesStore.notifyChanged('dashboardTimeRange', filters.value.timeRange)
    if (filters.value.timeRange === 'custom') {
      localStorage.setItem('dashboardCustomStartDate', filters.value.startDate || '')
      localStorage.setItem('dashboardCustomEndDate', filters.value.endDate || '')
      uiPreferencesStore.notifyChanged('dashboardCustomStartDate', filters.value.startDate || '')
      uiPreferencesStore.notifyChanged('dashboardCustomEndDate', filters.value.endDate || '')
    } else {
      // Clear custom dates when not in custom mode
      localStorage.removeItem('dashboardCustomStartDate')
      localStorage.removeItem('dashboardCustomEndDate')
      uiPreferencesStore.notifyChanged('dashboardCustomStartDate', null)
      uiPreferencesStore.notifyChanged('dashboardCustomEndDate', null)
    }
  } catch (e) {
    // localStorage save failed
    console.error('Failed to save filters to localStorage:', e)
  }
}

function applyFilters() {
  saveFiltersToStorage()
  fetchAnalytics()
  fetchOpenTrades()
  fetchAiInsight()
  fetchRecentTrades()
  fetchBehavioralSummary()
}

function navigateToTradesWithSymbol(symbol) {
  router.push({
    name: 'trades',
    query: { symbol }
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTrade(tradeId) {
  console.log('navigateToTrade called with:', tradeId)
  if (!tradeId) {
    console.error('Trade ID is missing! Cannot navigate.')
    alert('This trade cannot be opened - ID is missing. The backend needs to be updated.')
    return
  }
  router.push({
    name: 'trade-detail',
    params: { id: tradeId }
  })
}

function navigateToAnalytics(section) {
  router.push({
    name: 'analytics',
    hash: section ? `#${section}` : ''
  })
}

function navigateToOpenTrades() {
  router.push({
    name: 'trades',
    query: { status: 'open' }
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesBySymbolAndDate(symbol, tradeDate) {
  console.log('Navigating to trades for:', symbol, tradeDate)
  const date = new Date(tradeDate)
  const formattedDate = date.toISOString().split('T')[0]
  
  router.push({
    name: 'trades',
    query: { 
      symbol: symbol,
      startDate: formattedDate,
      endDate: formattedDate
    }
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesFiltered(type) {
  console.log('Navigating to trades filtered by:', type)
  const queryParams = {}
  
  if (type === 'best' && analytics.value.bestTradeDetails) {
    // Filter to show trades for the specific symbol and date of the best trade
    const bestTrade = analytics.value.bestTradeDetails
    queryParams.symbol = bestTrade.symbol
    const date = new Date(bestTrade.trade_date)
    const formattedDate = date.toISOString().split('T')[0]
    queryParams.startDate = formattedDate
    queryParams.endDate = formattedDate
  } else if (type === 'worst' && analytics.value.worstTradeDetails) {
    // Filter to show trades for the specific symbol and date of the worst trade
    const worstTrade = analytics.value.worstTradeDetails
    queryParams.symbol = worstTrade.symbol
    const date = new Date(worstTrade.trade_date)
    const formattedDate = date.toISOString().split('T')[0]
    queryParams.startDate = formattedDate
    queryParams.endDate = formattedDate
  } else if (type === 'avgWin') {
    // Filter to show only profitable trades
    queryParams.pnlType = 'profit'
  } else if (type === 'avgLoss') {
    // Filter to show only losing trades
    queryParams.pnlType = 'loss'
  } else {
    // Fallback to general filtering if trade details aren't available
    if (type === 'best') {
      queryParams.pnlType = 'profit'
    } else if (type === 'worst') {
      queryParams.pnlType = 'loss'
    }
  }
  
  router.push({
    name: 'trades',
    query: queryParams
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

// Chart navigation functions
function navigateToTradesByDate(date) {
  router.push({
    name: 'trades',
    query: {
      startDate: date,
      endDate: date
    }
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByPnLType(type) {
  let pnlType = ''
  if (type === 'profit') {
    pnlType = 'profit'
  } else if (type === 'loss') {
    pnlType = 'loss'
  }
  // For breakeven, we don't have a specific filter, so show all trades
  
  const query = {}
  if (pnlType) {
    query.pnlType = pnlType
  }
  
  router.push({
    name: 'trades',
    query
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

// Watch for when loading finishes to try creating charts
watch(loading, (newLoading) => {
  if (!newLoading && analytics.value.dailyPnL?.length > 0) {
    console.log('Dashboard: Loading finished, attempting to create charts')
    setTimeout(() => {
      createCharts()
    }, 200)
  }
})

// Watch for changes to timeRange and save immediately
watch(() => filters.value.timeRange, (newRange) => {
  saveFiltersToStorage()
  // If switching to custom, restore saved dates if available
  if (newRange === 'custom') {
    try {
      const savedStartDate = localStorage.getItem('dashboardCustomStartDate')
      const savedEndDate = localStorage.getItem('dashboardCustomEndDate')
      if (savedStartDate && !filters.value.startDate) {
        filters.value.startDate = savedStartDate
      }
      if (savedEndDate && !filters.value.endDate) {
        filters.value.endDate = savedEndDate
      }
    } catch (e) {
      console.error('Failed to restore custom dates:', e)
    }
  }
})

// Watch for changes to custom dates and save immediately
watch(() => filters.value.startDate, (newDate) => {
  if (filters.value.timeRange === 'custom') {
    saveFiltersToStorage()
  }
})

watch(() => filters.value.endDate, (newDate) => {
  if (filters.value.timeRange === 'custom') {
    saveFiltersToStorage()
  }
})

// Watch for global account filter changes
watch(selectedAccount, () => {
  console.log('Dashboard: Global account filter changed to:', selectedAccount.value || 'All Accounts')
  fetchAnalytics()
  fetchOpenTrades()
  fetchAiInsight()
  fetchRecentTrades()
  fetchBehavioralSummary()
})

async function fetchUserSettings() {
  try {
    const response = await api.get('/settings')
    userSettings.value = response.data.settings
    
    // Load dashboard layout if saved (disable watch during load)
    isInitialLoad = true
    loadDashboardLayout()
    // Re-enable watch after a brief delay to ensure load is complete
    await nextTick()
    setTimeout(() => {
      isInitialLoad = false
    }, 100)
  } catch (error) {
    console.error('Failed to load user settings:', error)
    // Default to average if loading fails
    userSettings.value = { statisticsCalculation: 'average' }
    isInitialLoad = false
  }
}

// Update market status
function updateMarketStatus() {
  const status = getMarketStatus()
  marketStatus.value = {
    isOpen: status.isOpen || status.isRegularHours,
    status: status.marketPhase || status.reason || status.status || 'Market Closed'
  }
}

// Start countdown timer
function startCountdown(intervalMs) {
  clearInterval(countdownInterval)
  nextRefreshIn.value = Math.floor(intervalMs / 1000)
  
  countdownInterval = setInterval(() => {
    nextRefreshIn.value--
    if (nextRefreshIn.value <= 0) {
      nextRefreshIn.value = Math.floor(intervalMs / 1000)
    }
  }, 1000)
}

// Auto-update functionality
function startAutoUpdate() {
  console.log('Dashboard: Starting auto-update check...')
  clearInterval(updateInterval)
  clearInterval(countdownInterval)
  
  updateMarketStatus()
  
  const refreshInterval = getRefreshInterval()
  console.log('Dashboard: Refresh interval from market hours:', refreshInterval)
  
  if (refreshInterval && shouldRefreshPrices()) {
    console.log(`Dashboard: Setting up auto-update every ${refreshInterval/1000} seconds during market hours`)
    isAutoUpdating.value = true
    
    // Start countdown
    startCountdown(refreshInterval)
    
    updateInterval = setInterval(async () => {
      console.log('Dashboard: Auto-updating open positions and news...')
      try {
        // Only refresh open positions during market hours for price updates
        await fetchOpenTrades({ fastFirst: false })
        lastRefresh.value = new Date()
        console.log('Dashboard: Auto-update completed successfully')
      } catch (error) {
        console.error('Dashboard: Auto-update failed:', error)
      }
    }, refreshInterval)
  } else {
    console.log('Dashboard: No auto-update needed - market is closed')
    isAutoUpdating.value = false
  }
}

function stopAutoUpdate() {
  console.log('Dashboard: Stopping auto-update...')
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
  isAutoUpdating.value = false
  nextRefreshIn.value = 0
}

// Check market status periodically to start/stop updates as needed
function checkMarketStatus() {
  updateMarketStatus()

  const refreshInterval = getRefreshInterval()
  const shouldRefresh = shouldRefreshPrices()

  // If market status changed, restart auto-update
  if (shouldRefresh && !updateInterval) {
    console.log('Dashboard: Market opened - starting auto-updates')
    startAutoUpdate()
  } else if (!shouldRefresh && updateInterval) {
    console.log('Dashboard: Market closed - stopping auto-updates')
    stopAutoUpdate()
  }
}

// Fetch count of expired options and auto-close if setting is enabled
async function fetchExpiredOptionsCount() {
  try {
    // Check if user has auto-close enabled (respect user setting)
    const autoCloseEnabled = userSettings.value?.autoCloseExpiredOptions !== false

    if (!autoCloseEnabled) {
      console.log('[Dashboard] Auto-close expired options is disabled in user settings, skipping check')
      return
    }

    console.log('[Dashboard] Checking for expired options...')
    const response = await api.get('/trades/expired-options')
    console.log('[Dashboard] Expired options response:', response.data)

    const count = response.data.count || 0

    // If there are expired options, auto-close them immediately
    if (count > 0) {
      console.log(`[Dashboard] Found ${count} expired options, auto-closing...`)

      try {
        const closeResponse = await api.post('/trades/expired-options/auto-close', { dryRun: false })
        console.log('[Dashboard] Auto-close response:', closeResponse.data)

        // Show success notification
        showSuccessModal(
          'Expired Options Auto-Closed',
          `Automatically closed ${closeResponse.data.closedCount} expired option${closeResponse.data.closedCount !== 1 ? 's' : ''}. These have been marked as "auto-closed" with full loss calculated.`
        )

        // Refresh dashboard data
        await Promise.all([
          fetchAnalytics(),
          fetchOpenTrades()
        ])
      } catch (closeError) {
        console.error('[Dashboard] Error auto-closing expired options:', closeError)
        showCriticalError(
          'Auto-Close Failed',
          closeError.response?.data?.error || 'Failed to auto-close expired options'
        )
      }
    }

  } catch (error) {
    console.error('[Dashboard] Error fetching expired options:', error)
  }
}

let marketStatusChecker = null

function handleClickOutside(event) {
  if (showTimeRangeDropdown.value) {
    const target = event.target
    if (!target.closest('[data-dropdown="timeRange"]')) {
      showTimeRangeDropdown.value = false
    }
  }
}

function handleDashboardEscape(event) {
  if (event.key !== 'Escape') return
  if (isCustomizing.value) {
    isCustomizing.value = false
  } else if (showTimeRangeDropdown.value) {
    showTimeRangeDropdown.value = false
  }
}

onMounted(async () => {
  console.log('Dashboard: Component mounted')

  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleDashboardEscape)

  // Load manual option prices from localStorage
  loadManualOptionPrices()

  // Load saved time range from localStorage
  try {
    const savedTimeRange = localStorage.getItem('dashboardTimeRange')
    if (savedTimeRange) {
      filters.value.timeRange = savedTimeRange
      if (savedTimeRange === 'custom') {
        filters.value.startDate = localStorage.getItem('dashboardCustomStartDate') || ''
        filters.value.endDate = localStorage.getItem('dashboardCustomEndDate') || ''
      }
    }
  } catch (e) {
    // localStorage load failed
  }

  // Restore hero ribbon $/R display mode
  try {
    dashboardRMode.value = localStorage.getItem('dashboardRMode') === 'true'
  } catch (e) {
    // localStorage load failed
  }

  // Keep the dashboard and shared TradeFilters modal aligned with the
  // persisted trade filter state before any cached dashboard data is restored.
  hydrateSharedTradeFilters()

  // Try to restore cached data from sessionStorage for instant rendering
  const hasCachedAnalytics = loadCachedAnalytics()
  const hasCachedPositions = loadCachedOpenPositions()

  // Fetch settings (fast) - positions may already be restored from cache
  await fetchUserSettings()

  // Dashboard shell is ready - drop the full-page spinner
  initialLoading.value = false

  // Silently refresh all data in background
  fetchAnalytics()
  fetchOpenTrades()
  fetchExpiredOptionsCount()

  // New dashboard sections — fire-and-forget; cards show their own loading states.
  fetchAiInsight()
  fetchBehavioralSummary()
  fetchRecentTrades()

  // Check Year Wrapped banner status (non-blocking)
  yearWrappedStore.checkBannerStatus()

  // Onboarding status for first-value banner (non-blocking)
  fetchOnboardingStatus()

  // Check for sample data (non-blocking)
  checkSampleData()

  // Billing/subscription for trial countdown and post-trial banner (non-blocking)
  fetchBillingAndSubscription()

  // Set initial refresh timestamp
  lastRefresh.value = new Date()

  // Start auto-update functionality
  startAutoUpdate()

  // Check market status every minute to handle market open/close transitions
  marketStatusChecker = setInterval(checkMarketStatus, 60000) // Check every minute
})

onUnmounted(() => {
  console.log('Dashboard: Component unmounting - cleaning up all intervals...')

  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleDashboardEscape)

  // Stop auto-update (clears updateInterval and countdownInterval)
  stopAutoUpdate()

  // Clear market status checker
  if (marketStatusChecker) {
    clearInterval(marketStatusChecker)
    marketStatusChecker = null
  }

  // Defensive cleanup - ensure all intervals are cleared
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }

  console.log('Dashboard: All intervals cleared')
})
</script>
