import { expect, test } from '@playwright/test'

let adminFixture

test.beforeEach(async ({ page, request }) => {
  const response = await request.post('http://127.0.0.1:3001/api/test-support/e2e/trade-management-fixture', {
    data: { admin: true }
  })
  expect(response.ok()).toBeTruthy()
  adminFixture = await response.json()

  await page.goto('/')
  await page.evaluate(token => {
    window.localStorage.setItem('token', token)
  }, adminFixture.token)
})

test.afterEach(async ({ request }) => {
  if (adminFixture?.user?.id) {
    await request.delete(`http://127.0.0.1:3001/api/test-support/e2e/users/${adminFixture.user.id}`)
  }
})

test('admin execution runs dashboard renders real run, SLO, alert, and retention state', async ({ page, request }) => {
  await page.goto('/admin/execution-runs')

  await expect(page.getByTestId('execution-runs-admin-view')).toBeVisible()
  await expect(page.getByText('SLO Health')).toBeVisible()
  await expect(page.getByText('Recent Runs')).toBeVisible()
  await expect(page.getByText('Backtest fixture').first()).toBeVisible()
  await expect(page.getByTestId('admin-retention-policy')).toContainText('Retention Policy')
  await expect(page.getByTestId('admin-retention-preview')).toContainText('Event rows ready')
  await expect(page.getByTestId('admin-lineage-graph')).toContainText('backtest')
  await expect(page.getByTestId('admin-alert-action-audit')).toContainText(/Alert Action Audit|No alert actions/)
  await expect(page.getByTestId('admin-workflow-settings')).toContainText('Workflow Thresholds')
  await expect(page.getByTestId('admin-performance-budgets')).toContainText('Performance Budgets')
  await expect(page.getByTestId('admin-alert-routing')).toContainText('Alert Suppression')
  await expect(page.getByTestId('admin-report-templates')).toContainText('Report Templates')

  const templatePreviewResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/report-templates/trader/preview') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-report-template-preview').click()
  await templatePreviewResponse
  await expect(page.getByTestId('admin-report-template-preview-output')).toContainText('Page 1')
  await expect(page.getByTestId('admin-report-template-pdf-thumb')).toBeVisible()
  await expect.poll(async () => page.locator('[data-testid="admin-report-template-pdf-thumb"] canvas').evaluate(canvas => canvas.width)).toBeGreaterThan(0)

  const templateResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/report-templates/trader/revisions') &&
    !response.url().includes('/preview') &&
    response.request().method() === 'POST' &&
    response.status() === 201
  )
  await page.getByTestId('admin-report-template-save').click()
  const templatePayload = await (await templateResponse).json()
  expect(templatePayload.revision.templateKey).toBe('trader')
  await expect(page.getByTestId('admin-report-template-revisions')).toContainText('pending')
  const templateApproveResponse = page.waitForResponse(response =>
    response.url().includes(`/api/admin/report-templates/revisions/${templatePayload.revision.id}/actions`) &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-report-template-approve').first().click()
  expect((await (await templateApproveResponse).json()).revision.approvalStatus).toBe('applied')

  const workflowResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/workflow-settings/trade-management/revisions') &&
    response.request().method() === 'POST' &&
    response.status() === 201
  )
  await page.getByTestId('admin-workflow-threshold').fill('10')
  await page.getByTestId('admin-workflow-window').fill('15')
  await page.getByTestId('admin-workflow-save').click()
  const workflowPayload = await (await workflowResponse).json()
  expect(workflowPayload.revision.approvalStatus).toBe('pending')
  await expect(page.getByTestId('admin-workflow-revisions')).toContainText('pending')
  const workflowApproveResponse = page.waitForResponse(response =>
    response.url().includes(`/api/admin/workflow-settings/revisions/${workflowPayload.revision.id}/actions`) &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-workflow-approve').first().click()
  expect((await (await workflowApproveResponse).json()).revision.approvalStatus).toBe('applied')

  const strategyResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/strategy-anomaly-settings') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-strategy-name').fill('breakout')
  await page.getByTestId('admin-strategy-threshold').fill('2')
  await page.getByTestId('admin-strategy-window').fill('15')
  await page.getByTestId('admin-strategy-save').click()
  expect((await (await strategyResponse).json()).settings.strategy).toBe('breakout')

  const suppressionResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/alerts/suppression-rules') &&
    response.request().method() === 'POST' &&
    response.status() === 201
  )
  await page.getByTestId('admin-suppression-save').click()
  expect((await (await suppressionResponse).json()).rule.alertType).toBe('execution_report_access_anomaly')

  const escalationResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/alerts/escalation-destinations') &&
    response.request().method() === 'POST' &&
    response.status() === 201
  )
  await page.getByTestId('admin-escalation-target').fill('ops@example.com')
  await page.getByTestId('admin-escalation-save').click()
  expect((await (await escalationResponse).json()).destination.destinationType).toBe('email')

  const filteredRuns = page.waitForResponse(response =>
    response.url().includes('/api/admin/execution-runs') &&
    response.url().includes('symbol=AAPL') &&
    response.status() === 200
  )
  await page.getByTestId('admin-lineage-symbol').fill('AAPL')
  await page.getByTestId('admin-lineage-strategy').fill('breakout')
  await page.getByTestId('admin-lineage-account').fill('E2E-ACT')
  await page.getByTestId('admin-lineage-apply').click()
  await filteredRuns
  await expect(page.getByTestId('admin-lineage-graph')).toContainText('Backtest fixture')
  const backfillResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/execution-runs/events/backfill-hashes') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-event-hash-backfill').click()
  expect((await (await backfillResponse).json()).checkedEvents).toBeGreaterThanOrEqual(1)

  const backtestRun = adminFixture.runs.find(run => run.mode === 'backtest')
  await request.patch('http://127.0.0.1:3001/api/admin/workflow-settings/trade-management', {
    headers: { Authorization: `Bearer ${adminFixture.token}` },
    data: {
      confidenceLevels: [0.9, 0.95, 0.99],
      sharedReportAccessThreshold: 2,
      sharedReportAccessWindowMinutes: 15
    }
  })
  const share = await request.post(`http://127.0.0.1:3001/api/execution-runs/${backtestRun.id}/share`, {
    headers: { Authorization: `Bearer ${adminFixture.token}` },
    data: {
      expiresInHours: 1,
      scope: {
        formats: ['json'],
        includeEvents: false,
        includeMetrics: true,
        includeReportAccesses: false,
        template: 'investor',
        recipient: 'e2e-admin'
      }
    }
  })
  const sharedToken = (await share.json()).run.shareToken
  await request.get(`http://127.0.0.1:3001/api/execution-runs/shared/${sharedToken}`)
  await request.get(`http://127.0.0.1:3001/api/execution-runs/shared/${sharedToken}`)

  const scanResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/alerts/scan') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByText('Scan Alerts').click()
  await scanResponse
  await expect(page.getByTestId('admin-alert-routing')).toContainText('ops@example.com')
  await expect(page.getByTestId('admin-delivery-retry').first()).toBeVisible()
  const retryDeliveryResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/alerts/escalation-deliveries/') &&
    response.url().includes('/retry') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-delivery-retry').first().click()
  expect((await (await retryDeliveryResponse).json()).delivery.status).toBe('skipped')
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(page.getByTestId('admin-alert-suppress').first()).toBeVisible()
  const suppressResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/alerts/') &&
    response.url().includes('/actions') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-alert-suppress').first().click()
  expect((await (await suppressResponse).json()).suppressionRule?.recurrenceRule?.frequency).toBe('daily')

  await expect(page.getByTestId('admin-retention-policy-core')).toHaveScreenshot('admin-retention-policy.png', {
    mask: [page.getByTestId('admin-retention-last-run')]
  })
  await page.evaluate(() => {
    window.localStorage.setItem('darkMode', 'true')
    document.documentElement.classList.add('dark')
  })
  await expect(page.getByTestId('admin-retention-policy-core')).toHaveScreenshot('admin-retention-policy-dark.png', {
    mask: [page.getByTestId('admin-retention-last-run')]
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(page.getByTestId('admin-retention-policy-core')).toHaveScreenshot('admin-retention-policy-mobile.png', {
    mask: [page.getByTestId('admin-retention-last-run')]
  })

  const retentionRevisionResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/retention-policy/revisions') &&
    response.request().method() === 'POST' &&
    response.status() === 201
  )
  await page.getByTestId('admin-retention-request').click()
  const revisionPayload = await (await retentionRevisionResponse).json()
  expect(revisionPayload.revision.approvalStatus).toBe('pending')
  await expect(page.getByTestId('admin-retention-revisions')).toContainText('pending')

  const approveResponse = page.waitForResponse(response =>
    response.url().includes(`/api/admin/retention-policy/revisions/${revisionPayload.revision.id}/actions`) &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-retention-approve').first().click()
  expect((await (await approveResponse).json()).revision.approvalStatus).toBe('applied')

  const retentionResponse = page.waitForResponse(response =>
    response.url().includes('/api/admin/retention-policy/run') &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('admin-retention-run').click()
  await retentionResponse
})
