import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const distIndexPath = path.join(distDir, 'index.html')

const defaultSocialImage = 'https://tradetally.io/social-preview.png'
const defaultTwitterSite = '@TradeTallyIO'

const pages = [
  {
    route: '/',
    title: 'Trading Journal with Behavioral Analytics - Detect Revenge Trading & More | TradeTally',
    description: 'Free trading journal that detects revenge trading, overconfidence, loss aversion, and behavioral patterns in your trades. Auto-sync Schwab and IBKR. Open source and self-hostable.',
    keywords: 'trading journal software, best trading journal, free trading journal, TraderVue alternative, TraderSync alternative, trade tracking platform, automated trade import, broker auto-sync, Schwab trading journal, IBKR trading journal, behavioral analytics, revenge trading detection',
    fallbackHtml: `
      <main>
        <section>
          <h1>Trading Journal with Behavioral Analytics for Active Traders</h1>
          <p class="hero-sub">TradeTally is a free open-source trading journal and investment tracker built for active traders. Detect revenge trading, overconfidence, and loss aversion while tracking every trade, broker import, and portfolio decision in one place.</p>
          <div class="hero-cta">
            <a href="/register">Get Started Free</a>
            <a href="/public">View Public Trades</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>Behavioral Analytics That Surface Hidden Trading Patterns</h2>
            <p>TradeTally analyzes your trade history to identify revenge trading, overconfidence after win streaks, loss aversion, and missed profit opportunities. These insights turn your journal into a practical decision-making tool instead of just a record of fills.</p>
          </section>

          <section>
            <h2>Auto-Sync and CSV Import Across Major Brokers</h2>
            <p>Connect Charles Schwab and Interactive Brokers for automated trade sync, or import CSV history from Lightspeed, Webull, TradingView, TradeStation, Tradovate, and other brokers. You can review notes, tags, setups, and outcomes without rebuilding your workflow.</p>
          </section>

          <section>
            <h2>Open Source, Self-Hosted, and Built for Serious Review</h2>
            <p>TradeTally supports cloud and self-hosted workflows. Track stocks, options, futures, forex, crypto, and long-term holdings, then review performance by symbol, strategy, and behavior with unlimited free trade storage.</p>
            <nav>
              <a href="/features">Features</a>
              <a href="/compare">Compare Platforms</a>
              <a href="/pricing">Pricing</a>
              <a href="/faq">FAQ</a>
              <a href="/privacy">Privacy Policy</a>
              <a href="/public">Public Trades</a>
              <a href="/login">Login</a>
              <a href="/register">Create Account</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'TradeTally',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web, iOS',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        },
        description: 'Free trading journal with behavioral analytics that detects revenge trading, overconfidence, and loss aversion. Auto-sync with Schwab and IBKR, import CSV history from any broker, and self-host with Docker.',
        url: 'https://tradetally.io/',
        author: {
          '@type': 'Organization',
          name: 'TradeTally'
        }
      }
    ]
  },
  {
    route: '/features',
    title: 'Everything You Need to Trade Smarter | TradeTally Features',
    description: 'Explore TradeTally features: trade journaling, broker sync, behavioral analytics, public profiles, AI insights, and self-hosted deployment for active traders.',
    keywords: 'TradeTally features, trading journal features, broker sync, behavioral analytics, trade tracking software, self-hosted trading journal',
    fallbackHtml: `
      <main>
        <section>
          <h1>TradeTally Features for Traders Who Review Their Edge</h1>
          <p class="hero-sub">TradeTally combines trade journaling, broker import, behavioral analytics, and portfolio tracking into one workflow for traders who want cleaner data and better review.</p>
          <div class="hero-cta">
            <a href="/register">Start Free</a>
            <a href="/pricing">See Pricing</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>Journaling, Tags, Notes, and Setup Review</h2>
            <p>Log entries and exits, store notes and screenshots, tag setups, and analyze trades by pattern, symbol, side, and timeframe. TradeTally is built to make review fast and consistent.</p>
          </section>

          <section>
            <h2>Broker Sync, CSV Import, and Portfolio Tracking</h2>
            <p>Auto-sync Charles Schwab and Interactive Brokers or import CSV files from many brokers. Review realized and unrealized P&amp;L, open positions, equity history, and account-level performance in one dashboard.</p>
          </section>

          <section>
            <h2>Behavioral Analytics and AI-Assisted Insights</h2>
            <p>Detect revenge trading, overconfidence, loss aversion, and missed profit patterns. TradeTally also includes AI-assisted analysis, public trade sharing, mobile access, and self-hosted deployment options.</p>
            <nav>
              <a href="/compare">Compare Platforms</a>
              <a href="/faq">FAQ</a>
              <a href="/public">Public Trades</a>
              <a href="/register">Create Account</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'TradeTally Features',
        description: 'Feature overview for TradeTally trading journal, analytics, broker sync, and self-hosted workflows.',
        url: 'https://tradetally.io/features'
      }
    ]
  },
  {
    route: '/compare',
    title: 'Best Free Trading Journal 2026 - TradeTally vs TraderVue vs TraderSync Comparison',
    description: 'Compare TradeTally with TraderVue and TraderSync. See pricing, broker support, automation, self-hosting, and behavioral analytics differences for active traders.',
    keywords: 'TradeTally vs TraderVue, TradeTally vs TraderSync, best free trading journal, TraderVue alternative, TraderSync alternative, trading journal comparison',
    fallbackHtml: `
      <main>
        <section>
          <h1>TradeTally vs TraderVue vs TraderSync</h1>
          <p class="hero-sub">Compare pricing, broker support, automation, analytics depth, and self-hosting flexibility to decide which trading journal fits your workflow.</p>
          <div class="hero-cta">
            <a href="/register">Try TradeTally Free</a>
            <a href="/pricing">View Plans</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>Free Tier and Pricing Differences</h2>
            <p>TradeTally offers unlimited free trade storage with an open-source core and optional Pro features. That makes it a practical alternative for traders comparing recurring SaaS costs across TraderVue and TraderSync.</p>
          </section>

          <section>
            <h2>Broker Import, Analytics, and Workflow Coverage</h2>
            <p>Compare Schwab and IBKR auto-sync, CSV import flexibility, portfolio tracking, trade review tools, and behavioral analytics like revenge trading detection and loss aversion analysis.</p>
          </section>

          <section>
            <h2>Cloud or Self-Hosted Deployment</h2>
            <p>TradeTally is designed for traders who want either a hosted product or full control through Docker-based self-hosting. That deployment flexibility is a major difference from most closed-source competitors.</p>
            <nav>
              <a href="/features">Features</a>
              <a href="/faq">FAQ</a>
              <a href="/pricing">Pricing</a>
              <a href="/public">Public Trades</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'TradeTally Comparison',
        description: 'Comparison page for TradeTally vs TraderVue vs TraderSync.',
        url: 'https://tradetally.io/compare'
      }
    ]
  },
  {
    route: '/pricing',
    title: 'Choose Your Plan - Trading Journal Pricing | TradeTally',
    description: 'TradeTally pricing: free plan with unlimited trades or Pro at $8/mo. Compare features, broker sync, analytics, and self-hosted options for active traders.',
    keywords: 'free trading journal, trading journal pricing, TradeTally pricing, TraderVue alternative, TraderSync alternative, open source trading journal, self-hosted trading journal',
    fallbackHtml: `
      <main>
        <section>
          <h1>TradeTally Pricing</h1>
          <p class="hero-sub">Start with unlimited free trade storage or upgrade to Pro for deeper analytics, automation, and workflow tools. TradeTally also supports self-hosted deployments.</p>
          <div class="hero-cta">
            <a href="/register">Get Started Free</a>
            <a href="/features">Explore Features</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>Free Plan for Journaling and Review</h2>
            <p>The free plan is designed for traders who want to log trades, review performance, and build consistent habits without paying before the workflow proves value.</p>
          </section>

          <section>
            <h2>Pro Plan for Behavioral Analytics and Automation</h2>
            <p>TradeTally Pro adds advanced analytics, deeper behavioral insight, and premium workflows for traders who want more than a basic journal. Current pricing is positioned far below many traditional trading journal platforms.</p>
          </section>

          <section>
            <h2>Hosted or Self-Hosted</h2>
            <p>Cloud users can start immediately, while self-hosted users can deploy the same product with Docker. That gives you a flexible path whether you want convenience or infrastructure control.</p>
            <nav>
              <a href="/compare">Compare Platforms</a>
              <a href="/faq">FAQ</a>
              <a href="/privacy">Privacy Policy</a>
              <a href="/register">Create Account</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'TradeTally Pricing',
        description: 'Pricing page for TradeTally free and Pro plans.',
        url: 'https://tradetally.io/pricing'
      }
    ]
  },
  {
    route: '/faq',
    title: 'Frequently Asked Questions - Free Trading Journal FAQ | TradeTally',
    description: 'FAQ about TradeTally, the free open-source trading journal. Learn about unlimited trades, Schwab and IBKR sync, self-hosting with Docker, and supported workflows.',
    keywords: 'free trading journal FAQ, open source trading journal, self-hosted trading journal, TradeTally vs TraderVue, trading journal with broker sync',
    fallbackHtml: `
      <main>
        <section>
          <h1>TradeTally Frequently Asked Questions</h1>
          <p class="hero-sub">Answers about pricing, broker support, self-hosting, public trade sharing, and how TradeTally compares with other trading journal platforms.</p>
          <div class="hero-cta">
            <a href="/register">Create Account</a>
            <a href="/compare">Compare Platforms</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>Is TradeTally Really Free?</h2>
            <p>Yes. TradeTally offers unlimited free trade storage and an open-source codebase. Pro is available for traders who want advanced analytics and additional workflow tools.</p>
          </section>

          <section>
            <h2>Which Brokers Are Supported?</h2>
            <p>TradeTally supports Charles Schwab and Interactive Brokers auto-sync plus CSV import workflows for many other brokers and platforms, including Lightspeed, Webull, TradeStation, Tradovate, and TradingView exports.</p>
          </section>

          <section>
            <h2>Can I Self-Host TradeTally?</h2>
            <p>Yes. TradeTally can be self-hosted with Docker, which is useful for traders who want full control over infrastructure, backups, and data location.</p>
            <nav>
              <a href="/features">Features</a>
              <a href="/pricing">Pricing</a>
              <a href="/privacy">Privacy Policy</a>
              <a href="/public">Public Trades</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Is TradeTally free?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'TradeTally offers unlimited free trade storage and an open-source codebase, with an optional Pro tier for advanced analytics.'
            }
          },
          {
            '@type': 'Question',
            name: 'Which brokers does TradeTally support?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'TradeTally supports Charles Schwab and Interactive Brokers auto-sync plus CSV imports from many other brokers and trading platforms.'
            }
          },
          {
            '@type': 'Question',
            name: 'Can I self-host TradeTally?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. TradeTally can be self-hosted with Docker for users who want full infrastructure and data control.'
            }
          }
        ]
      }
    ]
  },
  {
    route: '/public',
    title: 'Public Trades - TradeTally Trading Journal Community',
    description: 'Browse public trades and shared trading activity from the TradeTally community. Review examples, setups, and execution patterns from public profiles.',
    keywords: 'public trades, trading journal community, shared trades, trading profiles, TradeTally public trades',
    fallbackHtml: `
      <main>
        <section>
          <h1>Public Trades from the TradeTally Community</h1>
          <p class="hero-sub">Browse shared trades, public profiles, and example execution patterns from traders using TradeTally to document and review their process.</p>
          <div class="hero-cta">
            <a href="/register">Join Free</a>
            <a href="/features">Explore Features</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>See How Traders Share Setups and Results</h2>
            <p>Public trades make it easier to understand how other traders document entries, exits, notes, and outcomes. Use them as examples when evaluating journaling quality and review workflows.</p>
          </section>

          <section>
            <h2>Profiles, Notes, and Community Visibility</h2>
            <p>TradeTally supports public-facing trade sharing so traders can publish selected activity, highlight process, and build transparent profiles around their execution history.</p>
          </section>

          <section>
            <h2>Use Public Trades as a Product Preview</h2>
            <p>If you are evaluating the platform, public trades provide a live example of how the product handles journaling, tagging, and performance review outside of screenshots or marketing copy.</p>
            <nav>
              <a href="/compare">Compare Platforms</a>
              <a href="/pricing">Pricing</a>
              <a href="/register">Create Account</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'TradeTally Public Trades',
        description: 'Public trade feed and shared community activity on TradeTally.',
        url: 'https://tradetally.io/public'
      }
    ]
  },
  {
    route: '/privacy',
    title: 'Privacy Policy | TradeTally',
    description: 'Read the TradeTally privacy policy covering account data, trade data, analytics, self-hosting, and how information is handled across hosted and self-managed deployments.',
    keywords: 'TradeTally privacy policy, trading journal privacy, self-hosted privacy, trade data privacy',
    fallbackHtml: `
      <main>
        <section>
          <h1>TradeTally Privacy Policy</h1>
          <p class="hero-sub">Review how TradeTally handles account data, trade data, analytics, communications, and self-hosted deployments.</p>
          <div class="hero-cta">
            <a href="/register">Create Account</a>
            <a href="https://github.com/GeneBO98/tradetally" target="_blank" rel="noopener noreferrer">View Source Code</a>
          </div>
        </section>

        <div class="seo-sections">
          <section>
            <h2>Hosted and Self-Hosted Privacy Considerations</h2>
            <p>TradeTally supports both hosted and self-hosted usage. Hosted users can review the platform privacy policy, while self-hosted users can manage their own infrastructure, storage, and retention practices.</p>
          </section>

          <section>
            <h2>Trade Data, Account Data, and Support Communications</h2>
            <p>The privacy policy explains how data connected to accounts, trades, billing, and support is handled so users can understand the operational and compliance footprint of the product.</p>
          </section>

          <section>
            <h2>Read the Full Policy in the Application</h2>
            <p>The full policy is available in the TradeTally application and repository materials. This page is provided so crawlers and users receive a dedicated, route-specific privacy document instead of the generic homepage shell.</p>
            <nav>
              <a href="/faq">FAQ</a>
              <a href="/pricing">Pricing</a>
              <a href="/features">Features</a>
            </nav>
          </section>
        </div>

        <noscript>
          <p>TradeTally requires JavaScript to run. Please enable JavaScript in your browser to use the full application.</p>
        </noscript>
      </main>
    `,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'TradeTally Privacy Policy',
        description: 'Privacy policy for TradeTally.',
        url: 'https://tradetally.io/privacy'
      }
    ]
  }
]

function setOrInsertMeta(html, matcher, replacement, fallbackTag) {
  if (matcher.test(html)) {
    return html.replace(matcher, replacement)
  }

  return html.replace('</head>', `  ${fallbackTag}\n  </head>`)
}

function withMeta(html, { title, description, keywords, canonicalUrl }) {
  let nextHtml = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${description}">`,
    `<meta name="description" content="${description}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="keywords" content="${keywords}">`,
    `<meta name="keywords" content="${keywords}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${canonicalUrl}">`,
    `<link rel="canonical" href="${canonicalUrl}">`
  )

  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:title" content="${title}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:description" content="${description}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${canonicalUrl}">`,
    `<meta property="og:url" content="${canonicalUrl}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:title" content="${title}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:description" content="${description}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="twitter:site"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:site" content="${defaultTwitterSite}">`,
    `<meta name="twitter:site" content="${defaultTwitterSite}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="twitter:creator"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:creator" content="${defaultTwitterSite}">`,
    `<meta name="twitter:creator" content="${defaultTwitterSite}">`
  )
  nextHtml = setOrInsertMeta(
    nextHtml,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${defaultSocialImage}">`,
    `<meta name="twitter:image" content="${defaultSocialImage}">`
  )

  return nextHtml
}

function withFallbackContent(html, fallbackHtml) {
  return html.replace(
    /<div id="app-fallback">[\s\S]*?<\/main>\s*<\/div>/i,
    `<div id="app-fallback">\n${fallbackHtml.trim()}\n      </div>`
  )
}

function withStructuredData(html, structuredData = []) {
  const markerRegex = /\s*<!-- prerender-structured-data:start -->[\s\S]*?<!-- prerender-structured-data:end -->/i
  const scripts = structuredData
    .map((entry) => `    <script type="application/ld+json">${JSON.stringify(entry)}</script>`)
    .join('\n')

  const block = structuredData.length > 0
    ? `\n    <!-- prerender-structured-data:start -->\n${scripts}\n    <!-- prerender-structured-data:end -->`
    : ''

  if (markerRegex.test(html)) {
    return html.replace(markerRegex, block)
  }

  return html.replace('</head>', `${block}\n  </head>`)
}

function routeToCanonicalUrl(route) {
  return route === '/' ? 'https://tradetally.io/' : `https://tradetally.io${route}`
}

function routeToOutputPath(route) {
  if (route === '/') {
    return distIndexPath
  }

  return path.join(distDir, route.replace(/^\//, ''), 'index.html')
}

async function main() {
  const baseHtml = await readFile(distIndexPath, 'utf8')

  for (const page of pages) {
    const canonicalUrl = routeToCanonicalUrl(page.route)
    let html = baseHtml

    html = withMeta(html, {
      title: page.title,
      description: page.description,
      keywords: page.keywords,
      canonicalUrl
    })
    html = withFallbackContent(html, page.fallbackHtml)
    html = withStructuredData(html, page.structuredData)

    const outputPath = routeToOutputPath(page.route)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html, 'utf8')
  }
}

main().catch((error) => {
  console.error('[ERROR] Failed to prerender SEO pages:', error)
  process.exit(1)
})
