function normalizeBrokerName(name) {
  const normalized = (name || '').toLowerCase().trim();
  const brokerAliases = {
    tradeovate: 'tradovate',
    'trade ovate': 'tradovate',
    thinkorswim: 'thinkorswim',
    tos: 'thinkorswim',
    'interactive brokers': 'ibkr',
    interactivebrokers: 'ibkr'
  };
  return brokerAliases[normalized] || normalized;
}

function buildBrokerFeeMap(rows = [], logger = null) {
  const brokerFeeMap = new Map();

  rows.forEach(row => {
    const brokerName = normalizeBrokerName(row.broker);
    const instrument = (row.instrument || '').toUpperCase();
    const settings = {
      commissionPerContract: parseFloat(row.commission_per_contract) || 0,
      commissionPerSide: parseFloat(row.commission_per_side) || 0,
      feesPerContract:
        (parseFloat(row.exchange_fee_per_contract) || 0) +
        (parseFloat(row.nfa_fee_per_contract) || 0) +
        (parseFloat(row.clearing_fee_per_contract) || 0) +
        (parseFloat(row.platform_fee_per_contract) || 0)
    };

    if (!brokerFeeMap.has(brokerName)) {
      brokerFeeMap.set(brokerName, { instruments: new Map(), default: null });
    }

    const brokerSettings = brokerFeeMap.get(brokerName);
    if (instrument === '') {
      brokerSettings.default = settings;
      logger?.logImport?.(`[BROKER FEES] Default for ${brokerName}: commission=$${settings.commissionPerContract.toFixed(4)}/contract + $${settings.commissionPerSide.toFixed(2)}/side, fees=$${settings.feesPerContract.toFixed(4)}/contract`);
    } else {
      brokerSettings.instruments.set(instrument, settings);
      logger?.logImport?.(`[BROKER FEES] ${instrument} for ${brokerName}: commission=$${settings.commissionPerContract.toFixed(4)}/contract + $${settings.commissionPerSide.toFixed(2)}/side, fees=$${settings.feesPerContract.toFixed(4)}/contract`);
    }
  });

  return brokerFeeMap;
}

function getBrokerLookupNames(broker, trades = []) {
  const normalizedBroker = normalizeBrokerName(broker);
  const brokersToLookup = normalizedBroker === 'auto'
    ? [...new Set(trades.map(t => normalizeBrokerName(t.broker)).filter(Boolean))]
    : [normalizedBroker];

  const expandedBrokersToLookup = [...new Set([
    ...brokersToLookup,
    ...(brokersToLookup.includes('tradovate') ? ['tradeovate'] : [])
  ])];

  return { brokersToLookup, expandedBrokersToLookup };
}

function resolveFeeSettings(symbol, brokerSettings, logger = null) {
  const feeSettingsMap = brokerSettings.instruments;
  const defaultFeeSettings = brokerSettings.default;
  let feeSettings = feeSettingsMap.get(symbol);

  if (!feeSettings) {
    const futuresMatch = symbol.match(/^([A-Z][A-Z0-9]{1,3})([FGHJKMNQUVXZ])(\d{1,2})$/);
    if (futuresMatch) {
      const baseSymbol = futuresMatch[1];
      feeSettings = feeSettingsMap.get(baseSymbol);
      if (feeSettings) {
        logger?.logImport?.(`[BROKER FEES] Matched ${symbol} to base symbol ${baseSymbol}`);
      }
    }
  }

  if (!feeSettings) {
    feeSettings = defaultFeeSettings;
    if (feeSettings) {
      logger?.logImport?.(`[BROKER FEES] Using broker default for ${symbol}`);
    }
  }

  return feeSettings;
}

function getMatchType(symbol, feeSettingsMap) {
  if (feeSettingsMap.has(symbol)) {
    return 'exact-symbol';
  }

  const futuresMatch = symbol.match(/^([A-Z][A-Z0-9]{1,3})([FGHJKMNQUVXZ])(\d{1,2})$/);
  if (futuresMatch && feeSettingsMap.has(futuresMatch[1])) {
    return `base-symbol (${futuresMatch[1]})`;
  }

  return 'broker-default';
}

function hasNonZeroCost(value) {
  return value !== undefined && value !== null && Number(value) !== 0;
}

function applyBrokerFeeSettingsToTrades({ trades = [], broker = '', feeRows = [], logger = null }) {
  const normalizedBroker = normalizeBrokerName(broker);
  const getEffectiveBroker = (trade) => {
    if (normalizedBroker === 'auto' && trade.broker) {
      return normalizeBrokerName(trade.broker);
    }
    return normalizedBroker;
  };

  const brokerFeeMap = buildBrokerFeeMap(feeRows, logger);

  return trades.map(trade => {
    const hasCommission = hasNonZeroCost(trade.commission);
    const hasFees = hasNonZeroCost(trade.fees);

    if (hasCommission && hasFees) {
      return trade;
    }

    const symbol = (trade.symbol || '').toUpperCase();
    const quantity = Number(trade.quantity || trade.totalQuantity || 1);
    const effectiveBroker = getEffectiveBroker(trade);
    const brokerSettings = brokerFeeMap.get(effectiveBroker);

    if (!brokerSettings) {
      logger?.logImport?.(`[BROKER FEES] No fee settings found for broker '${effectiveBroker}' (symbol: ${symbol}). Available brokers: ${[...brokerFeeMap.keys()].join(', ')}`);
      return trade;
    }

    const feeSettings = resolveFeeSettings(symbol, brokerSettings, logger);
    if (!feeSettings) {
      logger?.logImport?.(`[BROKER FEES] No fee settings found for ${symbol} (broker: ${effectiveBroker}). No instrument match and no broker default configured.`);
      return trade;
    }

    const { commissionPerContract, commissionPerSide, feesPerContract } = feeSettings;
    const isRoundTrip = !!(trade.exitPrice ?? trade.exit_price);
    const sides = isRoundTrip ? 2 : 1;
    const totalCommission = (commissionPerContract * quantity * sides) + (commissionPerSide * sides);
    const totalFees = feesPerContract * quantity * sides;
    const entryCommission = (commissionPerContract * quantity) + commissionPerSide;
    const exitCommission = isRoundTrip ? (commissionPerContract * quantity) + commissionPerSide : 0;
    const appliedCommission = hasCommission ? 0 : totalCommission;
    const appliedFees = hasFees ? 0 : totalFees;

    if (!hasCommission) {
      trade.entryCommission = entryCommission;
      trade.exitCommission = exitCommission;
      trade.commission = totalCommission;
    }

    if (!hasFees) {
      trade.fees = totalFees;
    }

    if (isRoundTrip && trade.pnl !== undefined && trade.pnl !== null && (appliedCommission || appliedFees)) {
      trade.pnl = trade.pnl - appliedCommission - appliedFees;
    }

    const matchType = getMatchType(symbol, brokerSettings.instruments);
    const totalCost = appliedCommission + appliedFees;
    logger?.logImport?.(`[BROKER FEES] Applied to ${symbol} (${quantity} contracts): commission=$${appliedCommission.toFixed(2)}, fees=$${appliedFees.toFixed(2)}, total=$${totalCost.toFixed(2)} [${matchType}]`);

    return trade;
  });
}

module.exports = {
  applyBrokerFeeSettingsToTrades,
  buildBrokerFeeMap,
  getBrokerLookupNames,
  normalizeBrokerName
};
