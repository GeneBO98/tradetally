const {
  extractPdfText,
  reportToPdf,
  reportToPdfVisualSnapshot
} = require('../../src/utils/executionRunReportFormatters');

describe('execution run report formatters', () => {
  test('renders extractable PDF report text for audit snapshots', () => {
    const pdf = reportToPdf({
      generatedAt: '2026-05-11T14:00:00.000Z',
      run: {
        id: 'run-1',
        name: 'Backtest fixture',
        userId: 'user-1',
        mode: 'backtest',
        status: 'completed',
        source: 'trade-management',
        parentRunId: 'replay-1',
        lineageType: 'backtest_of',
        marketDataSnapshotId: 'tm-backtest-aapl',
        metrics: { totalR: 3.2, winRate: 100 },
        confidence: { totalR: { lower95: 2.8, upper95: 3.4 } }
      },
      events: [
        { createdAt: '2026-05-11T13:30:00.000Z', eventType: 'run.created' },
        { createdAt: '2026-05-11T14:00:00.000Z', eventType: 'run.status_changed' }
      ],
      reportAccesses: [
        { createdAt: '2026-05-11T14:02:00.000Z', accessType: 'owner', format: 'pdf', ipAddress: '127.0.0.1' }
      ]
    });

    const text = extractPdfText(pdf);
    const rawPdf = pdf.toString('latin1');

    expect(pdf.slice(0, 8).toString()).toBe('%PDF-1.4');
    expect(rawPdf).toContain('/Title (Backtest fixture)');
    expect(rawPdf).toContain('/Author (TradeTally)');
    expect(rawPdf).toContain('/DisplayDocTitle true');
    expect(rawPdf).toContain('/StructTreeRoot');
    expect(rawPdf).toContain('/RoleMap');
    expect(rawPdf).toContain('/S /Table');
    expect(rawPdf).toContain('/S /TH');
    expect(rawPdf).toContain('/S /TD');
    expect(rawPdf).toContain('/Type /MCR');
    expect(text).toContain('Execution Run Report');
    expect(text).toContain('Backtest fixture');
    expect(text).toContain('Mode');
    expect(text).toContain('backtest');
    expect(text).toContain('Market Snapshot ID');
    expect(text).toContain('tm-backtest-aapl');
    expect(text).toContain('totalR: 3.2');
    expect(text).toContain('run.status_changed');
    expect(text).toContain('Report Access Audit');
  });

  test('renders a stable paginated visual snapshot for PDF regression coverage', () => {
    const visual = reportToPdfVisualSnapshot({
      generatedAt: '2026-05-11T14:00:00.000Z',
      run: {
        id: 'run-1',
        name: 'Backtest fixture',
        userId: 'user-1',
        mode: 'backtest',
        status: 'completed',
        source: 'trade-management',
        config: { symbol: 'AAPL', strategy: 'ORB' },
        metrics: { totalR: 3.2, winRate: 100 },
        confidence: { totalR: { lower95: 2.8, upper95: 3.4 } }
      },
      events: Array.from({ length: 70 }, (_, index) => ({
        createdAt: `2026-05-11T14:${String(index % 60).padStart(2, '0')}:00.000Z`,
        eventType: index % 2 === 0 ? 'run.metric_updated' : 'run.status_changed',
        payload: { index }
      })),
      reportAccesses: []
    });

    expect(visual).toContain('--- page 1 ---');
    expect(visual).toContain('--- page 2 ---');
    expect(visual).toContain('Report Index');
    expect(visual).toContain('Lineage and Reproducibility');
    expect(visual).toContain('Data Provenance');
    expect(visual).toContain('Page 4 of 4');
  });
});
