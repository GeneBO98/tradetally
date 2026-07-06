const { brokerParsers } = require('../brokerParsers');
const { extractAccountFromRecord } = require('../detect');
const { parseInstrumentData, isValidTrade } = require('../shared');


async function parseTradervueCompletedTrades(records, context = {}) {
  const trades = [];

  for (const record of records) {
    const trade = brokerParsers.tradervue(record);
    if (!isValidTrade(trade)) {
      continue;
    }

    if (trade.symbol) {
      const instrumentData = parseInstrumentData(trade.symbol);
      if (instrumentData.instrumentType === 'future' || instrumentData.instrumentType === 'option') {
        Object.assign(trade, instrumentData);
      }
    }

    const accountIdentifier = context.selectedAccountId
      ? context.selectedAccountId
      : context.accountColumnName
        ? extractAccountFromRecord(record, context.accountColumnName)
        : null;

    if (accountIdentifier) {
      trade.accountIdentifier = accountIdentifier;
    }

    trades.push(trade);
  }

  return trades;
}

module.exports = {
  parseTradervueCompletedTrades
};
