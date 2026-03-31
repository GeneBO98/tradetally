const { parseCSV, detectBrokerFormat } = require('../../src/utils/csvParser');

describe('csvParser Tradervue support', () => {
  const tradervueCsv = `Open Datetime,Close Datetime,Symbol,Side,Volume,Exec Count,Entry Price,Exit Price,Gross P&L,Gross P&L (%),Shared,Notes,Tags
2025-10-24 08:00:00,2025-10-24 08:01:00,GNLN,L,200,2,4.4097,4.79,76.06,8.62,false,first trade,"personal,breakout"
2025-10-24 08:05:00,2025-10-24 08:06:00,GNLN,L,200,2,4.9397,5.12,36.06,3.65,false,second trade,personal
2025-10-24 09:00:00,2025-10-24 09:04:00,SOAR,S,200,2,4.36,4.13,46.0,5.28,false,short trade,fade`;

  test('auto-detects Tradervue completed-trade exports', () => {
    expect(detectBrokerFormat(Buffer.from(tradervueCsv, 'utf8'))).toBe('tradervue');
  });

  test('parses completed trades without grouping separate round trips together', async () => {
    const result = await parseCSV(Buffer.from(tradervueCsv, 'utf8'), 'auto', {
      tradeGroupingSettings: { enabled: true, timeGapMinutes: 60 }
    });

    expect(result.trades).toHaveLength(3);

    expect(result.trades[0]).toMatchObject({
      symbol: 'GNLN',
      side: 'long',
      tradeDate: '2025-10-24',
      entryTime: '2025-10-24T08:00:00',
      exitTime: '2025-10-24T08:01:00',
      quantity: 200,
      entryPrice: 4.4097,
      exitPrice: 4.79,
      pnl: 76.06,
      tags: ['personal', 'breakout']
    });

    expect(result.trades[1]).toMatchObject({
      symbol: 'GNLN',
      side: 'long',
      entryTime: '2025-10-24T08:05:00',
      exitTime: '2025-10-24T08:06:00'
    });

    expect(result.trades[2]).toMatchObject({
      symbol: 'SOAR',
      side: 'short',
      entryTime: '2025-10-24T09:00:00',
      exitTime: '2025-10-24T09:04:00',
      tags: ['fade']
    });
  });
});
