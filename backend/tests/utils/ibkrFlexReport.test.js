const fs = require('fs');
const path = require('path');
const { decodeIBKRFlexReport } = require('../../src/utils/ibkrFlexReport');
const { parseIBKRRecords } = require('../../src/utils/csvParser');

describe('IBKR Flex report decoding', () => {
  const fixture = fs.readFileSync(path.join(__dirname, '../fixtures/ibkr-flex-report.xml'), 'utf8');

  test('decodes real XML trade and open-position sections', () => {
    const decoded = decodeIBKRFlexReport(fixture);

    expect(decoded.format).toBe('xml');
    expect(decoded.statements).toEqual([
      expect.objectContaining({ account_id: 'U1234567', from_date: '20250715', to_date: '20260714' })
    ]);
    expect(decoded.trade_records).toHaveLength(4);
    expect(decoded.open_position_records).toHaveLength(1);
    expect(decoded.row_counts).toEqual({ trades: 4, open_positions: 1 });
    expect(decoded.sections).toEqual({ trades: true, open_positions: true });
    expect(decoded.trade_records[2]).toMatchObject({
      Account: 'U1234567',
      Conid: '265598',
      OrderID: 'ORD00003',
      IBExecID: 'EXEC00003',
      TradeID: 'TRD00003'
    });
  });

  test('preserves same-order partial fills as distinct executions', async () => {
    const decoded = decodeIBKRFlexReport(fixture);
    const aaplRecords = decoded.trade_records.filter(record => record.Symbol === 'AAPL');
    const result = await parseIBKRRecords(aaplRecords, {}, 'ibkr');

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      symbol: 'AAPL',
      side: 'long',
      quantity: 240,
      entryPrice: 300,
      commission: 1.20072
    });
    expect(result.trades[0].executions).toHaveLength(2);
    expect(result.trades[0].executions.map(execution => execution.execution_id)).toEqual([
      'EXEC00003',
      'EXEC00004'
    ]);
  });

  test('converts timezone-less Flex executions using the user timezone', async () => {
    const decoded = decodeIBKRFlexReport([
      '<FlexQueryResponse><FlexStatements><FlexStatement><Trades>',
      '<Trade accountId="U123" assetCategory="STK" symbol="AAPL" dateTime="20260714;093000" quantity="1" tradePrice="100" buySell="BUY" levelOfDetail="EXECUTION" />',
      '</Trades></FlexStatement></FlexStatements></FlexQueryResponse>'
    ].join(''));

    const result = await parseIBKRRecords(decoded.trade_records, {
      userTimezone: 'America/New_York'
    }, 'ibkr');

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryTime).toBe('2026-07-14T13:30:00Z');
    expect(result.trades[0].executions[0].datetime).toBe('2026-07-14T13:30:00Z');
  });

  test('decodes every self-describing CSV section when Open Positions comes first', () => {
    const csv = [
      'Account,AssetClass,Symbol,Position,CostBasisPrice,Conid',
      'U123,STK,AAPL,10,100,265598',
      'Account,Symbol,DateTime,Quantity,TradePrice,IBCommission,Buy/Sell,OrderID,IBExecID,TradeID,Conid,AssetClass',
      'U123,AAPL,20260714;093000,10,100,-1,BUY,ORDER-1,EXEC-1,TRADE-1,265598,STK'
    ].join('\n');

    const decoded = decodeIBKRFlexReport(csv);
    expect(decoded.open_position_records).toHaveLength(1);
    expect(decoded.trade_records).toHaveLength(1);
  });

  test('accepts an empty XML Trades section', () => {
    const decoded = decodeIBKRFlexReport('<FlexQueryResponse><FlexStatements><FlexStatement><Trades /></FlexStatement></FlexStatements></FlexQueryResponse>');
    expect(decoded.trade_records).toEqual([]);
  });

  test('maps XML option and futures fields through the shared IBKR parser', async () => {
    const xml = [
      '<FlexQueryResponse><FlexStatements><FlexStatement><Trades>',
      '<Trade accountId="U123" currency="USD" assetCategory="OPT" symbol="AAPL" underlyingSymbol="AAPL" conid="OPT-1" strike="300" expiry="20261218" putCall="C" multiplier="100" dateTime="20260714;093000" quantity="1" tradePrice="5" ibCommission="-1" buySell="BUY" ibOrderID="O-1" ibExecID="E-1" tradeID="T-1" levelOfDetail="EXECUTION" />',
      '<Trade accountId="U123" currency="USD" assetCategory="FUT" symbol="MESZ26" underlyingSymbol="MES" conid="FUT-1" multiplier="5" dateTime="20260714;100000" quantity="1" tradePrice="6000" ibCommission="-1" buySell="BUY" ibOrderID="O-2" ibExecID="E-2" tradeID="T-2" levelOfDetail="EXECUTION" />',
      '</Trades></FlexStatement></FlexStatements></FlexQueryResponse>'
    ].join('');
    const decoded = decodeIBKRFlexReport(xml);
    const result = await parseIBKRRecords(decoded.trade_records, {}, 'ibkr');

    expect(result.trades).toEqual(expect.arrayContaining([
      expect.objectContaining({
        symbol: 'AAPL',
        instrumentType: 'option',
        strikePrice: 300,
        expirationDate: '2026-12-18',
        optionType: 'call',
        contractSize: 100
      }),
      expect.objectContaining({ instrumentType: 'future', underlyingAsset: 'MES', pointValue: 5 })
    ]));
  });

  test('reconstructs long and short XML options through expiration and assignment rows', async () => {
    const xml = [
      '<FlexQueryResponse><FlexStatements><FlexStatement><Trades>',
      '<Trade accountId="U123" assetCategory="OPT" symbol="AAPL" underlyingSymbol="AAPL" conid="CALL-1" strike="300" expiry="20261218" putCall="C" multiplier="100" dateTime="20260714;093000" quantity="1" tradePrice="5" ibCommission="-1" buySell="BUY" notes="O" ibExecID="CALL-E1" tradeID="CALL-T1" levelOfDetail="EXECUTION" />',
      '<Trade accountId="U123" assetCategory="OPT" symbol="AAPL" underlyingSymbol="AAPL" conid="CALL-1" strike="300" expiry="20261218" putCall="C" multiplier="100" dateTime="20261218;160000" quantity="-1" tradePrice="0" ibCommission="0" buySell="SELL" notes="C" ibExecID="CALL-E2" tradeID="CALL-T2" levelOfDetail="EXECUTION" />',
      '<Trade accountId="U123" assetCategory="OPT" symbol="MSFT" underlyingSymbol="MSFT" conid="PUT-1" strike="400" expiry="20261218" putCall="P" multiplier="100" dateTime="20260714;100000" quantity="-2" tradePrice="4" ibCommission="-1" buySell="SELL" notes="O" ibExecID="PUT-E1" tradeID="PUT-T1" levelOfDetail="EXECUTION" />',
      '<Trade accountId="U123" assetCategory="OPT" symbol="MSFT" underlyingSymbol="MSFT" conid="PUT-1" strike="400" expiry="20261218" putCall="P" multiplier="100" dateTime="20261218;160000" quantity="2" tradePrice="0" ibCommission="0" buySell="BUY" notes="A" ibExecID="PUT-E2" tradeID="PUT-T2" levelOfDetail="EXECUTION" />',
      '</Trades></FlexStatement></FlexStatements></FlexQueryResponse>'
    ].join('');
    const decoded = decodeIBKRFlexReport(xml);
    const result = await parseIBKRRecords(decoded.trade_records, {}, 'ibkr');

    expect(result.trades).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'AAPL', side: 'long', quantity: 1, exitPrice: 0, instrumentType: 'option' }),
      expect.objectContaining({ symbol: 'MSFT', side: 'short', quantity: 2, exitPrice: 0, instrumentType: 'option' })
    ]));
    expect(result.trades.every(trade => trade.executions.length === 2)).toBe(true);
  });

  test('merges executions across report boundaries before reconstructing trades', async () => {
    const first = decodeIBKRFlexReport('<?xml version="1.0"?><FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" fromDate="20251231" toDate="20251231"><Trades><Trade accountId="U1" assetCategory="STK" symbol="AAPL" conid="265598" dateTime="20251231;155900" quantity="10" tradePrice="100" ibCommission="-1" buySell="BUY" ibExecID="E-1" tradeID="T-1" levelOfDetail="EXECUTION" /></Trades></FlexStatement></FlexStatements></FlexQueryResponse>');
    const second = decodeIBKRFlexReport('<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" fromDate="20260101" toDate="20260101"><Trades><Trade accountId="U1" assetCategory="STK" symbol="AAPL" conid="265598" dateTime="20260101;093000" quantity="10" tradePrice="105" ibCommission="-1" buySell="SELL" ibExecID="E-2" tradeID="T-2" levelOfDetail="EXECUTION" /></Trades></FlexStatement></FlexStatements></FlexQueryResponse>');
    const result = await parseIBKRRecords([...first.trade_records, ...second.trade_records], {}, 'ibkr');

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'AAPL', quantity: 10, entryPrice: 100, exitPrice: 105, commission: 2
    }));
    expect(result.trades[0].executions).toHaveLength(2);
  });

  test('parses mixed Flex CSV header aliases across independently decoded windows', async () => {
    const first = decodeIBKRFlexReport([
      'Account,AssetClass,Symbol,Position,CostBasisPrice,Conid',
      'U1,STK,AAPL,10,100,265598',
      'ClientAccountID,AssetClass,Symbol,Conid,DateTime,Quantity,TradePrice,IBCommission,BuySell,LevelOfDetail,IBOrderID,IBExecID,TradeID',
      'U1,STK,AAPL,265598,20251231;155900,10,100,-0.50,BUY,EXECUTION,O-1,E-1,T-1'
    ].join('\n'));
    const second = decodeIBKRFlexReport([
      'accountId,assetCategory,symbol,conid,dateTime,quantity,tradePrice,ibCommission,buySell,levelOfDetail,ibOrderID,ibExecID,tradeID',
      'U1,STK,AAPL,265598,20260101;093000,10,105,-0.75,SELL,EXECUTION,O-2,E-2,T-2'
    ].join('\n'));

    const result = await parseIBKRRecords(
      [...first.trade_records, ...second.trade_records],
      {},
      'ibkr'
    );

    expect(first.open_position_records).toHaveLength(1);
    expect(result.diagnostics).toEqual(expect.objectContaining({ skippedRows: 0 }));
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'AAPL',
      quantity: 10,
      entryPrice: 100,
      exitPrice: 105,
      commission: 1.25
    }));
    expect(result.trades[0].executions.map(execution => execution.execution_id)).toEqual(['E-1', 'E-2']);
  });

  test('supports declarations, BOM, whitespace, and multiple statements and accounts', () => {
    const xml = '\uFEFF  <?xml version="1.0" encoding="UTF-8"?>\n<FlexQueryResponse><FlexStatements count="2"><FlexStatement accountId="U1" fromDate="20260101" toDate="20260102"><Trades /></FlexStatement><FlexStatement accountId="U2" fromDate="20260101" toDate="20260102"><OpenPositions /></FlexStatement></FlexStatements></FlexQueryResponse>  ';
    const decoded = decodeIBKRFlexReport(xml);

    expect(decoded.statements.map(statement => statement.account_id)).toEqual(['U1', 'U2']);
    expect(decoded.trade_records).toEqual([]);
    expect(decoded.open_position_records).toEqual([]);
    expect(decoded.sections).toEqual({ trades: true, open_positions: true });
  });

  test('rejects DOCTYPE and incomplete XML', () => {
    expect(() => decodeIBKRFlexReport('<!DOCTYPE foo><FlexQueryResponse></FlexQueryResponse>'))
      .toThrow('DOCTYPE');
    expect(() => decodeIBKRFlexReport('<FlexQueryResponse><Trades>'))
      .toThrow('malformed or incomplete');
    expect(() => decodeIBKRFlexReport('<FlexQueryResponse><Trades><Trade></Trades></FlexQueryResponse>'))
      .toThrow('malformed XML');
  });
});
