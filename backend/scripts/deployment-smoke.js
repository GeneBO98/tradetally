const axios = require('axios');
const fs = require('fs');
const path = require('path');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const token = process.env.SMOKE_TOKEN || '';
const outputDir = process.env.SMOKE_OUTPUT_DIR || path.join(process.cwd(), '..', 'test-results', 'deployment-smoke');

function client(extraHeaders = {}) {
  return axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    },
    validateStatus: status => status < 500
  });
}

async function createRun(api) {
  const response = await api.post('/api/execution-runs', {
    mode: 'backtest',
    name: `Deployment smoke ${new Date().toISOString()}`,
    status: 'completed',
    source: 'deployment-smoke',
    config: {
      symbol: 'SMOKE',
      strategy: 'deployment',
      accountId: 'smoke-account',
      instrumentType: 'equity'
    },
    metrics: {
      tradeCount: 1,
      totalR: 0,
      expectancy: 0
    },
    marketDataSnapshot: {
      symbol: 'SMOKE',
      strategy: 'deployment',
      capturedAt: new Date().toISOString()
    }
  });
  if (response.status !== 201) {
    throw new Error(`Create run failed with ${response.status}: ${JSON.stringify(response.data)}`);
  }
  return response.data.run;
}

async function main() {
  if (!token) {
    throw new Error('SMOKE_TOKEN is required so the smoke test can create and share a run safely.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const api = client();
  const run = await createRun(api);

  const pdfResponse = await api.get(`/api/execution-runs/${run.id}/report`, {
    params: { format: 'pdf', template: 'investor', watermark: 'Deployment smoke' },
    responseType: 'arraybuffer'
  });
  if (pdfResponse.status !== 200 || !String(pdfResponse.headers['content-type'] || '').includes('application/pdf')) {
    throw new Error(`PDF export failed with ${pdfResponse.status}`);
  }
  fs.writeFileSync(path.join(outputDir, `execution-run-${run.id}.pdf`), Buffer.from(pdfResponse.data));

  const shareResponse = await api.post(`/api/execution-runs/${run.id}/share`, {
    expiresInHours: 1,
    scope: {
      formats: ['json'],
      includeEvents: false,
      includeMetrics: true,
      includeReportAccesses: false,
      template: 'investor',
      recipient: 'deployment-smoke',
      watermark: 'Deployment smoke'
    }
  });
  if (shareResponse.status !== 200 || !shareResponse.data.run?.shareToken) {
    throw new Error(`Share failed with ${shareResponse.status}`);
  }

  const sharedApi = client({ Authorization: undefined });
  const sharedJson = await sharedApi.get(`/api/execution-runs/shared/${shareResponse.data.run.shareToken}`);
  if (sharedJson.status !== 200 || sharedJson.data.report?.run?.id !== run.id) {
    throw new Error(`Scoped shared JSON failed with ${sharedJson.status}`);
  }

  const sharedPdf = await sharedApi.get(`/api/execution-runs/shared/${shareResponse.data.run.shareToken}`, {
    params: { format: 'pdf' }
  });
  if (sharedPdf.status !== 403) {
    throw new Error(`Scoped shared PDF should be forbidden; received ${sharedPdf.status}`);
  }

  console.log(JSON.stringify({
    success: true,
    runId: run.id,
    sharedJsonStatus: sharedJson.status,
    scopedPdfStatus: sharedPdf.status
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
