const fs = require('fs');
const path = require('path');
const Module = require('module');

const rootDir = path.resolve(__dirname, '..');
const corpusPath = path.join(rootDir, 'tests/fixtures/brokerImportCorpus.v1.json');
const baselinePath = path.join(rootDir, 'tests/fixtures/brokerImportCorpus.v1.baseline.json');
const outputDir = path.join(rootDir, 'test-results');
const outputPath = path.join(outputDir, 'broker-import-corpus-current.json');
const diffPath = path.join(outputDir, 'broker-import-corpus-diff.json');
const markdownDiffPath = path.join(outputDir, 'broker-import-corpus-diff.md');

const originalLoad = Module._load;
Module._load = function loadWithParserMocks(request, parent, isMain) {
  if (request.endsWith('/config/database') || request.endsWith('/src/config/database') || request === '../config/database') {
    return { query: async () => ({ rows: [] }) };
  }
  if (request.endsWith('/utils/logger') || request === '../utils/logger') {
    return { info() {}, warn() {}, error() {}, debug() {} };
  }
  if (request.endsWith('/utils/finnhub') || request === './finnhub') return {};
  if (request.endsWith('/utils/cache') || request === './cache') return { get: () => null, set() {}, del() {}, data: {} };
  if (request.endsWith('/utils/cusipQueue') || request === './cusipQueue') return { addToQueue() {} };
  if (request.endsWith('/utils/currencyConverter') || request === './currencyConverter') {
    return { convertTradeToUSD: trade => trade, userHasProAccess: async () => false };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { parseCSV } = require('../src/utils/csvParser');
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

function snapshotImportResult(result) {
  return {
    tradeCount: result.trades.length,
    diagnostics: result.diagnostics,
    trades: result.trades.map(trade => ({
      symbol: trade.symbol,
      side: trade.side,
      instrumentType: trade.instrumentType,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      status: trade.status,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      pnl: trade.pnl,
      commission: trade.commission,
      executions: (trade.executions || []).map(execution => ({
        action: execution.action,
        quantity: execution.quantity,
        price: execution.price,
        datetime: execution.datetime,
        orderId: execution.orderId
      }))
    }))
  };
}

function diffObjects(before, after) {
  const diffs = [];
  const names = new Set([
    ...(before.fixtures || []).map(item => item.name),
    ...(after.fixtures || []).map(item => item.name)
  ]);
  for (const name of names) {
    const previous = (before.fixtures || []).find(item => item.name === name);
    const current = (after.fixtures || []).find(item => item.name === name);
    if (!previous) {
      diffs.push({ name, type: 'added' });
    } else if (!current) {
      diffs.push({ name, type: 'removed' });
    } else if (JSON.stringify(previous.result) !== JSON.stringify(current.result)) {
      diffs.push({ name, type: 'changed', before: previous.result, after: current.result });
    }
  }
  return diffs;
}

function renderDiffMarkdown(corpusVersion, diffs) {
  const lines = [
    `# Broker Import Corpus Diff`,
    '',
    `Corpus: \`${corpusVersion}\``,
    `Generated: ${new Date().toISOString()}`,
    `Diff count: ${diffs.length}`,
    ''
  ];

  if (diffs.length === 0) {
    lines.push('No fixture behavior changes detected.', '');
    return lines.join('\n');
  }

  diffs.forEach(diff => {
    lines.push(`## ${diff.name}`);
    lines.push('');
    lines.push(`Type: \`${diff.type}\``);
    if (diff.before || diff.after) {
      lines.push('');
      lines.push('| Metric | Before | After |');
      lines.push('| --- | ---: | ---: |');
      lines.push(`| Trade count | ${diff.before?.tradeCount ?? '-'} | ${diff.after?.tradeCount ?? '-'} |`);
      lines.push(`| Diagnostics | ${(diff.before?.diagnostics || []).length} | ${(diff.after?.diagnostics || []).length} |`);
      lines.push('');
      lines.push('<details><summary>Before snapshot</summary>');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(diff.before || null, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
      lines.push('<details><summary>After snapshot</summary>');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(diff.after || null, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('</details>');
    }
    lines.push('');
  });

  return lines.join('\n');
}

async function main() {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const fixtures = [...corpus.contractFixtures, ...corpus.edgeCaseFixtures];
  const current = {
    corpusVersion: corpus.corpusVersion,
    generatedAt: new Date().toISOString(),
    fixtures: []
  };

  for (const fixture of fixtures) {
    if (process.env.BROKER_IMPORT_DIFF_VERBOSE !== 'true') {
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
    }
    let result;
    try {
      result = await parseCSV(Buffer.from(fixture.csv, 'utf8'), fixture.broker, {});
    } finally {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    }
    current.fixtures.push({
      name: fixture.name,
      broker: fixture.broker,
      result: snapshotImportResult(result)
    });
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(current, null, 2)}\n`);

  if (process.env.UPDATE_BROKER_IMPORT_BASELINE === 'true' || !fs.existsSync(baselinePath)) {
    fs.writeFileSync(baselinePath, `${JSON.stringify({ ...current, generatedAt: null }, null, 2)}\n`);
    originalConsole.log(JSON.stringify({ outputPath, baselinePath, updatedBaseline: true }));
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const diffs = diffObjects(baseline, current);
  fs.writeFileSync(diffPath, `${JSON.stringify({ corpusVersion: corpus.corpusVersion, diffs }, null, 2)}\n`);
  fs.writeFileSync(markdownDiffPath, renderDiffMarkdown(corpus.corpusVersion, diffs));
  originalConsole.log(JSON.stringify({ outputPath, diffPath, markdownDiffPath, diffCount: diffs.length }));
  if (process.env.BROKER_IMPORT_DIFF_FAIL_ON_CHANGE === 'true' && diffs.length > 0) {
    throw new Error(`Broker import corpus diff detected ${diffs.length} changed fixture(s)`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
