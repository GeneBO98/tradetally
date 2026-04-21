<template>
  <div>
    <!-- Hero Section -->
    <section class="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-900/20 via-transparent to-transparent"></div>
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-12 items-center">
          <!-- Left: Text Content -->
          <div class="lg:col-span-2">
            <h1 class="text-4xl font-extrabold text-white sm:text-5xl tracking-tight text-balance">
              Stop Repeating the Same Trading Mistakes
            </h1>
            <p class="mt-6 text-lg text-gray-300 max-w-xl">
              TradeTally detects revenge trading, overconfidence, loss aversion, and other behavioral patterns hiding in your trade data. Free forever.
            </p>
            <div v-if="showRegisterButton" class="mt-8">
              <form @submit.prevent="handleQuickSignup" class="flex flex-col sm:flex-row gap-3 max-w-lg">
                <input
                  v-model="quickEmail"
                  type="email"
                  required
                  placeholder="Enter your email"
                  class="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-gray-500 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  class="btn-primary btn-glow text-lg px-8 py-3 whitespace-nowrap"
                >
                  Get Started Free
                </button>
              </form>
            </div>
            <div class="mt-4">
              <router-link to="/public" class="inline-flex items-center px-8 py-3 text-lg font-medium text-gray-300 border border-gray-600 rounded-lg hover:bg-white/10 hover:border-gray-400 transition-colors">
                View Public Trades
              </router-link>
            </div>
            <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-gray-200">
              <span class="flex items-center gap-2">
                <CheckCircleIcon class="h-5 w-5 text-emerald-400" />
                Free forever
              </span>
              <span class="flex items-center gap-2">
                <CheckCircleIcon class="h-5 w-5 text-emerald-400" />
                No credit card required
              </span>
              <span class="flex items-center gap-2">
                <CheckCircleIcon class="h-5 w-5 text-emerald-400" />
                Open source
              </span>
            </div>
          </div>
          <!-- Right: Hero Video -->
          <div class="relative lg:col-span-3">
            <div class="rounded-xl overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <video
                autoplay
                loop
                muted
                playsinline
                poster="/images/screenshot-trading-personality.png"
                class="w-full h-auto"
              >
                <source src="/images/hero-dashboard.mp4" type="video/mp4" />
                <source src="/images/hero-dashboard.webm" type="video/webm" />
                <img
                  src="/images/screenshot-trading-personality.png"
                  alt="TradeTally behavioral analytics - Trading personality profiling with Scalper, Momentum, Mean Reversion, and Swing scores"
                  class="w-full h-auto"
                />
              </video>
            </div>
            <div class="absolute -inset-4 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent rounded-xl pointer-events-none lg:hidden"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Broker Marquee -->
    <section class="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700/50 py-5 overflow-hidden">
      <p class="text-center text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">
        Works with your broker
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
                class="h-7 w-auto opacity-70 hover:opacity-100 transition-opacity dark:invert"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Behavioral Analytics Carousel -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-20 sm:py-28">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
            Your Trading Psychology, Quantified
          </h2>
          <p class="mt-4 max-w-2xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Six analytical lenses that reveal the behavioral patterns most traders never see.
          </p>
        </div>

        <div class="relative">
          <!-- Text above on all screens -->
          <transition name="carousel-fade" mode="out-in">
            <div :key="carouselSlide" class="text-center mb-8">
              <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ carouselSlides[carouselSlide].title }}
              </h3>
              <p class="mt-3 max-w-2xl mx-auto text-lg text-gray-500 dark:text-gray-400">
                {{ carouselSlides[carouselSlide].description }}
              </p>
            </div>
          </transition>

          <!-- Screenshot area — fixed height container -->
          <div class="carousel-image-container rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 bg-gray-100 dark:bg-gray-800 p-4 sm:p-6">
            <transition name="carousel-fade" mode="out-in">
              <img
                :key="'img-' + carouselSlide"
                :src="carouselSlides[carouselSlide].image"
                :alt="carouselSlides[carouselSlide].title"
                class="w-full h-full object-contain rounded-lg"
                loading="lazy"
              />
            </transition>
          </div>

          <!-- Arrow controls — positioned over the image area -->
          <button
            @click="goToCarouselSlide((carouselSlide - 1 + carouselSlides.length) % carouselSlides.length)"
            class="absolute left-2 sm:left-0 sm:-translate-x-5 bottom-16 sm:bottom-1/3 p-2 rounded-full bg-white/90 dark:bg-gray-700/90 shadow-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors z-10"
          >
            <ChevronLeftIcon class="h-5 w-5" />
          </button>
          <button
            @click="goToCarouselSlide((carouselSlide + 1) % carouselSlides.length)"
            class="absolute right-2 sm:right-0 sm:translate-x-5 bottom-16 sm:bottom-1/3 p-2 rounded-full bg-white/90 dark:bg-gray-700/90 shadow-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors z-10"
          >
            <ChevronRightIcon class="h-5 w-5" />
          </button>

          <!-- Dot indicators -->
          <div class="flex justify-center gap-2 mt-8">
            <button
              v-for="(slide, index) in carouselSlides"
              :key="index"
              @click="goToCarouselSlide(index)"
              class="h-2.5 rounded-full transition-all duration-300"
              :class="carouselSlide === index
                ? 'w-8 bg-primary-600'
                : 'w-2.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Broker Sync / Import -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-20 sm:py-28">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div class="order-2 lg:order-1 lg:col-span-2">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-4">
              IMPORT
            </span>
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
              Connected in 60 Seconds
            </h2>
            <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Auto-sync your trades from Schwab or IBKR, or import CSV from any broker. No manual entry.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-start gap-3">
                <BoltIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Auto-sync with Charles Schwab and Interactive Brokers in real time</span>
              </li>
              <li class="flex items-start gap-3">
                <DocumentTextIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">CSV import from Lightspeed, Webull, TradingView, TradeStation, and more</span>
              </li>
              <li class="flex items-start gap-3">
                <CpuChipIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Custom column mapping for any broker with CSV export</span>
              </li>
            </ul>
          </div>
          <div class="order-1 lg:order-2 lg:col-span-3 rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700" data-parallax>
            <img
              src="/images/screenshot-broker-sync.png"
              alt="TradeTally Broker Sync - Connect Schwab or IBKR to auto-sync trades"
              class="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Journal -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-20 sm:py-28">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div class="lg:col-span-3 rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700" data-parallax>
            <img
              src="/images/screenshot-journal.png"
              alt="TradeTally Journal - Tag trades and log your mindset to fuel behavioral analysis"
              class="w-full h-auto"
              loading="lazy"
            />
          </div>
          <div class="lg:col-span-2">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-4">
              JOURNAL
            </span>
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
              Tag, Log, and Let TradeTally Connect the Dots
            </h2>
            <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Your journal entries become data points for behavioral analysis. Every tag, every note, every emotion -- quantified.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-start gap-3">
                <TagIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Tag trades by setup, emotion, and strategy to build your behavioral dataset</span>
              </li>
              <li class="flex items-start gap-3">
                <DocumentTextIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Daily journal entries with market bias, key levels, and pre-market plans</span>
              </li>
              <li class="flex items-start gap-3">
                <LightBulbIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">AI-powered pattern recognition connects your journal to your P&L outcomes</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Pro Features Section -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-20 sm:py-28 border-y border-gray-200 dark:border-gray-700/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-4">
            <SparklesIcon class="h-4 w-4 mr-1.5" />
            PRO FEATURES
          </span>
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
            Take Your Trading to the Next Level
          </h2>
          <p class="mt-4 max-w-2xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Unlock behavioral pattern detection, AI-driven insights, and health correlations to find your edge.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <PresentationChartLineIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-gray-900 dark:text-white">Behavioral Analytics</h3>
            </div>
            <p class="text-gray-600 dark:text-gray-300">
              Detect revenge trading, overconfidence, and loss aversion patterns. Get a 0-100 risk score and personality profiling based on your actual trades.
            </p>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <CpuChipIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-gray-900 dark:text-white">AI-Powered Insights</h3>
            </div>
            <p class="text-gray-600 dark:text-gray-300">
              Advanced AI analysis of your trading patterns, personalized recommendations, and actionable suggestions to improve performance.
            </p>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <HeartIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-gray-900 dark:text-white">Health Correlations</h3>
            </div>
            <p class="text-gray-600 dark:text-gray-300">
              Connect Apple Health data to analyze how sleep, exercise, and wellness affect your trading performance.
            </p>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <ChartBarIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-gray-900 dark:text-white">Live Market Data</h3>
            </div>
            <p class="text-gray-600 dark:text-gray-300">
              Real-time stock quotes, company profiles, and financial statements powered by professional market data feeds.
            </p>
          </div>
        </div>

        <div class="mt-12 text-center">
          <router-link
            to="/pricing"
            class="btn-primary btn-glow inline-flex items-center text-lg px-8 py-3"
          >
            View Pro Plans &mdash; Starting at $8/month
          </router-link>
          <p class="mt-4 text-gray-500 dark:text-gray-400 text-sm">
            7-day free trial available. Cancel anytime.
          </p>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section v-if="testimonials.length > 0" data-reveal class="bg-gray-50 dark:bg-gray-900 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
            What Traders Are Saying
          </h2>
          <p class="mt-4 max-w-2xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Real reviews from TradeTally Pro subscribers.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
          <div
            v-for="t in testimonials"
            :key="t.id"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col"
          >
            <!-- Stars -->
            <div class="flex gap-0.5 mb-3">
              <svg
                v-for="star in 5"
                :key="star"
                class="h-5 w-5"
                :class="star <= t.rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>

            <!-- Body -->
            <p class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed flex-1">
              "{{ t.body }}"
            </p>

            <!-- Author -->
            <p class="mt-4 text-sm font-medium text-gray-900 dark:text-white">
              {{ t.display_name || 'TradeTally User' }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- SEO: TraderVue Alternative -->
    <section v-if="showSEOPages" class="bg-white dark:bg-gray-800 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            The Modern Alternative to TraderVue
          </h2>
          <p class="mt-4 max-w-3xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Looking for a TraderVue alternative? TradeTally offers all the trade journaling features you need with a modern interface,
            advanced analytics, and competitive pricing. Switch from TraderVue to TradeTally and experience the next generation of trade tracking.
          </p>
          <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="heading-card">Unlimited Free Trading Journal</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Unlike TraderVue's 100 trades/month limit, get unlimited trade storage completely free. No time limits, no hidden fees.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="heading-card">Works With Your Broker</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Auto-sync with Schwab and IBKR, plus CSV import from Lightspeed, Webull, TradingView, TradeStation, and custom mapping for any broker.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="heading-card">AI-Powered Analytics</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Advanced trade analysis with AI insights, behavioral pattern detection, and professional performance metrics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- SEO: Asset Class Compatibility -->
    <section v-if="showSEOPages" class="bg-gray-50 dark:bg-gray-900 py-20 sm:py-24">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
            Every Market You Trade
          </h2>
          <p class="mt-4 max-w-2xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Track performance across every asset class &mdash; stocks, options, ETFs, crypto, forex, and futures.
          </p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-6xl mx-auto">
          <div v-for="a in assetClasses" :key="a.name"
               class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
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
            TradeTally integrates with the leading retail brokerages. Charles Schwab and Interactive Brokers (IBKR) support
            automatic trade sync via API and OAuth, so your executions flow into your journal in real time without any manual
            entry. We also provide native CSV import for ThinkorSwim (TD Ameritrade), Lightspeed Trading, Webull, TradingView,
            TradeStation, Tastytrade, Tradovate, and Questrade. For any broker not listed, our custom CSV column mapper lets
            you build a reusable import template from any broker that offers trade history export.
          </p>

          <h3>Supported Asset Classes in Detail</h3>
          <ul>
            <li>
              <strong>Stocks and equities:</strong> Day trading, swing trading, and long-term position trading across all US
              exchanges (NYSE, NASDAQ, AMEX), plus international equities. Track penny stocks, small caps, large caps,
              and dividend plays in a single trading journal.
            </li>
            <li>
              <strong>Options:</strong> Calls, puts, vertical spreads, iron condors, iron butterflies, covered calls, cash-secured
              puts, credit spreads, debit spreads, diagonals, calendars, and multi-leg option strategies. Full Greeks and
              expiration tracking.
            </li>
            <li>
              <strong>ETFs:</strong> Index ETFs (SPY, QQQ, IWM, DIA), sector ETFs (XLF, XLE, XLK, XLV), leveraged ETFs (TQQQ,
              SQQQ, SOXL), inverse ETFs, and thematic ETFs.
            </li>
            <li>
              <strong>Cryptocurrency:</strong> Bitcoin (BTC), Ethereum (ETH), Solana (SOL), Cardano (ADA), XRP, Dogecoin (DOGE),
              and all major altcoins. Spot trading and perpetual futures.
            </li>
            <li>
              <strong>Forex:</strong> Major pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF), minor pairs, exotic pairs, and cross
              currencies. Pip-level precision and lot-size tracking.
            </li>
            <li>
              <strong>Futures:</strong> Equity index futures (ES, NQ, RTY, YM), energy (CL, NG), metals (GC, SI, HG), agricultural
              (ZC, ZS, ZW), interest rates (ZB, ZN), and micro futures (MES, MNQ, MGC, MCL).
            </li>
          </ul>

          <h3>Who Uses TradeTally</h3>
          <p>
            TradeTally is built for day traders, swing traders, position traders, options traders, futures traders, forex
            traders, and algorithmic traders who want a free trading journal with behavioral analytics. Whether you need a
            TraderVue alternative, a TraderSync alternative, an Edgewonk alternative, or a Tradervue replacement, TradeTally
            delivers unlimited trade storage, automated broker import, AI-powered insights, revenge trading detection,
            overconfidence analysis, loss aversion measurement, trading personality profiling, and a 0-100 behavioral risk
            score &mdash; all free forever, with an open source self-hosting option.
          </p>

          <h3>Popular Use Cases</h3>
          <ul>
            <li>Day trading journal with automatic broker sync and behavioral analytics</li>
            <li>Options trading journal with Greeks, expiration, and strategy tagging</li>
            <li>Futures trading journal for prop firm evaluations and funded accounts</li>
            <li>Swing trading journal with multi-day hold tracking and chart annotations</li>
            <li>Forex trading journal with pip tracking and session-based analytics</li>
            <li>Crypto trading journal for spot and perpetual futures across exchanges</li>
            <li>Prop firm trading journal for FTMO, MyForexFunds, Topstep, and Apex</li>
            <li>Stock trading journal for penny stocks, small caps, and momentum plays</li>
            <li>Free TraderVue alternative with unlimited trades and no monthly limit</li>
            <li>Self-hosted trading journal for privacy-conscious traders and teams</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Why TradeTally -->
    <section data-reveal class="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700/50 py-14">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div class="flex flex-col items-center text-center">
            <div class="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/30 mb-3">
              <CheckCircleIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="text-base font-semibold text-gray-900 dark:text-white">Free Forever</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">No credit card, no trial</div>
          </div>
          <div class="flex flex-col items-center text-center">
            <div class="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/30 mb-3">
              <DocumentTextIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="text-base font-semibold text-gray-900 dark:text-white">Unlimited Trades</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">No caps or row limits</div>
          </div>
          <div class="flex flex-col items-center text-center">
            <div class="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/30 mb-3">
              <CpuChipIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="text-base font-semibold text-gray-900 dark:text-white">Open Source</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Self-host or use ours</div>
          </div>
          <div class="flex flex-col items-center text-center">
            <div class="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/30 mb-3">
              <BoltIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="text-base font-semibold text-gray-900 dark:text-white">Your Data, Your Rules</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Full export anytime</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section data-reveal class="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-20 sm:py-28">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary-900/30 via-transparent to-transparent"></div>
      <div class="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight text-balance">
          See the patterns in your trading &mdash; and break them
        </h2>
        <p class="mt-5 max-w-2xl mx-auto text-lg text-gray-300">
          Sync your broker, tag your trades, and let TradeTally surface the behaviors costing you money.
        </p>

        <!-- Value recap -->
        <div class="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div class="flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10">
            <BoltIcon class="h-5 w-5 text-primary-400 flex-shrink-0" />
            <span class="text-sm text-gray-200 whitespace-nowrap">Sync in 60 seconds</span>
          </div>
          <div class="flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10">
            <TagIcon class="h-5 w-5 text-primary-400 flex-shrink-0" />
            <span class="text-sm text-gray-200 whitespace-nowrap">Tag your trades</span>
          </div>
          <div class="flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10">
            <PresentationChartLineIcon class="h-5 w-5 text-primary-400 flex-shrink-0" />
            <span class="text-sm text-gray-200 whitespace-nowrap">See your patterns</span>
          </div>
        </div>

        <!-- Email capture (mirrors hero) -->
        <div v-if="showRegisterButton" class="mt-10">
          <form @submit.prevent="handleQuickSignupFooter" class="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <input
              v-model="footerEmail"
              type="email"
              required
              placeholder="Enter your email"
              class="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-gray-500 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              type="submit"
              class="btn-primary btn-glow text-lg px-8 py-3 whitespace-nowrap"
            >
              Get Started Free
            </button>
          </form>
          <p class="mt-4 text-sm text-gray-400">
            Free forever. No credit card required.
          </p>
        </div>
      </div>
    </section>

    <!-- Mobile App -->
    <section data-reveal class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700/50 py-12">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p class="text-sm font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">
          Now on iOS
        </p>
        <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
          Your Journal, Always With You
        </h3>
        <p class="mt-2 text-gray-500 dark:text-gray-400">
          Log trades, review your stats, and stay accountable from your phone.
        </p>
        <div class="mt-6">
          <a href="https://apps.apple.com/us/app/tradetally/id6748022992" target="_blank" rel="noopener noreferrer">
            <img
              src="/images/app-store-badge.svg"
              alt="Download TradeTally on the App Store"
              class="h-12 mx-auto hover:opacity-80 transition-opacity"
            />
          </a>
        </div>
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
  GlobeAltIcon
} from '@heroicons/vue/24/outline'
import { useRouter } from 'vue-router'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { useScrollReveal } from '@/composables/useScrollReveal'
import api from '@/services/api'

useScrollReveal()
const router = useRouter()
const { showSEOPages, registrationConfig, fetchRegistrationConfig } = useRegistrationMode()
const showRegisterButton = computed(() => registrationConfig.value?.allowRegistration !== false)

const quickEmail = ref('')
const footerEmail = ref('')
const testimonials = ref([])

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

// Carousel state
const carouselSlide = ref(0)
let carouselTimer = null

const carouselSlides = [
  {
    icon: FingerPrintIcon,
    badge: 'PERSONALITY',
    title: 'Trading Personality Profiling',
    description: 'Get classified as a Scalper, Momentum, Mean Reversion, or Swing trader with confidence scores based on your actual trade data. Understand your natural edge.',
    gradient: 'from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/20',
    image: '/images/screenshot-trading-personality.png'
  },
  {
    icon: ExclamationTriangleIcon,
    badge: 'RISK',
    title: 'Risk Score & Behavioral Insights',
    description: 'A 0-100 risk score calculated from your trading behavior. See severity-colored breakdowns of position sizing, frequency, and emotional patterns.',
    gradient: 'from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/20',
    image: '/images/screenshot-behavioral-insights.png'
  },
  {
    icon: FireIcon,
    badge: 'DETECTION',
    title: 'Revenge Trading Detection',
    description: 'Automatically flags when you take impulsive trades after a loss. See your revenge trading frequency, average loss, and which sessions trigger it.',
    gradient: 'from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/20',
    image: '/images/screenshot-revenge-trading.png'
  },
  {
    icon: ScaleIcon,
    badge: 'PSYCHOLOGY',
    title: 'Loss Aversion Analysis',
    description: 'Measures how exit timing shifts based on whether a trade is winning or losing. Detects if you cut winners early and let losers run.',
    gradient: 'from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/20',
    image: '/images/screenshot-loss-aversion.png'
  },
  {
    icon: BanknotesIcon,
    badge: 'OPTIMIZATION',
    title: 'Missed Profit Opportunities',
    description: 'Identifies trades you exited too early by comparing your exit price to the subsequent price movement. Quantifies exactly how much was left on the table.',
    gradient: 'from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/20',
    image: '/images/screenshot-missed-profits.png'
  },
  {
    icon: ArrowTrendingUpIcon,
    badge: 'PATTERNS',
    title: 'Overconfidence Indicators',
    description: 'Detects when win streaks lead to larger position sizes and riskier trades. Shows the correlation between consecutive wins and subsequent losses.',
    gradient: 'from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/20',
    image: '/images/screenshot-overconfidence.png'
  }
]

const placeholderGradientClass = computed(() => {
  return 'bg-gradient-to-br ' + carouselSlides[carouselSlide.value].gradient
})

const slideIcon = computed(() => {
  return carouselSlides[carouselSlide.value].icon
})

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

const brokers = [
  { name: 'Schwab', logo: '/images/brokers/schwab.svg', height: 'h-10' },
  { name: 'Interactive Brokers', logo: '/images/brokers/ibkr.svg', darkInvert: true },
  { name: 'ThinkorSwim', logo: '/images/brokers/thinkorswim.png', height: 'h-10' },
  { name: 'Lightspeed', logo: '/images/brokers/lightspeed.svg', darkInvert: true },
  { name: 'Webull', logo: '/images/brokers/webull.svg', darkInvert: true },
  { name: 'TradingView', logo: '/images/brokers/tradingview.svg', darkInvert: true },
  { name: 'TradeStation', logo: '/images/brokers/tradestation.svg' },
  { name: 'Tastytrade', logo: '/images/brokers/tastytrade.svg', darkInvert: true },
  { name: 'Tradovate', logo: '/images/brokers/tradovate.png', darkInvert: true },
  { name: 'Questrade', logo: '/images/brokers/questrade.svg', height: 'h-10' }
]

const assetClasses = [
  { name: 'Stocks', description: 'Day, swing, position trading', icon: ChartBarIcon },
  { name: 'Options', description: 'Calls, puts, spreads, condors', icon: Squares2X2Icon },
  { name: 'ETFs', description: 'Market and sector tracking', icon: RectangleGroupIcon },
  { name: 'Crypto', description: 'BTC, ETH, and major coins', icon: CurrencyDollarIcon },
  { name: 'Forex', description: 'EUR/USD, GBP/JPY, all pairs', icon: GlobeAltIcon },
  { name: 'Futures', description: 'ES, NQ, CL, GC, and more', icon: ArrowTrendingUpIcon }
]

onMounted(() => {
  fetchRegistrationConfig().catch((error) => {
    console.error('Failed to fetch registration config:', error)
  })

  api.get('/testimonials/public').then(({ data }) => {
    testimonials.value = data
  }).catch(() => {})

  resetCarouselTimer()

  // Update meta tags for SEO
  document.title = 'Trading Journal with Behavioral Analytics - Detect Revenge Trading & More | TradeTally'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Free trading journal that detects revenge trading, overconfidence, loss aversion, and behavioral patterns in your trades. Auto-sync Schwab and IBKR. Open source, self-hostable.')

  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'trading journal software, best trading journal, free trading journal, TraderVue alternative, TraderSync alternative, trade tracking platform, automated trade import, broker auto-sync, Schwab trading journal, IBKR trading journal, Interactive Brokers journal, stock trade journal, options trading journal, day trading journal, trading performance analytics, AI trading insights, behavioral analytics, revenge trading detection')

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
      "description": "Free trading journal with behavioral analytics that detects revenge trading, overconfidence, and loss aversion. Auto-sync with Schwab and IBKR, CSV import from any broker. The #1 TraderVue alternative.",
      "url": "https://tradetally.io",
      "author": {
        "@type": "Organization",
        "name": "TradeTally"
      },
      "softwareVersion": "2.0",
      "datePublished": "2024-01-01",
      "featureList": [
        "Behavioral Analytics - Revenge Trading, Overconfidence, Loss Aversion Detection",
        "Trading Personality Profiling",
        "Auto-Sync with Schwab and Interactive Brokers",
        "Unlimited Free Trade Storage",
        "Automated Trade Import from Any Broker",
        "AI-Powered Insights and Recommendations",
        "Trading Journal with Tags and Notes",
        "Stock, Options, Forex, Crypto, Futures Support",
        "Public Trade Sharing and Community",
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
.marquee {
  overflow: hidden;
}

.marquee-inner {
  display: flex;
  width: fit-content;
  animation: scroll 40s linear infinite;
}

.marquee-inner:hover {
  animation-play-state: paused;
}

.marquee-set {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.marquee-item {
  flex-shrink: 0;
  padding: 0 2rem;
}

@keyframes scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(-100% / 3));
  }
}

.btn-glow {
  box-shadow: 0 0 16px rgba(240, 129, 42, 0.4), 0 0 6px rgba(240, 129, 42, 0.2);
  transition: box-shadow 0.3s ease;
}

.btn-glow:hover {
  box-shadow: 0 0 24px rgba(240, 129, 42, 0.55), 0 0 10px rgba(240, 129, 42, 0.3);
}

.carousel-image-container {
  height: 50vh;
  min-height: 320px;
  max-height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-image-container img {
  max-height: 100%;
  width: auto;
  max-width: 100%;
  margin: 0 auto;
}

@media (min-width: 1024px) {
  .carousel-image-container {
    height: 60vh;
    max-height: 700px;
  }
}

.carousel-fade-enter-active,
.carousel-fade-leave-active {
  transition: opacity 0.3s ease;
}

.carousel-fade-enter-from,
.carousel-fade-leave-to {
  opacity: 0;
}

</style>
