function normalizeBrokerName(name) {
  const normalized = (name || '').toLowerCase().trim();
  const brokerAliases = {
    tradeovate: 'tradovate',
    'trade ovate': 'tradovate',
    'sierra chart': 'sierrachart',
    sierra_chart: 'sierrachart',
    sierrachart: 'sierrachart',
    'charles schwab': 'schwab',
    'td ameritrade': 'tdameritrade',
    'trade station': 'tradestation',
    'e*trade': 'etrade',
    'tasty trade': 'tastytrade',
    fidelity: 'fidelity',
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

function buildProfileFeeMaps(rows = [], logger = null) {
  const profileMaps = new Map();

  rows.forEach(row => {
    const profileId = row.profile_id || row.fee_profile_id;
    if (!profileId) return;
    if (!profileMaps.has(profileId)) profileMaps.set(profileId, []);
    profileMaps.get(profileId).push(row);
  });

  for (const [profileId, profileRows] of profileMaps) {
    profileMaps.set(profileId, buildBrokerFeeMap(profileRows, logger));
  }

  return profileMaps;
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

function applyBrokerFeeSettingsToTrades({
  trades = [],
  broker = '',
  feeRows = [],
  feeProfileRows = [],
  feeProfileAssignments = [],
  feeSummary = null,
  logger = null
}) {
  const normalizedBroker = normalizeBrokerName(broker);
  const getEffectiveBroker = (trade) => {
    if (normalizedBroker === 'auto' && trade.broker) {
      return normalizeBrokerName(trade.broker);
    }
    return normalizedBroker;
  };

  const brokerFeeMap = buildBrokerFeeMap(feeRows, logger);
  const profileFeeMaps = buildProfileFeeMaps(feeProfileRows, logger);
  const profileAssignments = new Map(
    feeProfileAssignments
      .filter(assignment => assignment?.account_identifier)
      .map(assignment => [String(assignment.account_identifier), assignment])
  );

  const recordUnknownFee = (trade, assignment, effectiveBroker, symbol) => {
    if (!feeSummary) return;
    const accountIdentifier = trade.accountIdentifier || trade.account_identifier || '__no_account__';
    const key = String(accountIdentifier);
    if (!feeSummary.unknownAccounts) feeSummary.unknownAccounts = new Map();
    const current = feeSummary.unknownAccounts.get(key) || {
      account_identifier: accountIdentifier === '__no_account__' ? null : accountIdentifier,
      fee_profile_name: assignment?.fee_profile_name || null,
      broker: effectiveBroker,
      trade_count: 0
    };
    current.trade_count++;
    feeSummary.unknownAccounts.set(key, current);
    logger?.logImport?.(`[BROKER FEES] Fees unknown for ${accountIdentifier === '__no_account__' ? 'trades without an account' : `account ${accountIdentifier}`} (broker: ${effectiveBroker}, symbol: ${symbol}). Imported with zero configured fees.`);
  };

  return trades.map(trade => {
    const hasCommission = hasNonZeroCost(trade.commission);
    const hasFees = hasNonZeroCost(trade.fees);

    if (hasCommission && hasFees) {
      return trade;
    }

    const symbol = (trade.symbol || '').toUpperCase();
    const quantity = Number(trade.quantity || trade.totalQuantity || 1);
    const effectiveBroker = getEffectiveBroker(trade);
    const accountIdentifier = trade.accountIdentifier || trade.account_identifier;
    const assignment = accountIdentifier ? profileAssignments.get(String(accountIdentifier)) : null;
    const profileMap = assignment?.fee_profile_id ? profileFeeMaps.get(assignment.fee_profile_id) : null;

    // An assigned profile is authoritative, including an empty or zero-fee
    // profile. Only accounts without a profile use legacy broker settings.
    if (assignment?.is_zero_fee === true) {
      if (feeSummary?.knownZeroAccounts) {
        feeSummary.knownZeroAccounts.add(String(accountIdentifier));
      }
      return trade;
    }

    const brokerSettings = assignment
      ? profileMap?.get(effectiveBroker)
      : brokerFeeMap.get(effectiveBroker);

    if (!brokerSettings) {
      recordUnknownFee(trade, assignment, effectiveBroker, symbol);
      logger?.logImport?.(`[BROKER FEES] No fee settings found for broker '${effectiveBroker}' (symbol: ${symbol}). Available brokers: ${[...brokerFeeMap.keys()].join(', ')}`);
      return trade;
    }

    const feeSettings = resolveFeeSettings(symbol, brokerSettings, logger);
    if (!feeSettings) {
      recordUnknownFee(trade, assignment, effectiveBroker, symbol);
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
  buildProfileFeeMaps,
  getBrokerLookupNames,
  normalizeBrokerName
};
