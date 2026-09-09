jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const { parseCSV } = require('../../src/utils/csvParser');
const { decodeIBKRFlexReport } = require('../../src/utils/ibkrFlexReport');
const { parseIBKRRecords } = require('../../src/utils/csvParser');
const grouping = require('../../src/services/optionStrategyGroupingService');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

function persisted(trades) {
  return trades.map((trade, index) => ({
    ...trade,
    id: `trade-${index}`,
    instrument_type: trade.instrumentType,
    underlying_symbol: trade.underlyingSymbol,
    expiration_date: trade.expirationDate,
    option_type: trade.optionType,
    strike_price: trade.strikePrice,
    entry_time: trade.entryTime,
    exit_time: trade.exitTime,
    trade_date: trade.tradeDate,
    account_identifier: trade.accountIdentifier
  }));
}

describe('IBKR brokerage order grouping', () => {
  test.each(contracts.ibkr_option_grouping_cases)('$id preserves order boundaries and net P&L', async fixture => {
    const combined_csv = fixture.opening_csv.trimEnd() + '\n' + fixture.closing_csv.split('\n').slice(1).join('\n');
    const result = await parseCSV(Buffer.from(combined_csv), 'ibkr', { selectedAccountId: 'TEST', userTimezone: 'America/New_York' });
    expect(result.trades).toHaveLength(16);
    const trades = persisted(result.trades);
    const groups = grouping.detectGroups(trades);
    expect(groups).toHaveLength(4);
    for (const expected of fixture.expected) {
      const group = groups.find(item => item.underlying_symbol === expected.underlying_symbol);
      expect(group).toMatchObject({
        leg_count: expected.leg_count,
        detected_strategy: expected.detected_strategy,
        classification_method: 'brokerage_order_id',
        is_completed: true
      });
      expect(group.total_pnl).toBeCloseTo(expected.net_pnl, 6);
      expect(group.classification_metadata.brokerage_order_id).toBe(`open-combo-${expected.underlying_symbol}`);
      for (const trade of group.legs) {
        const source = trades.find(item => item.id === trade.id);
        expect(source.executions).toHaveLength(2);
        expect(source.executions.map(execution => execution.brokerage_order_id)).toEqual([
          `open-combo-${expected.underlying_symbol}`, `close-combo-${expected.underlying_symbol}`
        ]);
        expect(source.executions.every(execution => execution.execution_id)).toBe(true);
      }
    }
    // Opening-only import already identifies the positions, before a close exists.
    const opened = await parseCSV(Buffer.from(fixture.opening_csv), 'ibkr', { selectedAccountId: 'TEST' });
    expect(grouping.detectGroups(persisted(opened.trades))).toHaveLength(4);
    const existing_positions = Object.fromEntries(persisted(opened.trades).map(trade =>
      [`conid_${trade.executions[0].conid}`, trade]));
    const closed = await parseCSV(Buffer.from(fixture.closing_csv), 'ibkr', {
      selectedAccountId: 'TEST', existingPositions: existing_positions
    });
    const closed_groups = grouping.detectGroups(persisted(closed.trades));
    expect(closed_groups).toHaveLength(4);
    for (const expected of fixture.expected) {
      const group = closed_groups.find(item => item.underlying_symbol === expected.underlying_symbol);
      expect(group.is_completed).toBe(true);
      expect(group.total_pnl).toBeCloseTo(expected.net_pnl, 6);
      expect(group.classification_metadata.brokerage_order_id).toBe(`open-combo-${expected.underlying_symbol}`);
    }
  });

  test('Flex XML carries brokerage order IDs through the shared sync parser', async () => {
    const report = decodeIBKRFlexReport('<FlexQueryResponse><FlexStatements><FlexStatement><Trades>' +
      '<Trade assetCategory="OPT" symbol="COF   260904C00220000" description="COF 04SEP26 220 C" conid="904325613" underlyingSymbol="COF" strike="220" expiry="20260904" putCall="C" dateTime="20260903;125000" quantity="-1" tradePrice="1.29" buySell="SELL" notes="O" brokerageOrderID="combo-1" ibOrderID="leg-1" ibExecID="fill-1" />' +
      '</Trades></FlexStatement></FlexStatements></FlexQueryResponse>');
    const result = await parseIBKRRecords(report.trade_records);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].executions[0]).toMatchObject({ brokerage_order_id: 'combo-1', order_id: 'leg-1', execution_id: 'fill-1' });
  });
});
