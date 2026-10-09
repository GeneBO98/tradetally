const {
  detectImportAccounts,
  scanCsvAccountIdentifiers,
  findAccountColumnIndex,
  resolveAccountMode,
  applyAccountModeToTrades,
  buildImportAccountScope
} = require('../../src/utils/importAccountDetection');

function binaryField(id, value) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(id, 0);
  header.writeUInt32LE(value.length, 4);
  return Buffer.concat([header, value]);
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value);
  return buffer;
}

function int64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  return buffer;
}

function float64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleLE(value);
  return buffer;
}

function scDateTime(iso) {
  const scEpochMs = Date.UTC(1899, 11, 30);
  return int64(BigInt(new Date(iso).getTime() - scEpochMs) * 1000n);
}

function binaryFill({ datetime, symbol, side, price, executionId, orderId, account = 'RTSL00000000000' }) {
  const fields = [
    binaryField(101, int32(2)),
    binaryField(102, scDateTime(datetime)),
    binaryField(103, Buffer.from(symbol)),
    binaryField(105, int64(orderId)),
    binaryField(108, float64(1)),
    binaryField(109, Buffer.from([side === 'Buy' ? 1 : 2])),
    binaryField(113, float64(price * 100)),
    binaryField(114, float64(1)),
    binaryField(120, Buffer.from([side === 'Buy' ? 1 : 2])),
    binaryField(124, Buffer.from(executionId)),
    binaryField(160, scDateTime(datetime)),
    binaryField(199, Buffer.alloc(0))
  ];
  if (account) {
    fields.splice(8, 0, binaryField(118, Buffer.from(account)));
  }
  return Buffer.concat(fields);
}

describe('importAccountDetection', () => {
  test('finds account columns by common header names', () => {
    expect(findAccountColumnIndex(['Date', 'Symbol', 'Account Number', 'Price'])).toBe(2);
    expect(findAccountColumnIndex(['Date', 'Symbol', 'Price'])).toBe(-1);
  });

  test('scans a CSV for distinct account identifiers', () => {
    const csv = [
      'Date,Symbol,TradeAccount,Price',
      '2026-09-08,MES,RTSL00000000000,7688.5',
      '2026-09-08,MES,RTSL00000000000,7688.0',
      '2026-09-08,MES,Sim1,7688.0'
    ].join('\n');

    expect(scanCsvAccountIdentifiers(Buffer.from(csv)).sort()).toEqual(['RTSL00000000000', 'Sim1']);
  });

  test('decodes Sierra binary TradeAccount values', () => {
    const file = Buffer.concat([
      binaryField(1, int64(2)),
      binaryFill({ datetime: '2026-09-08T14:02:58.329Z', symbol: 'MESU6.CME', side: 'Buy', price: 7688.5, executionId: '1', orderId: 1, account: 'RTSL00000000000' }),
      binaryFill({ datetime: '2026-09-08T14:03:02.094Z', symbol: 'MESU6.CME', side: 'Sell', price: 7688, executionId: '2', orderId: 2, account: 'Sim1' })
    ]);

    const result = detectImportAccounts(file, 'TradeActivityLog_20260908_UTC.RTSL00000000000.data');

    expect(result.detectedBroker).toBe('sierrachart');
    expect(result.accountIdentifiers.sort()).toEqual(['RTSL00000000000', 'Sim1']);
    expect(result.source).toBe('record');
  });

  test('falls back to the Sierra filename when the file carries no account', () => {
    const csv = ['Symbol,Price', 'MES,7688.5'].join('\n');
    const result = detectImportAccounts(Buffer.from(csv), 'TradeActivityLog_20260908_UTC.RTSL00000000000.data');

    expect(result.accountIdentifiers).toEqual(['RTSL00000000000']);
    expect(result.source).toBe('filename');
  });

  test('ignores the .simulated marker when reading the filename account', () => {
    const csv = ['Symbol,Price', 'MES,7688.5'].join('\n');
    const result = detectImportAccounts(Buffer.from(csv), 'TradeActivityLog_20260903_UTC.Sim1.simulated.data');

    expect(result.accountIdentifiers).toEqual(['Sim1']);
  });

  describe('account mode', () => {
    test('resolves explicit modes and keeps legacy clients on override/auto', () => {
      expect(resolveAccountMode('none', 'acct-1')).toBe('none');
      expect(resolveAccountMode('auto', 'acct-1')).toBe('auto');
      expect(resolveAccountMode('override', 'acct-1')).toBe('override');
      expect(resolveAccountMode('override', null)).toBe('override');
      expect(resolveAccountMode(undefined, 'acct-1')).toBe('override');
      expect(resolveAccountMode(undefined, null)).toBe('auto');
    });

    test('None clears imported account identifiers so no account is linked or created', () => {
      const trades = [
        { symbol: 'MES', account_identifier: 'SNAKE_ONLY' },
        { symbol: 'MES', accountIdentifier: 'Sim1', account_identifier: 'Sim1' }
      ];

      applyAccountModeToTrades(trades, 'none');

      expect(trades.map(trade => trade.accountIdentifier)).toEqual([null, null]);
      expect(trades.map(trade => trade.account_identifier)).toEqual([null, null]);
      const identifiers = new Set(trades.flatMap(trade => [trade.account_identifier, trade.accountIdentifier]).filter(Boolean));
      expect(identifiers.size).toBe(0);
    });

    test('Auto preserves the identifiers parsed from the file', () => {
      const trades = [{ symbol: 'MES', accountIdentifier: 'RTSL00000000000' }];
      applyAccountModeToTrades(trades, 'auto');
      expect(trades[0].accountIdentifier).toBe('RTSL00000000000');
    });

    test('None scopes all existing-trade lookups to unassigned trades', () => {
      expect(buildImportAccountScope('none', null, 4)).toEqual({
        clause: ` AND (account_identifier IS NULL OR account_identifier = '')`,
        params: []
      });
    });

    test('Override scopes existing-trade lookups to the selected account', () => {
      expect(buildImportAccountScope('override', 'ACCOUNT-A', 4)).toEqual({
        clause: ' AND account_identifier = $4',
        params: ['ACCOUNT-A']
      });
    });

    test('Auto leaves existing-trade lookups unscoped until parsed accounts are known', () => {
      expect(buildImportAccountScope('auto', null, 2)).toEqual({ clause: '', params: [] });
    });
  });
});
