import { expect, test } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { extractPdfText } = require('../../backend/src/utils/executionRunReportFormatters')
const fixtureFile = path.join(__dirname, '.auth/trade-management-fixture.json')
const screenshotDir = path.join(__dirname, '../test-results')

function readFixture() {
  return JSON.parse(fs.readFileSync(fixtureFile, 'utf8'))
}

async function renderPdfRaster(page, pdfPath) {
  const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64')
  const rendererOrigin = 'http://127.0.0.1:5173/__pdf_raster__'
  const rendererHtml = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; background: #e5e7eb; }
          main { width: 850px; margin: 0 auto; padding: 32px 0; }
          canvas { display: block; width: 100%; height: auto; background: white; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.18); }
          pre { color: #991b1b; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <main data-testid="pdf-raster-shell"><canvas data-testid="pdf-raster"></canvas><pre data-testid="pdf-error"></pre></main>
        <script type="module">
          try {
            const pdfjsLib = await import('./pdf.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
            const raw = atob('${pdfBase64}');
            const bytes = new Uint8Array(raw.length);
            for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const firstPage = await pdf.getPage(1);
            const viewport = firstPage.getViewport({ scale: 1.35 });
            const canvas = document.querySelector('[data-testid="pdf-raster"]');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            await firstPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            document.body.dataset.ready = 'true';
          } catch (error) {
            document.querySelector('[data-testid="pdf-error"]').textContent = error && error.stack ? error.stack : String(error);
            document.body.dataset.ready = 'error';
          }
        </script>
      </body>
    </html>`
  await page.route(`${rendererOrigin}/index.html`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: rendererHtml
  }))
  await page.route(`${rendererOrigin}/pdf.mjs`, route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: fs.readFileSync(pdfjsPath, 'utf8')
  }))
  await page.route(`${rendererOrigin}/pdf.worker.mjs`, route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: fs.readFileSync(workerPath, 'utf8')
  }))
  await page.goto(`${rendererOrigin}/index.html`)
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || document.body.dataset.ready === 'error')
  const state = await page.evaluate(() => ({
    ready: document.body.dataset.ready,
    error: document.querySelector('[data-testid="pdf-error"]').textContent
  }))
  expect(state.error).toBe('')
  expect(state.ready).toBe('true')
}

test.afterAll(async ({ request }) => {
  if (!fs.existsSync(fixtureFile)) return
  const fixture = readFixture()
  if (fixture.user?.id) {
    await request.delete(`http://127.0.0.1:3001/api/test-support/e2e/users/${fixture.user.id}`)
  }
})

test('trade management uses database fixtures for runs, reports, sharing, and visual coverage', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true })
  const fixture = readFixture()

  await page.goto('/analysis/trade-management')

  await expect(page.getByTestId('trade-management-view')).toBeVisible()
  await expect(page.getByTestId('execution-run-panel')).toBeVisible()
  await expect(page.getByTestId('r-performance-loaded')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /AAPL/ })).toBeVisible()
  await expect(page.getByTestId('execution-run-mode-label')).toHaveText('Live')
  await expect(page.getByTestId('execution-run-comparison')).toContainText('Total R')
  await expect(page.getByTestId('execution-run-comparison')).toContainText('3.20')
  await expect(page.getByTestId('execution-run-lineage')).toContainText('Snapshot')
  await expect(page.getByTestId('execution-run-lineage-graph')).toContainText('backtest')
  await expect(page.getByTestId('execution-run-confidence-levels')).toContainText('99%')

  await expect(page.getByTestId('execution-run-panel')).toHaveScreenshot('trade-management-sync-panel.png')
  await page.evaluate(() => {
    window.localStorage.setItem('darkMode', 'true')
    document.documentElement.classList.add('dark')
  })
  await expect(page.getByTestId('execution-run-panel')).toHaveScreenshot('trade-management-sync-panel-dark.png')
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(page.getByTestId('execution-run-panel')).toHaveScreenshot('trade-management-sync-panel-mobile.png')
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.getByTestId('execution-run-mode-replay').click()
  await expect(page.getByTestId('execution-run-mode-label')).toHaveText('Replay')

  await page.getByTestId('execution-run-mode-backtest').click()
  await expect(page.getByTestId('execution-run-mode-label')).toHaveText('Backtest')

  const createRunResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/execution-runs' &&
    response.request().method() === 'POST' &&
    response.status() === 201
  )
  await page.getByTestId('execution-run-start').click()
  const createdRun = (await (await createRunResponse).json()).run
  expect(createdRun.userId).toBe(fixture.user.id)
  expect(createdRun.mode).toBe('backtest')
  expect(createdRun.parentRunId).toBe(fixture.runs.find(run => run.mode === 'replay').id)
  expect(createdRun.lineageType).toBe('backtest_of')
  expect(createdRun.marketDataSnapshotId).toContain('tm-backtest-')
  await expect(page.getByTestId('execution-run-status')).toContainText('running')

  await page.setViewportSize({ width: 390, height: 900 })
  await expect(page.getByTestId('execution-run-share-controls')).toBeVisible()
  const completeResponse = page.waitForResponse(response =>
    response.url().includes(`/api/execution-runs/${createdRun.id}`) &&
    response.request().method() === 'PATCH' &&
    response.status() === 200
  )
  await page.getByTestId('execution-run-complete').click()
  expect((await (await completeResponse).json()).run.status).toBe('completed')
  await expect(page.getByTestId('execution-run-status')).toContainText('completed')
  await page.getByTestId('execution-run-mode-live').click()
  await expect(page.getByTestId('execution-run-mode-label')).toHaveText('Live')
  await page.getByTestId('execution-run-mode-backtest').click()
  await expect(page.getByTestId('execution-run-mode-label')).toHaveText('Backtest')

  const shareResponse = page.waitForResponse(response =>
    response.url().includes(`/api/execution-runs/${createdRun.id}/share`) &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await expect(page.getByTestId('execution-run-share-accounts')).toContainText('E2E-ACT')
  await page.getByTestId('execution-run-share-account-E2E-ACT').check()
  await page.getByTestId('execution-run-share').click()
  const sharePayload = await (await shareResponse).json()
  expect(sharePayload.run.shareToken).toBeTruthy()
  expect(sharePayload.run.shareToken).toMatch(/^v1\./)
  expect(sharePayload.run.shareExpiresAt).toBeTruthy()
  expect(sharePayload.run.shareScope.formats).toContain('pdf')
  expect(sharePayload.run.shareScope.accountIds).toContain('E2E-ACT')
  await expect(page.getByTestId('execution-run-share-url')).toContainText('/api/execution-runs/shared/')
  await expect(page.getByTestId('execution-run-share-controls')).toContainText('Formats')
  const firstShareToken = sharePayload.run.shareToken
  const rotateResponse = page.waitForResponse(response =>
    response.url().includes(`/api/execution-runs/${createdRun.id}/share`) &&
    response.request().method() === 'POST' &&
    response.status() === 200
  )
  await page.getByTestId('execution-run-share-rotate').click()
  const rotatePayload = await (await rotateResponse).json()
  expect(rotatePayload.run.shareToken).toBeTruthy()
  expect(rotatePayload.run.shareToken).not.toBe(firstShareToken)
  await expect(page.getByTestId('execution-run-share-audits')).toContainText(/rotate|share/)
  await page.setViewportSize({ width: 1280, height: 720 })

  const reportResponse = page.waitForResponse(response =>
    response.url().includes(`/api/execution-runs/${createdRun.id}/report`) &&
    response.request().method() === 'GET' &&
    response.status() === 200
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('execution-run-report').click()
  const reportPayload = await (await reportResponse).json()
  const jsonDownload = await downloadPromise
  await jsonDownload.saveAs(path.join(screenshotDir, `execution-run-${createdRun.id}.json`))
  expect(reportPayload.report.run.id).toBe(createdRun.id)
  expect(reportPayload.report.events.length).toBeGreaterThan(0)

  const pdfResponse = page.waitForResponse(response =>
    response.url().includes(`/api/execution-runs/${createdRun.id}/report`) &&
    response.url().includes('format=pdf') &&
    response.request().method() === 'GET' &&
    response.status() === 200
  )
  const pdfDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('execution-run-report-pdf').click()
  expect((await pdfResponse).headers()['content-type']).toContain('application/pdf')
  const pdfDownload = await pdfDownloadPromise
  const pdfPath = path.join(screenshotDir, `execution-run-${createdRun.id}.pdf`)
  await pdfDownload.saveAs(pdfPath)
  const pdfText = extractPdfText(fs.readFileSync(pdfPath))
  expect(pdfText).toContain('Execution Run Report')
  expect(pdfText).toContain('Run ID')
  expect(pdfText).toContain(createdRun.id)
  expect(pdfText).toContain('Data Provenance')
  const pdfPage = await page.context().newPage()
  await pdfPage.setViewportSize({ width: 850, height: 1100 })
  await renderPdfRaster(pdfPage, pdfPath)
  await expect(pdfPage.getByTestId('pdf-raster-shell')).toHaveScreenshot('execution-run-report-pdf-raster.png', {
    maxDiffPixelRatio: 0.02
  })
  await pdfPage.close()

  await expect(page.getByTestId('execution-run-unshare')).toBeDisabled()
  const unshareResponse = page.waitForResponse(response =>
    response.url().includes(`/api/execution-runs/${createdRun.id}/share`) &&
    response.request().method() === 'DELETE' &&
    response.status() === 200
  )
  await page.getByTestId('execution-run-unshare-reason').fill('E2E revocation audit')
  await page.getByTestId('execution-run-unshare').click()
  expect((await (await unshareResponse).json()).run.shareToken).toBeFalsy()

  const screenshot = await page.screenshot({
    path: path.join(screenshotDir, 'trade-management-db-backed.png'),
    fullPage: true
  })
  expect(screenshot.length).toBeGreaterThan(10000)
})
