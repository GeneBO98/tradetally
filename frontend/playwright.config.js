import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2
    }
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: [
        'cd ../backend &&',
        'PORT=3001',
        'NODE_ENV=test',
        'RUN_MIGRATIONS=true',
        'RATE_LIMIT_ENABLED=false',
        'ENABLE_TEST_SUPPORT=true',
        'ENABLE_PRICE_MONITORING=false',
        'ENABLE_GAMIFICATION=false',
        'ENABLE_TRIAL_EMAILS=false',
        'ENABLE_RETENTION_EMAILS=false',
        'ENABLE_OPTIONS_SCHEDULER=false',
        'ENABLE_BROKER_SYNC_SCHEDULER=false',
        'ENABLE_DIVIDEND_SCHEDULER=false',
        'ENABLE_NEWS_SCHEDULER=false',
        'ENABLE_EARNINGS_SCHEDULER=false',
        'ENABLE_CATEGORY_SCHEDULER=false',
        'ENABLE_CRM_SYNC=false',
        'ENABLE_ACTIVITY_TRACKING=false',
        'ENABLE_ENGAGEMENT_TRACKING=false',
        'ENABLE_TRADE_ENRICHMENT=false',
        'ENABLE_JOB_RECOVERY=false',
        'ENABLE_BACKUP_SCHEDULER=false',
        'ENABLE_STOCK_SCANNER=false',
        'ENABLE_PUSH_NOTIFICATIONS=false',
        'npm start'
      ].join(' '),
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json'
      },
      dependencies: ['setup']
    }
  ]
})
