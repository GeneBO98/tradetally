<template>
  <div class="max-w-4xl mx-auto py-8 px-4">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">Frequently Asked Questions</h1>
    
    <div class="space-y-8">
      <!-- Getting Started -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Getting Started</h2>
        
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">What is TradeTally?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              TradeTally is a professional trading journal and analytics platform that helps traders track, analyze, and improve their trading performance. It offers comprehensive charts, multi-broker support, and real-time insights to help you become a better trader.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Is TradeTally really free?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes! TradeTally offers a generous free tier with no trade limits. You can track unlimited trades, access all analytics features, and use the platform indefinitely without paying. We believe every trader should have access to professional tools regardless of their budget.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">What's the difference between cloud-hosted and self-hosted versions?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              The cloud-hosted version is managed by us - you just sign up and start using it. The self-hosted version allows you to run TradeTally on your own server, giving you complete control over your data and the ability to customize the platform to your needs.
            </p>
          </div>
        </div>
      </section>

      <!-- TraderVue Alternative -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">TradeTally vs TraderVue</h2>
        
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">How does TradeTally compare to TraderVue?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              TradeTally offers all the core features of TraderVue with several advantages: a completely free tier with no trade limits, modern interface built with Vue 3, self-hosting option for data privacy, and open-source transparency. We focus on providing professional tools without artificial limitations.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Can I import my data from TraderVue?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes, you can migrate from TraderVue using our Generic CSV import option. Export your trades from TraderVue as CSV, then ensure the columns match our expected format: Symbol, Date, Entry Price, Exit Price, Quantity, Side, Commission, Fees. You may need to adjust column names or format to match our Generic CSV template.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Why should I switch from TraderVue to TradeTally?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              TradeTally provides unlimited trades on the free plan, no feature restrictions, modern technology stack for better performance, self-hosting option for complete data control, and active development with regular updates. Plus, it's open-source, so you can verify our privacy claims and even contribute to development.
            </p>
          </div>
        </div>
      </section>

      <!-- Import & Compatibility -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Import & Compatibility</h2>
        
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Which brokers does TradeTally support?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              TradeTally has dedicated parsers for Interactive Brokers, Charles Schwab, E*TRADE, ThinkorSwim, and Lightspeed Trader. For other brokers, you can use our Generic CSV import option by formatting your data to match our required columns. <strong>Need support for your specific broker?</strong> Send us a sample CSV file from your broker and we'll add dedicated support for it in a future update.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">How do I import trades from my broker?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Export your trade history as a CSV file from your broker, then use our import feature to upload the file. TradeTally will automatically map the columns and import your trades. You can review and edit the imported trades before finalizing.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Can I import options trades?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes! TradeTally fully supports options trading. You can import and track calls, puts, spreads, and complex options strategies. Our analytics will calculate your options-specific metrics like win rate by strategy type.
            </p>
          </div>
        </div>
      </section>

      <!-- Features & Functionality -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Features & Functionality</h2>
        
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">How do I track my P&L?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              TradeTally automatically calculates your P&L from imported trades. View your daily, weekly, monthly, and yearly performance in the Analytics section. You can filter by symbol, strategy, or custom date ranges to analyze specific aspects of your trading.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Can I share my trades publicly?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes! You can mark individual trades as public to share them with the community. Public trades appear on the public feed where other traders can view and comment. You maintain full control and can make trades private at any time.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">What reports can I generate?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Generate comprehensive reports including win/loss analysis, performance by symbol, strategy effectiveness, risk metrics, and monthly/yearly summaries. You can also export all your TradeTally data as a JSON file from the Settings page.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Can I export my data from TradeTally?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes! You can export all your TradeTally data including trades, tags, settings, and trading profile from the Settings page. This creates a JSON file that can be re-imported into any TradeTally instance, making it easy to migrate between cloud-hosted and self-hosted versions.
            </p>
          </div>
        </div>
      </section>

      <!-- Privacy & Security -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Privacy & Security</h2>
        
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Is my data secure?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes! We use industry-standard encryption for data in transit and at rest. Your broker credentials are never stored - we only work with exported trade data. For maximum privacy, you can use our self-hosted option to keep all data on your own servers.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Do you sell user data?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              No, never. We do not sell, share, or monetize your personal or trading data in any way. Our business model is based on optional premium features, not data exploitation. Your trades and strategies remain completely private.
            </p>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Can I delete my account and all data?</h3>
            <p class="text-gray-600 dark:text-gray-400">
              Yes, you have full control over your data. You can export all your trades at any time and delete your account from the settings page. Account deletion is immediate and permanent, removing all your data from our servers.
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

// Set document title and meta tags
onMounted(() => {
  document.title = 'Frequently Asked Questions - TradeTally'
  
  // Update meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    metaDescription.setAttribute('content', 'Common questions about TradeTally trading journal. Learn about features, TraderVue migration, broker compatibility, and more.')
  }
  
  // Update meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (metaKeywords) {
    metaKeywords.setAttribute('content', 'TradeTally FAQ, trading journal questions, TraderVue alternative, trade tracking help')
  }
})

// Add FAQ schema markup
onMounted(() => {
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is TradeTally?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "TradeTally is a professional trading journal and analytics platform that helps traders track, analyze, and improve their trading performance."
        }
      },
      {
        "@type": "Question",
        "name": "How does TradeTally compare to TraderVue?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "TradeTally offers all the core features of TraderVue with several advantages: a completely free tier with no trade limits, modern interface built with Vue 3, self-hosting option for data privacy, and open-source transparency."
        }
      },
      {
        "@type": "Question",
        "name": "Can I import my data from TraderVue?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! Export your trades from TraderVue as a CSV file and import them directly into TradeTally. Our import system is flexible and can handle various CSV formats."
        }
      }
    ]
  })
  document.head.appendChild(script)
})
</script>