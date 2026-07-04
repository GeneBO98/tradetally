/**
 * CSV Parser Broker Detection Tests
 * Tests detectBrokerFormat() with sample header lines for each supported broker
 */

jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { detectBrokerFormat } = require('../../src/utils/csvParser');

function buf(str) {
  return Buffer.from(str, 'utf-8');
}

describe('detectBrokerFormat', () => {
  test('detects Lightspeed from headers', () => {
    const csv = 'Trade Number,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC\n1,09:30,AAPL,B,100,150.00,1.00,0.01';
    expect(detectBrokerFormat(buf(csv))).toBe('lightspeed');
  });

  test('detects Lightspeed with alternate headers', () => {
    const csv = 'Sequence Number,Raw Exec. Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC\n1,09:30,AAPL,B,100,150.00,1.00,0.01';
    expect(detectBrokerFormat(buf(csv))).toBe('lightspeed');
  });

  test('detects Schwab completed trades format', () => {
    const csv = 'Symbol,Quantity,Cost Per Share,Proceeds Per Share,Opened Date,Closed Date,Gain/Loss\nAAPL,100,150.00,155.00,01/01/2025,01/02/2025,500.00';
    expect(detectBrokerFormat(buf(csv))).toBe('schwab');
  });

  test('detects Schwab transaction format', () => {
    const csv = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n01/01/2025,Buy,AAPL,Apple Inc,100,150.00,0.00,-15000.00';
    expect(detectBrokerFormat(buf(csv))).toBe('schwab');
  });

  test('detects ThinkorSwim from DATE, TIME, TYPE, REF #, DESCRIPTION', () => {
    const csv = 'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,Amount,Balance\n01/01/2025,09:30:00,TRD,12345,BOT +100 AAPL @150.00,0.00,-1.00,-15000.00,50000.00';
    expect(detectBrokerFormat(buf(csv))).toBe('thinkorswim');
  });

  test('detects TradingView performance export', () => {
    const csv = 'buyFillId,sellFillId,symbol,qty,buyPrice,sellPrice,boughtTimestamp,soldTimestamp,pnl\n1,2,AAPL,100,150.00,155.00,1704067200,1704153600,500.00';
    expect(detectBrokerFormat(buf(csv))).toBe('tradingview');
  });

  test('detects TradingView paper trading format', () => {
    const csv = 'symbol,qty,buyPrice,sellPrice,boughtTimestamp,soldTimestamp,status\nAAPL,100,150.00,155.00,1704067200,1704153600,closed';
    expect(detectBrokerFormat(buf(csv))).toBe('tradingview');
  });

  test('detects TradingView futures transactions', () => {
    const csv = 'Symbol,Side,Qty,Fill Price,Order ID,Leverage,Placing Time,Closing Time\nESM24,Buy,1,5000.00,123,50,1704067200,1704153600';
    expect(detectBrokerFormat(buf(csv))).toBe('tradingview');
  });

  test('detects IBKR Activity Statement format', () => {
    const csv = 'Symbol,Date/Time,Quantity,Price,Commission,Fees\nAAPL,20250101;093000,100,150.00,-1.00,0.00';
    expect(detectBrokerFormat(buf(csv))).toBe('ibkr');
  });

  test('detects IBKR Trade Confirmation format', () => {
    const csv = 'Symbol,UnderlyingSymbol,Strike,Expiry,Put/Call,Multiplier,Buy/Sell,Date/Time,Quantity,Price,Commission\nAAPL230120C00150000,AAPL,150,20230120,C,100,BUY,20230120;093000,1,5.00,-1.00';
    expect(detectBrokerFormat(buf(csv))).toBe('ibkr_trade_confirmation');
  });

  test('detects IBKR multi-section Activity Statement (Trades section)', () => {
    const csv = [
      'Statement,Header,Field Name,Field Value',
      'Statement,Data,Title,Activity Statement',
      'Account Information,Header,Field Name,Field Value',
      'Account Information,Data,Account,U1234567',
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
      'Trades,Data,Order,Stocks,USD,AAPL,"2026-01-05, 09:30:00",100,150.00,150.00,-15000,-1.00,15001,0,0,O'
    ].join('\n');
    expect(detectBrokerFormat(buf(csv))).toBe('ibkr');
  });

  test('detects CapTrader Activity Statement via German Feldname/Feldwert headers', () => {
    const csv = [
      'Statement,Header,Feldname,Feldwert',
      'Statement,Data,Title,Transaction History',
      'Summary,Header,Feldname,Feldwert',
      'Summary,Data,Basiswährung,EUR',
      'Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Price Currency,Gross Amount ,Commission,Net Amount',
      'Transaction History,Data,2026-05-14,U***50777 Trading,MCL JUN26,Buy,MCLM6,2.0,99.94,USD,-17128.5,-2.14,208.66'
    ].join('\n');
    expect(detectBrokerFormat(buf(csv))).toBe('captrader');
  });

  test('detects CapTrader Activity Statement via CapTrader GmbH master name', () => {
    const csv = [
      'Statement,Header,Field Name,Field Value',
      'Statement,Data,Title,Activity Statement',
      'Account Information,Header,Field Name,Field Value',
      'Account Information,Data,Master Name,CapTrader GmbH',
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
      'Trades,Data,Order,Stocks,EUR,8TRA,"2026-02-10, 10:01:14",100,36.42,36.18,-3642,-3.64,3646,0,-24,O'
    ].join('\n');
    expect(detectBrokerFormat(buf(csv))).toBe('captrader');
  });

  test('detects E*TRADE format', () => {
    const csv = 'Transaction Date,Transaction Type,Symbol,Quantity,Price,Commission,Fees\n01/01/2025,Buy,AAPL,100,150.00,6.95,0.00';
    expect(detectBrokerFormat(buf(csv))).toBe('etrade');
  });

  test('detects Firstrade format', () => {
    const csv = 'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType\nSPY,1,600.00,BUY,SPDR S&P 500 ETF TRUST,2025-02-10,2025-02-11,0.00,-600.00,0.00,0.00,78462F103,Trade';
    expect(detectBrokerFormat(buf(csv))).toBe('firstrade');
  });

  test('detects Webull standard format', () => {
    const csv = 'Name,Symbol,Side,Status,Filled,Price,Time-in-Force,Placed Time,Filled Time\nApple Inc,AAPL,Buy,Filled,100,150.00,Day,01/01/2025 09:30,01/01/2025 09:30';
    expect(detectBrokerFormat(buf(csv))).toBe('webull');
  });

  test('detects Webull alternate format', () => {
    const csv = 'Symbol,B/S,Side Type,Qty,Filled Qty,Filled Avg Price,Filled Time,Status\nAAPL,Buy,Long,100,100,150.00,01/01/2025 09:30,Filled';
    expect(detectBrokerFormat(buf(csv))).toBe('webull');
  });

  test('detects ProjectX format', () => {
    const csv = 'ContractName,EnteredAt,ExitedAt,PnL,TradeDuration,EntryPrice,ExitPrice\nESM24,2025-01-01T09:30:00,2025-01-01T10:00:00,500.00,00:30:00,5000.00,5010.00';
    expect(detectBrokerFormat(buf(csv))).toBe('projectx');
  });

  test('detects Tradovate format', () => {
    const csv = 'orderId,B/S,Contract,Product,Fill Time,avgPrice,filledQty\n123,Buy,ESM4,ES,01/01/2025 09:30,5000.00,1';
    expect(detectBrokerFormat(buf(csv))).toBe('tradovate');
  });

  test('detects Tradovate paired trades format', () => {
    const csv = 'Position ID,Timestamp,Trade Date,Net Pos,Net Price,Bought,Avg. Buy,Sold,Avg. Sell,Account,Contract,Product,Product Description,_priceFormat,_priceFormatType,_tickSize,Pair ID,Buy Fill ID,Sell Fill ID,Paired Qty,Buy Price,Sell Price,P/L,Currency,Bought Timestamp,Sold Timestamp\n465747740010,04/09/2026 17:14:44,2026-04-09,0,,24,25065.97,24,25061.03,APEX4977960000002,MNQM6,MNQ,Micro E-mini NASDAQ-100,-2,0,0.25,465747740223,465747740203,465747740221,5,25073.25,25072.00,-12.50,USD,04/09/2026 17:14:44,04/09/2026 17:14:44';
    expect(detectBrokerFormat(buf(csv))).toBe('tradovate');
  });

  test('detects Questrade format', () => {
    const csv = 'Symbol,Action,Fill Qty,Fill Price,Exec Time,Commission\nAAPL,Buy,100,150.00,01/01/2025 09:30,4.95';
    expect(detectBrokerFormat(buf(csv))).toBe('questrade');
  });

  test('detects TradeStation format', () => {
    const csv = 'Account,T/D,S/D,Exec Time,Symbol,Side,Qty,Price,Gross Proceeds\n12345,01/01/2025,01/03/2025,09:30,AAPL,Buy,100,150.00,-15000.00';
    expect(detectBrokerFormat(buf(csv))).toBe('tradestation');
  });

  test('detects Tastytrade format', () => {
    const csv = 'Date,Type,Action,Symbol,Instrument Type,Description,Value,Quantity,Average Price,Commissions,Fees,Root Symbol,Underlying Symbol,Expiration Date,Strike Price,Call or Put\n01/01/2025,Trade,Buy to Open,AAPL230120C00150000,Equity Option,AAPL 01/20/23 Call 150.00,500.00,1,5.00,-1.00,0.00,AAPL,AAPL,01/20/2023,150.00,Call';
    expect(detectBrokerFormat(buf(csv))).toBe('tastytrade');
  });

  test('returns "generic" for unknown format', () => {
    const csv = 'Col1,Col2,Col3\nval1,val2,val3';
    expect(detectBrokerFormat(buf(csv))).toBe('generic');
  });

  test('returns "generic" for empty buffer', () => {
    expect(detectBrokerFormat(buf(''))).toBe('generic');
  });

  test('handles BOM-prefixed content', () => {
    const csv = '\uFEFFTrade Number,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC\n1,09:30,AAPL,B,100,150.00,1.00,0.01';
    expect(detectBrokerFormat(buf(csv))).toBe('lightspeed');
  });

  test('detects PaperMoney format', () => {
    const csv = 'Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type\n01/01/2025 09:30,SINGLE,BUY,100,TO OPEN,AAPL,,,STOCK,150.00,150.00,LIMIT';
    expect(detectBrokerFormat(buf(csv))).toBe('papermoney');
  });

  test('detects PaperMoney trade activity format with Time Placed header', () => {
    const csv = [
      'Today\'s Trade Activity for 72074033SCHW (Trading) on 7/2/26 08:44:52',
      'Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Mark,Status',
      ',,7/1/26 06:50:34,STOCK,SELL,-17,TO CLOSE,LNTH,,,STOCK,~,MKT,GTC,109.135,WAIT STOP'
    ].join('\n');
    expect(detectBrokerFormat(buf(csv))).toBe('papermoney');
  });
});
