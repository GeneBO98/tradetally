<template>
  <div class="home">
    <!-- ============================ HERO ============================ -->
    <section class="relative overflow-hidden bg-gray-950">
      <!-- Atmosphere: grid + radial orange glow -->
      <div class="hero-grid absolute inset-0 opacity-[0.18] pointer-events-none"></div>
      <div class="absolute -top-40 -right-40 h-[40rem] w-[40rem] rounded-full bg-primary-600/20 blur-[120px] pointer-events-none"></div>
      <div class="absolute -bottom-48 -left-40 h-[34rem] w-[34rem] rounded-full bg-primary-500/10 blur-[120px] pointer-events-none"></div>

      <div class="relative max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 lg:pt-24 pb-0">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          <!-- Left: copy -->
          <div class="lg:col-span-5">
            <h1 class="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight text-white text-balance">
              Your trading,<br />
              <span class="text-primary-400">in one command center.</span>
            </h1>
            <p class="mt-6 text-lg leading-relaxed text-gray-300 max-w-xl">
              Auto-sync your brokers, journal your setups, and let TradeTally surface the
              analytics &mdash; and the behavioral patterns &mdash; that actually move your P&amp;L.
              Free forever.
            </p>

            <div v-if="showRegisterButton" class="mt-8">
              <form @submit.prevent="handleQuickSignup" class="flex flex-col sm:flex-row gap-3 max-w-lg">
                <input
                  v-model="quickEmail"
                  type="email"
                  required
                  placeholder="Enter your email"
                  class="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button type="submit" class="btn-primary btn-glow text-lg px-8 py-3 whitespace-nowrap">
                  Get Started Free
                </button>
              </form>
            </div>
            <div class="mt-4">
              <router-link
                to="/public"
                class="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-gray-200 border border-white/15 rounded-lg hover:bg-white/5 hover:border-white/30 transition-colors"
              >
                Explore public trades
                <ChevronRightIcon class="h-4 w-4" />
              </router-link>
            </div>

            <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-gray-300">
              <span class="flex items-center gap-2">
                <CheckCircleIcon class="h-5 w-5 text-primary-400" /> Free forever
              </span>
              <span class="flex items-center gap-2">
                <CheckCircleIcon class="h-5 w-5 text-primary-400" /> No credit card
              </span>
              <span class="flex items-center gap-2">
                <CheckCircleIcon class="h-5 w-5 text-primary-400" /> Open source
              </span>
            </div>
          </div>

          <!-- Right: dashboard window -->
          <div class="lg:col-span-7">
            <div class="app-window app-window--floating">
              <div class="app-window__bar">
                <span class="app-window__dot"></span>
                <span class="app-window__dot"></span>
                <span class="app-window__dot"></span>
                <span class="app-window__title">app.tradetally.io/dashboard</span>
              </div>
              <div class="aspect-[16/9] bg-white">
                <img
                  src="/images/screenshot-dashboard.webp"
                  alt="TradeTally command-center dashboard: net P&L, win rate, profit factor, streak, equity curve, and open positions"
                  class="h-full w-full object-cover object-top"
                  width="1920"
                  height="1080"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Stat ribbon (mirrors the dashboard hero ribbon) -->
        <div class="relative mt-10 sm:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <div v-for="stat in heroStats" :key="stat.label" class="bg-gray-950/40 px-5 py-5 sm:px-6 sm:py-6">
            <div class="text-xs font-medium uppercase tracking-widest text-gray-400">{{ stat.label }}</div>
            <div class="mt-1.5 text-2xl sm:text-3xl font-bold tabular-nums" :class="stat.class">{{ stat.value }}</div>
          </div>
        </div>
        <p class="relative mt-3 pb-16 text-center text-xs text-gray-500">
          Live metrics from a real TradeTally account.
        </p>
      </div>
    </section>

    <!-- ============================ BROKER MARQUEE ============================ -->
    <section class="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700/50 py-6 overflow-hidden">
      <p class="text-center text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-5">
        Auto-syncs and imports from your broker
      </p>
      <div class="marquee relative">
        <div class="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent z-10 pointer-events-none"></div>
        <div class="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent z-10 pointer-events-none"></div>
        <div class="marquee-inner">
          <div class="marquee-set" v-for="n in 3" :key="n" :aria-hidden="n > 1 || undefined">
            <div v-for="broker in brokers" :key="broker.name + '-' + n" class="marquee-item">
              <img
                v-if="broker.logo"
                :src="broker.logo"
                :alt="broker.name"
                class="h-7 w-auto opacity-70 dark:invert"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ BROKER SYNC ============================ -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-20 sm:py-28">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div class="order-2 lg:order-1 lg:col-span-5">
            <span class="eyebrow">Import &amp; Sync</span>
            <h2 class="section-title">Connected in 60 seconds</h2>
            <p class="section-lead">
              Connect Interactive Brokers, Charles Schwab, TradeStation, or Alpaca and your
              executions flow in automatically &mdash; or import a CSV from any broker. No manual entry, ever.
            </p>
            <ul class="mt-8 space-y-4">
              <li class="feature-li">
                <BoltIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Direct OAuth sync</strong> with Schwab, IBKR, TradeStation, and Alpaca &mdash; new in 2.7.</span>
              </li>
              <li class="feature-li">
                <DocumentTextIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">CSV import</strong> from Lightspeed, Webull, TradingView, Tastytrade, Tradovate, Questrade, and more.</span>
              </li>
              <li class="feature-li">
                <CpuChipIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Custom column mapping</strong> turns any broker export into a reusable import template.</span>
              </li>
            </ul>
          </div>
          <div class="order-1 lg:order-2 lg:col-span-7" data-parallax>
            <div class="app-window">
              <div class="app-window__bar">
                <span class="app-window__dot"></span><span class="app-window__dot"></span><span class="app-window__dot"></span>
              </div>
              <div class="aspect-[1221/645] bg-white">
                <img src="/images/screenshot-broker-sync.webp" alt="TradeTally broker sync: connect Interactive Brokers, Charles Schwab, TradeStation, and Alpaca via OAuth" class="h-full w-full object-cover object-top" loading="lazy" width="1221" height="645" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ ANALYTICS ============================ -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-20 sm:py-28 border-y border-gray-200 dark:border-gray-700/50">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div class="lg:col-span-7" data-parallax>
            <div class="app-window">
              <div class="app-window__bar">
                <span class="app-window__dot"></span><span class="app-window__dot"></span><span class="app-window__dot"></span>
              </div>
              <div class="aspect-[1189/641] bg-white">
                <img src="/images/screenshot-analytics.webp" alt="TradeTally MAE/MFE analysis showing average heat on winners, exit efficiency, and missed profit after exit" class="h-full w-full object-cover object-top" loading="lazy" width="1189" height="641" />
              </div>
            </div>
          </div>
          <div class="lg:col-span-5">
            <span class="eyebrow">Analytics</span>
            <h2 class="section-title">Numbers that tell you the truth</h2>
            <p class="section-lead">
              A single canonical P&amp;L engine powers every view, so Calendar, Trade Detail, and
              your totals always agree. Then 2.7 goes deeper than win rate.
            </p>
            <ul class="mt-8 space-y-4">
              <li class="feature-li">
                <ScaleIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Breakeven-aware win rates</strong> &mdash; scratched trades stop counting as fee-driven losses, shown including and excluding breakeven everywhere.</span>
              </li>
              <li class="feature-li">
                <ArrowTrendingUpIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">MAE / MFE excursion charts</strong> reveal how much heat you take and how much you leave on the table &mdash; with a futures points mode.</span>
              </li>
              <li class="feature-li">
                <PresentationChartLineIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Performance tabs</strong> break results down by time, symbol, strategy, and trade size.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ BEHAVIORAL CAROUSEL ============================ -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-20 sm:py-28">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <span class="eyebrow eyebrow--center">Behavioral Analytics</span>
          <h2 class="section-title section-title--center">Your trading psychology, quantified</h2>
          <p class="section-lead section-lead--center mx-auto">
            Six analytical lenses that surface the behavioral patterns most traders never see.
          </p>
        </div>

        <div class="relative">
          <transition name="carousel-fade" mode="out-in">
            <div :key="carouselSlide" class="text-center mb-8">
              <div class="inline-flex items-center gap-2 rounded-full bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary-700 dark:text-primary-300">
                {{ carouselSlides[carouselSlide].badge }}
              </div>
              <h3 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
                {{ carouselSlides[carouselSlide].title }}
              </h3>
              <p class="mt-3 max-w-2xl mx-auto text-lg text-gray-500 dark:text-gray-400">
                {{ carouselSlides[carouselSlide].description }}
              </p>
            </div>
          </transition>

          <div class="app-window mx-auto max-w-5xl">
            <div class="app-window__bar">
              <span class="app-window__dot"></span><span class="app-window__dot"></span><span class="app-window__dot"></span>
            </div>
            <div class="carousel-image-container bg-white dark:bg-gray-900">
              <transition name="carousel-fade" mode="out-in">
                <img
                  :key="'img-' + carouselSlide"
                  :src="carouselSlides[carouselSlide].image"
                  :alt="carouselSlides[carouselSlide].title"
                  class="max-h-full w-auto max-w-full mx-auto rounded-b-lg"
                  loading="lazy"
                />
              </transition>
            </div>
          </div>

          <button
            @click="goToCarouselSlide((carouselSlide - 1 + carouselSlides.length) % carouselSlides.length)"
            aria-label="Previous"
            class="absolute left-2 sm:left-0 sm:-translate-x-5 bottom-16 sm:bottom-1/2 p-2 rounded-full bg-white/90 dark:bg-gray-700/90 shadow-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors z-10"
          >
            <ChevronLeftIcon class="h-5 w-5" />
          </button>
          <button
            @click="goToCarouselSlide((carouselSlide + 1) % carouselSlides.length)"
            aria-label="Next"
            class="absolute right-2 sm:right-0 sm:translate-x-5 bottom-16 sm:bottom-1/2 p-2 rounded-full bg-white/90 dark:bg-gray-700/90 shadow-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors z-10"
          >
            <ChevronRightIcon class="h-5 w-5" />
          </button>

          <div class="flex justify-center gap-2 mt-8">
            <button
              v-for="(slide, index) in carouselSlides"
              :key="index"
              @click="goToCarouselSlide(index)"
              :aria-label="'Slide ' + (index + 1)"
              class="h-2.5 rounded-full transition-all duration-300"
              :class="carouselSlide === index ? 'w-8 bg-primary-600' : 'w-2.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ INVESTMENTS / PORTFOLIO ============================ -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-20 sm:py-28 border-y border-gray-200 dark:border-gray-700/50">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div class="order-2 lg:order-1 lg:col-span-5">
            <span class="eyebrow">Investing</span>
            <h2 class="section-title">Your whole portfolio, not just your trades</h2>
            <p class="section-lead">
              TradeTally tracks holdings and long-term performance alongside your active trading
              &mdash; benchmarked, rebalanced, and funded automatically.
            </p>
            <ul class="mt-8 space-y-4">
              <li class="feature-li">
                <ArrowsRightLeftIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Account comparison</strong> puts every account side by side with deltas vs the leader and a benchmark overlay.</span>
              </li>
              <li class="feature-li">
                <BuildingLibraryIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Plaid funding sync</strong> pulls bank and brokerage transfers into a review queue with bulk approve and rules.</span>
              </li>
              <li class="feature-li">
                <ChartPieIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Rebalancing</strong> with an allocation editor, drift against targets, and a cash-to-buy / sell-proceeds impact summary.</span>
              </li>
            </ul>
          </div>
          <div class="order-1 lg:order-2 lg:col-span-7" data-parallax>
            <div class="app-window">
              <div class="app-window__bar">
                <span class="app-window__dot"></span><span class="app-window__dot"></span><span class="app-window__dot"></span>
              </div>
              <div class="aspect-[1345/1029] bg-white">
                <img src="/images/screenshot-investments.webp" alt="TradeTally portfolio comparison against a benchmark with account comparison and returns metrics" class="h-full w-full object-cover object-top" loading="lazy" width="1345" height="1029" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ JOURNAL ============================ -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-20 sm:py-28">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div class="lg:col-span-7" data-parallax>
            <div class="app-window">
              <div class="app-window__bar">
                <span class="app-window__dot"></span><span class="app-window__dot"></span><span class="app-window__dot"></span>
              </div>
              <div class="aspect-[1210/638] bg-white">
                <img src="/images/screenshot-journal.webp" alt="TradeTally journal: tag trades by setup and emotion and log daily market bias and key levels" class="h-full w-full object-cover object-top" loading="lazy" width="1210" height="638" />
              </div>
            </div>
          </div>
          <div class="lg:col-span-5">
            <span class="eyebrow">Journal</span>
            <h2 class="section-title">Tag, log, and connect the dots</h2>
            <p class="section-lead">
              Your journal entries become data points for behavioral analysis. Every tag, every
              note, every emotion &mdash; quantified and tied back to your P&amp;L.
            </p>
            <ul class="mt-8 space-y-4">
              <li class="feature-li">
                <TagIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Tag by setup, emotion, and strategy</strong> with editable colors and most-used ordering.</span>
              </li>
              <li class="feature-li">
                <DocumentTextIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Daily entries</strong> capture market bias, key levels, and your pre-market plan.</span>
              </li>
              <li class="feature-li">
                <LightBulbIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Playbooks</strong> match trades to your rules using dropdown pickers built from your own data.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ ALERTS & AUTOMATION ============================ -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-20 sm:py-28 border-y border-gray-200 dark:border-gray-700/50">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div class="order-2 lg:order-1 lg:col-span-5">
            <span class="eyebrow">Alerts &amp; Automation</span>
            <h2 class="section-title">Never miss a move</h2>
            <p class="section-lead">
              Set price alerts and route them wherever you work &mdash; then let TradeTally watch
              the market and the web for you.
            </p>
            <ul class="mt-8 space-y-4">
              <li class="feature-li">
                <BellAlertIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Webhook destinations</strong> deliver price alerts to Slack, Discord, or any custom endpoint.</span>
              </li>
              <li class="feature-li">
                <DevicePhoneMobileIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">iOS push notifications</strong> fire the moment an alert triggers.</span>
              </li>
              <li class="feature-li">
                <GlobeAltIcon class="feature-li__icon" />
                <span><strong class="feature-li__strong">Web mentions (beta)</strong> monitor the web for chatter about the symbols you hold.</span>
              </li>
            </ul>
          </div>
          <div class="order-1 lg:order-2 lg:col-span-7" data-parallax>
            <div class="app-window">
              <div class="app-window__bar">
                <span class="app-window__dot"></span><span class="app-window__dot"></span><span class="app-window__dot"></span>
              </div>
              <div class="aspect-[1217/907] bg-white">
                <img src="/images/screenshot-alerts.webp" alt="TradeTally price alerts with Slack and Discord webhook destinations and per-symbol alert rules" class="h-full w-full object-cover object-top" loading="lazy" width="1217" height="907" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ PRO FEATURES ============================ -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-20 sm:py-28">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <span class="eyebrow eyebrow--center">
            <SparklesIcon class="h-4 w-4" /> Pro
          </span>
          <h2 class="section-title section-title--center">Find your edge faster</h2>
          <p class="section-lead section-lead--center mx-auto">
            Behavioral pattern detection, AI-driven insights, and deep research &mdash; layered on
            top of everything that's free.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          <div v-for="feature in proFeatures" :key="feature.title" class="pro-card">
            <div class="pro-card__icon">
              <component :is="feature.icon" class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{{ feature.title }}</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-300">{{ feature.description }}</p>
          </div>
        </div>

        <div class="mt-12 text-center">
          <router-link to="/pricing" class="btn-primary btn-glow inline-flex items-center text-lg px-8 py-3">
            View Pro Plans<template v-if="startingAtMonthlyLabel"> &mdash; {{ startingAtMonthlyLabel }}</template>
          </router-link>
          <p class="mt-4 text-gray-500 dark:text-gray-400 text-sm">
            14-day free trial. Cancel anytime.
          </p>
        </div>
      </div>
    </section>

    <!-- ============================ SEO: FREE TOOLS ============================ -->
    <section v-if="showSEOPages" data-reveal class="bg-white dark:bg-gray-800 py-16 sm:py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-10">
          <h2 class="section-title section-title--center">Free trader tools and calculators</h2>
          <p class="section-lead section-lead--center mx-auto">
            Free calculators for position sizing, risk/reward, expectancy, win rate, dollar-cost averaging, and historical investment returns. No signup required.
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <router-link to="/tools/position-size-calculator" class="tool-card">
            <h3 class="font-semibold text-gray-900 dark:text-white">Position Size Calculator</h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">How many shares to buy at any risk %.</p>
          </router-link>
          <router-link to="/tools/risk-reward-calculator" class="tool-card">
            <h3 class="font-semibold text-gray-900 dark:text-white">Risk/Reward Calculator</h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Find R:R ratio and breakeven win rate.</p>
          </router-link>
          <router-link to="/tools/trade-expectancy-calculator" class="tool-card">
            <h3 class="font-semibold text-gray-900 dark:text-white">Trade Expectancy Calculator</h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Expected dollar value of your edge.</p>
          </router-link>
          <router-link to="/tools/required-win-rate-calculator" class="tool-card">
            <h3 class="font-semibold text-gray-900 dark:text-white">Required Win Rate Calculator</h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Minimum win rate at any R:R.</p>
          </router-link>
          <router-link to="/tools/average-down-calculator" class="tool-card">
            <h3 class="font-semibold text-gray-900 dark:text-white">Average Down / DCA Calculator</h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Blended cost basis across multiple buys.</p>
          </router-link>
          <router-link to="/tools/what-if-i-invested" class="tool-card tool-card--popular relative">
            <span class="tool-card__badge">Popular</span>
            <h3 class="font-semibold text-gray-900 dark:text-white">What If I Invested?</h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Historical returns for any stock.</p>
          </router-link>
        </div>
        <div class="text-center mt-8">
          <router-link to="/tools" class="inline-flex items-center text-primary-600 dark:text-primary-400 font-semibold hover:underline">
            See all free tools
            <ChevronRightIcon class="ml-1 h-4 w-4" />
          </router-link>
        </div>
      </div>
    </section>

    <!-- ============================ SEO: TRADERVUE ALTERNATIVE ============================ -->
    <section v-if="showSEOPages" class="bg-gray-50 dark:bg-gray-900 py-16 border-t border-gray-200 dark:border-gray-700/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 class="section-title section-title--center">The modern alternative to TraderVue</h2>
          <p class="section-lead section-lead--center mx-auto">
            Looking for a TraderVue alternative? TradeTally offers all the trade journaling features you need with a modern interface,
            advanced analytics, and competitive pricing. Switch from TraderVue to TradeTally and experience the next generation of trade tracking.
          </p>
          <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto text-left">
            <div class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 class="heading-card">Unlimited Free Trading Journal</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">Unlike TraderVue's 100 trades/month limit, get unlimited trade storage completely free. No time limits, no hidden fees.</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 class="heading-card">Works With Your Broker</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">Auto-sync with Schwab, IBKR, TradeStation, and Alpaca, plus CSV import from Lightspeed, Webull, TradingView, and custom mapping for any broker.</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 class="heading-card">AI-Powered Analytics</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">Advanced trade analysis with AI insights, behavioral pattern detection, and professional performance metrics.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ SEO: ASSET CLASSES ============================ -->
    <section v-if="showSEOPages" class="bg-white dark:bg-gray-800 py-20 sm:py-24">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="section-title section-title--center">Every market you trade</h2>
          <p class="section-lead section-lead--center mx-auto">
            Track performance across every asset class &mdash; stocks, options, ETFs, crypto, forex, and futures.
          </p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-6xl mx-auto">
          <div v-for="a in assetClasses" :key="a.name" class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div class="p-2.5 inline-flex rounded-lg bg-primary-100 dark:bg-primary-900/30 mb-3">
              <component :is="a.icon" class="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ a.name }}</div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-snug">{{ a.description }}</div>
          </div>
        </div>

        <!-- SEO content: visually hidden, accessible to crawlers and screen readers -->
        <div class="sr-only">
          <h3>Supported Brokers and Platforms</h3>
          <p>
            TradeTally integrates with the leading retail brokerages. Charles Schwab, Interactive Brokers (IBKR), TradeStation,
            and Alpaca support automatic trade sync via API and OAuth, so your executions flow into your journal in real time
            without any manual entry. We also provide native CSV import for ThinkorSwim (TD Ameritrade), Lightspeed Trading,
            Webull, TradingView, Tastytrade, Tradovate, and Questrade. For any broker not listed, our custom CSV column mapper
            lets you build a reusable import template from any broker that offers trade history export.
          </p>

          <h3>Supported Asset Classes in Detail</h3>
          <ul>
            <li><strong>Stocks and equities:</strong> Day trading, swing trading, and long-term position trading across all US exchanges (NYSE, NASDAQ, AMEX), plus international equities.</li>
            <li><strong>Options:</strong> Calls, puts, vertical spreads, iron condors, covered calls, cash-secured puts, credit and debit spreads, diagonals, calendars, and multi-leg strategies.</li>
            <li><strong>ETFs:</strong> Index ETFs (SPY, QQQ, IWM, DIA), sector ETFs, leveraged ETFs (TQQQ, SQQQ, SOXL), inverse ETFs, and thematic ETFs.</li>
            <li><strong>Cryptocurrency:</strong> Bitcoin (BTC), Ethereum (ETH), Solana (SOL), and all major altcoins. Spot trading and perpetual futures.</li>
            <li><strong>Forex:</strong> Major pairs (EUR/USD, GBP/USD, USD/JPY), minor pairs, and exotic pairs with pip-level precision.</li>
            <li><strong>Futures:</strong> Equity index futures (ES, NQ, RTY, YM), energy (CL, NG), metals (GC, SI, HG), and micro futures (MES, MNQ, MGC, MCL).</li>
          </ul>

          <h3>Who Uses TradeTally</h3>
          <p>
            TradeTally is built for day traders, swing traders, position traders, options traders, futures traders, forex
            traders, and algorithmic traders who want a free trading journal with behavioral analytics. Whether you need a
            TraderVue alternative, a TraderSync alternative, or an Edgewonk alternative, TradeTally delivers unlimited trade
            storage, automated broker import, AI-powered insights, revenge trading detection, overconfidence analysis, loss
            aversion measurement, trading personality profiling, and a 0-100 behavioral risk score &mdash; all free forever,
            with an open source self-hosting option.
          </p>

          <h3>Popular Use Cases</h3>
          <ul>
            <li>Day trading journal with automatic broker sync and behavioral analytics</li>
            <li>Options trading journal with Greeks, expiration, and strategy tagging</li>
            <li>Futures trading journal for prop firm evaluations and funded accounts</li>
            <li>Swing trading journal with multi-day hold tracking and chart annotations</li>
            <li>Forex trading journal with pip tracking and session-based analytics</li>
            <li>Crypto trading journal for spot and perpetual futures across exchanges</li>
            <li>Prop firm trading journal for FTMO, Topstep, and Apex</li>
            <li>Free TraderVue alternative with unlimited trades and no monthly limit</li>
            <li>Self-hosted trading journal for privacy-conscious traders and teams</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ============================ WHY TRADETALLY ============================ -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700/50 py-14">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div v-for="why in whyTradeTally" :key="why.title" class="flex flex-col items-center text-center">
            <div class="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/30 mb-3">
              <component :is="why.icon" class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="text-base font-semibold text-gray-900 dark:text-white">{{ why.title }}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ why.sub }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ FINAL CTA ============================ -->
    <section data-reveal class="relative overflow-hidden bg-gray-950 py-20 sm:py-28">
      <div class="hero-grid absolute inset-0 opacity-[0.15] pointer-events-none"></div>
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary-900/30 via-transparent to-transparent pointer-events-none"></div>
      <div class="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight text-balance">
          See the patterns in your trading &mdash; and break them
        </h2>
        <p class="mt-5 max-w-2xl mx-auto text-lg text-gray-300">
          Sync your broker, tag your trades, and let TradeTally surface the behaviors costing you money.
        </p>

        <div class="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div class="cta-chip"><BoltIcon class="h-5 w-5 text-primary-400 flex-shrink-0" /><span>Sync in 60 seconds</span></div>
          <div class="cta-chip"><TagIcon class="h-5 w-5 text-primary-400 flex-shrink-0" /><span>Tag your trades</span></div>
          <div class="cta-chip"><PresentationChartLineIcon class="h-5 w-5 text-primary-400 flex-shrink-0" /><span>See your patterns</span></div>
        </div>

        <div v-if="showRegisterButton" class="mt-10">
          <form @submit.prevent="handleQuickSignupFooter" class="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <input
              v-model="footerEmail"
              type="email"
              required
              placeholder="Enter your email"
              class="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button type="submit" class="btn-primary btn-glow text-lg px-8 py-3 whitespace-nowrap">Get Started Free</button>
          </form>
          <p class="mt-4 text-sm text-gray-400">Free forever. No credit card required.</p>
        </div>
      </div>
    </section>

    <!-- ============================ MOBILE APP ============================ -->
    <section data-reveal class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700/50 py-12">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p class="text-sm font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">Now on iOS</p>
        <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Your journal, always with you</h3>
        <p class="mt-2 text-gray-500 dark:text-gray-400">Log trades, review your stats, and stay accountable from your phone.</p>
        <div class="mt-6">
          <a href="https://apps.apple.com/us/app/tradetally/id6748022992" target="_blank" rel="noopener noreferrer">
            <img src="/images/app-store-badge.svg" alt="Download TradeTally on the App Store" class="h-12 mx-auto hover:opacity-80 transition-opacity" />
          </a>
        </div>
        <p class="mt-5 text-sm text-gray-500 dark:text-gray-400">
          Follow product updates and trading journal tips on
          <a href="https://x.com/TradeTallyIO" target="_blank" rel="me noopener noreferrer" class="font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors">X @TradeTallyIO</a>
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  ChartBarIcon,
  DocumentTextIcon,
  SparklesIcon,
  CpuChipIcon,
  PresentationChartLineIcon,
  HeartIcon,
  CheckCircleIcon,
  TagIcon,
  LightBulbIcon,
  FingerPrintIcon,
  ExclamationTriangleIcon,
  FireIcon,
  ScaleIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BoltIcon,
  Squares2X2Icon,
  RectangleGroupIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  ArrowsRightLeftIcon,
  BuildingLibraryIcon,
  ChartPieIcon,
  BellAlertIcon,
  DevicePhoneMobileIcon,
  BeakerIcon
} from '@heroicons/vue/24/outline'
import { useRouter } from 'vue-router'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { usePricingExperiment } from '@/composables/usePricingExperiment'
import { useScrollReveal } from '@/composables/useScrollReveal'

useScrollReveal()
const router = useRouter()
const { showSEOPages, registrationConfig, fetchRegistrationConfig } = useRegistrationMode()
const { startingAtMonthlyLabel } = usePricingExperiment()
const showRegisterButton = computed(() => registrationConfig.value?.allowRegistration !== false)

const quickEmail = ref('')
const footerEmail = ref('')

function handleQuickSignup() {
  if (quickEmail.value) {
    router.push({ path: '/register', query: { email: quickEmail.value } })
  }
}

function handleQuickSignupFooter() {
  if (footerEmail.value) {
    router.push({ path: '/register', query: { email: footerEmail.value } })
  }
}

// Hero stat ribbon — mirrors the metrics shown in the dashboard screenshot
const heroStats = [
  { label: 'Net P&L', value: '+$3,623', class: 'text-emerald-400' },
  { label: 'Win Rate', value: '71.1%', class: 'text-white' },
  { label: 'Profit Factor', value: '3.42', class: 'text-white' },
  { label: 'Streak', value: '1W', class: 'text-primary-400' }
]

// Carousel state
const carouselSlide = ref(0)
let carouselTimer = null

const carouselSlides = [
  {
    badge: 'PERSONALITY',
    title: 'Trading Personality Profiling',
    description: 'Get classified as a Scalper, Momentum, Mean Reversion, or Swing trader with confidence scores based on your actual trade data. Understand your natural edge.',
    image: '/images/trading-personality.webp'
  },
  {
    badge: 'RISK',
    title: 'Risk Score & Behavioral Insights',
    description: 'A 0-100 risk score calculated from your trading behavior. See severity-colored breakdowns of position sizing, frequency, and emotional patterns.',
    image: '/images/risk-score.webp'
  },
  {
    badge: 'DETECTION',
    title: 'Revenge Trading Detection',
    description: 'Automatically flags when you take impulsive trades after a loss. See your revenge trading frequency, average loss, and which sessions trigger it.',
    image: '/images/revenge-trading.webp'
  },
  {
    badge: 'PSYCHOLOGY',
    title: 'Loss Aversion Analysis',
    description: 'Measures how exit timing shifts based on whether a trade is winning or losing. Detects if you cut winners early and let losers run.',
    image: '/images/loss-aversion.webp'
  },
  {
    badge: 'OPTIMIZATION',
    title: 'Missed Profit Opportunities',
    description: 'Identifies trades you exited too early by comparing your exit price to the subsequent price movement. Quantifies exactly how much was left on the table.',
    image: '/images/top-missed.webp'
  },
  {
    badge: 'PATTERNS',
    title: 'Overconfidence Indicators',
    description: 'Detects when win streaks lead to larger position sizes and riskier trades. Shows the correlation between consecutive wins and subsequent losses.',
    image: '/images/overconfidence.webp'
  }
]

function goToCarouselSlide(index) {
  carouselSlide.value = index
  resetCarouselTimer()
}

function resetCarouselTimer() {
  if (carouselTimer) clearInterval(carouselTimer)
  carouselTimer = setInterval(() => {
    carouselSlide.value = (carouselSlide.value + 1) % carouselSlides.length
  }, 10000)
}

const proFeatures = [
  { icon: PresentationChartLineIcon, title: 'Behavioral Analytics', description: 'Detect revenge trading, overconfidence, and loss aversion. Get a 0-100 risk score and personality profiling from your actual trades.' },
  { icon: CpuChipIcon, title: 'AI-Powered Insights', description: 'Earnings and news context for open positions, history-aware action recommendations, and personalized suggestions to improve performance.' },
  { icon: BeakerIcon, title: 'Stock Valuation (DCF)', description: 'Run a discounted cash flow analysis on any symbol, then add it to a watchlist or set a price alert without leaving the analyzer.' },
  { icon: ChartBarIcon, title: 'Live Market Data', description: 'Real-time quotes, company profiles, and financial statements powered by professional market data feeds.' },
  { icon: HeartIcon, title: 'Health Correlations', description: 'Connect Apple Health data to see how sleep, exercise, and wellness affect your trading performance.' },
  { icon: ArrowsRightLeftIcon, title: 'Portfolio Rebalancing', description: 'Allocation editor, drift against targets, and a rebalance impact summary with cash-to-buy and sell proceeds.' }
]

const brokers = [
  { name: 'Schwab', logo: '/images/brokers/schwab.svg' },
  { name: 'Interactive Brokers', logo: '/images/brokers/ibkr.svg' },
  { name: 'ThinkorSwim', logo: '/images/brokers/thinkorswim.png' },
  { name: 'Lightspeed', logo: '/images/brokers/lightspeed.svg' },
  { name: 'Webull', logo: '/images/brokers/webull.svg' },
  { name: 'TradingView', logo: '/images/brokers/tradingview.svg' },
  { name: 'TradeStation', logo: '/images/brokers/tradestation.svg' },
  { name: 'Tastytrade', logo: '/images/brokers/tastytrade.svg' },
  { name: 'Tradovate', logo: '/images/brokers/tradovate.png' },
  { name: 'Questrade', logo: '/images/brokers/questrade.svg' }
]

const assetClasses = [
  { name: 'Stocks', description: 'Day, swing, position trading', icon: ChartBarIcon },
  { name: 'Options', description: 'Calls, puts, spreads, condors', icon: Squares2X2Icon },
  { name: 'ETFs', description: 'Market and sector tracking', icon: RectangleGroupIcon },
  { name: 'Crypto', description: 'BTC, ETH, and major coins', icon: CurrencyDollarIcon },
  { name: 'Forex', description: 'EUR/USD, GBP/JPY, all pairs', icon: GlobeAltIcon },
  { name: 'Futures', description: 'ES, NQ, CL, GC, and more', icon: ArrowTrendingUpIcon }
]

const whyTradeTally = [
  { icon: CheckCircleIcon, title: 'Free Forever', sub: 'No credit card, no trial' },
  { icon: DocumentTextIcon, title: 'Unlimited Trades', sub: 'No caps or row limits' },
  { icon: CpuChipIcon, title: 'Open Source', sub: 'Self-host or use ours' },
  { icon: BoltIcon, title: 'Your Data, Your Rules', sub: 'Full export anytime' }
]

onMounted(() => {
  fetchRegistrationConfig().catch((error) => {
    console.error('Failed to fetch registration config:', error)
  })

  resetCarouselTimer()

  // Update meta tags for SEO
  document.title = 'TradeTally - The Command Center for Traders | Trading Journal & Analytics'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Free trading journal and command center: auto-sync Schwab, IBKR, TradeStation, and Alpaca, breakeven-aware analytics, MAE/MFE charts, portfolio rebalancing, and behavioral pattern detection. Open source and self-hostable.')

  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'trading journal software, best trading journal, free trading journal, trading dashboard, TraderVue alternative, TraderSync alternative, automated trade import, broker auto-sync, Schwab trading journal, IBKR trading journal, TradeStation sync, Alpaca sync, MAE MFE analysis, portfolio rebalancing, trading performance analytics, AI trading insights, behavioral analytics, revenge trading detection')

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', 'https://tradetally.io/')

  // Add structured data for SEO
  if (showSEOPages.value) {
    const existingScript = document.getElementById('home-softwareapp-jsonld')
    if (existingScript) {
      existingScript.remove()
    }

    const script = document.createElement('script')
    script.id = 'home-softwareapp-jsonld'
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "TradeTally",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web, iOS",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "150"
      },
      "description": "Free trading journal and command center with auto broker sync, breakeven-aware analytics, MAE/MFE excursion charts, portfolio rebalancing, and behavioral pattern detection. The #1 TraderVue alternative.",
      "url": "https://tradetally.io",
      "author": {
        "@type": "Organization",
        "name": "TradeTally"
      },
      "softwareVersion": "2.7",
      "datePublished": "2024-01-01",
      "featureList": [
        "Command-Center Dashboard with Net P&L, Win Rate, Profit Factor, and Equity Curve",
        "Auto-Sync with Schwab, Interactive Brokers, TradeStation, and Alpaca",
        "Breakeven-Aware Win Rates and MAE/MFE Excursion Analytics",
        "Portfolio Rebalancing, Account Comparison, and Plaid Funding Sync",
        "Behavioral Analytics - Revenge Trading, Overconfidence, Loss Aversion Detection",
        "Trading Personality Profiling and 0-100 Risk Score",
        "Price Alerts with Slack/Discord Webhooks and iOS Push",
        "Stock Valuation (DCF) Analyzer",
        "Trading Journal with Tags, Notes, and Playbooks",
        "Stock, Options, Forex, Crypto, Futures Support",
        "Unlimited Free Trade Storage",
        "Mobile Access (iOS)",
        "Complete Data Export",
        "Self-Hosting Option",
        "Open Source Code"
      ]
    })
    document.head.appendChild(script)
  }
})

onUnmounted(() => {
  if (carouselTimer) clearInterval(carouselTimer)
})
</script>

<style scoped>
/* ---- Hero atmosphere ---- */
.hero-grid {
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
}

/* ---- Section typography helpers ---- */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(194 102 32);
  margin-bottom: 0.75rem;
}
:global(.dark) .eyebrow { color: rgb(251 178 122); }
.eyebrow--center { justify-content: center; }

.section-title {
  font-size: 1.875rem;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgb(17 24 39);
}
@media (min-width: 640px) { .section-title { font-size: 2.25rem; } }
:global(.dark) .section-title { color: #fff; }
.section-title--center { text-align: center; }

.section-lead {
  margin-top: 1rem;
  font-size: 1.125rem;
  line-height: 1.7;
  color: rgb(107 114 128);
  max-width: 42rem;
}
:global(.dark) .section-lead { color: rgb(156 163 175); }
.section-lead--center { text-align: center; }

/* ---- Feature list items ---- */
.feature-li { display: flex; align-items: flex-start; gap: 0.75rem; color: rgb(75 85 99); }
:global(.dark) .feature-li { color: rgb(209 213 219); }
.feature-li__icon { height: 1.5rem; width: 1.5rem; flex-shrink: 0; margin-top: 0.125rem; color: rgb(234 88 12); }
:global(.dark) .feature-li__icon { color: rgb(251 146 60); }
.feature-li__strong { font-weight: 600; color: rgb(17 24 39); }
:global(.dark) .feature-li__strong { color: #fff; }

/* ---- Pro / tool cards ---- */
.pro-card {
  background: #fff;
  border: 1px solid rgb(229 231 235);
  border-radius: 0.75rem;
  padding: 1.5rem;
}
:global(.dark) .pro-card { background: rgb(31 41 55); border-color: rgb(55 65 81); }
.pro-card__icon {
  display: inline-flex;
  padding: 0.75rem;
  border-radius: 0.625rem;
  background: rgb(255 237 213);
}
:global(.dark) .pro-card__icon { background: rgba(124, 45, 18, 0.3); }

.tool-card {
  display: block;
  padding: 1.25rem;
  border-radius: 0.5rem;
  background: rgb(249 250 251);
  border: 1px solid rgb(229 231 235);
  transition: border-color 0.2s ease;
}
.tool-card:hover { border-color: rgb(234 88 12); }
:global(.dark) .tool-card { background: rgb(31 41 55); border-color: rgb(55 65 81); }
:global(.dark) .tool-card:hover { border-color: rgb(234 88 12); }

/* Highlighted "Popular" tool */
.tool-card--popular {
  border-color: #f0812a;
  box-shadow: 0 0 20px rgba(240, 129, 42, 0.35), 0 0 6px rgba(240, 129, 42, 0.25);
}
:global(.dark) .tool-card--popular { border-color: #f0812a; }
.tool-card__badge {
  position: absolute;
  top: -0.6rem;
  right: 0.85rem;
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  background: #f0812a;
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 2px 8px rgba(240, 129, 42, 0.45);
}

/* ---- CTA chips ---- */
.cta-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.875rem;
  color: rgb(229 231 235);
  white-space: nowrap;
}

/* ---- App window chrome (frames product screenshots) ---- */
.app-window {
  border-radius: 0.875rem;
  overflow: hidden;
  background: rgb(243 244 246);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 30px 60px -25px rgba(0, 0, 0, 0.35), 0 12px 24px -12px rgba(0, 0, 0, 0.25);
}
:global(.dark) .app-window { background: rgb(17 24 39); border-color: rgba(255, 255, 255, 0.08); }
.app-window--floating {
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.app-window__bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.85rem;
  background: rgb(229 231 235);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
:global(.dark) .app-window__bar { background: rgb(31 41 55); border-bottom-color: rgba(255, 255, 255, 0.06); }
.app-window__dot { height: 0.65rem; width: 0.65rem; border-radius: 9999px; background: rgb(203 213 225); }
:global(.dark) .app-window__dot { background: rgb(71 85 105); }
.app-window__title {
  margin-left: 0.5rem;
  font-size: 0.7rem;
  color: rgb(148 163 184);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* ---- Broker marquee ---- */
.marquee { overflow: hidden; }
.marquee-inner { display: flex; width: fit-content; animation: scroll 40s linear infinite; }
.marquee-inner:hover { animation-play-state: paused; }
.marquee-set { display: flex; flex-shrink: 0; align-items: center; }
.marquee-item { flex-shrink: 0; padding: 0 2rem; }
@keyframes scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(-100% / 3)); }
}

/* ---- Button glow ---- */
.btn-glow {
  box-shadow: 0 0 16px rgba(240, 129, 42, 0.4), 0 0 6px rgba(240, 129, 42, 0.2);
  transition: box-shadow 0.3s ease;
}
.btn-glow:hover {
  box-shadow: 0 0 24px rgba(240, 129, 42, 0.55), 0 0 10px rgba(240, 129, 42, 0.3);
}

/* ---- Carousel ---- */
.carousel-image-container {
  height: 48vh;
  min-height: 320px;
  max-height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
@media (min-width: 1024px) {
  .carousel-image-container { height: 56vh; max-height: 660px; }
}
.carousel-fade-enter-active, .carousel-fade-leave-active { transition: opacity 0.3s ease; }
.carousel-fade-enter-from, .carousel-fade-leave-to { opacity: 0; }
</style>
