function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isTradeOpen(trade) {
  return !trade?.exit_price && !trade?.exit_time
}

export function getTradeUnrealizedPnl(trade) {
  return toNumber(trade?.unrealizedPnl ?? trade?.unrealized_pnl)
}

export function getTradeCosts(trade) {
  const fees = toNumber(trade?.fees)

  if (isTradeOpen(trade)) {
    const rawEntryCommission = trade?.entry_commission ?? trade?.entryCommission
    const hasEntryCommission = toNumber(rawEntryCommission) !== 0
    const commission = hasEntryCommission
      ? toNumber(rawEntryCommission)
      : toNumber(trade?.commission)

    return commission + fees
  }

  return toNumber(trade?.commission) + fees
}

export function getTradeGrossPnl(trade) {
  if (isTradeOpen(trade)) {
    return getTradeUnrealizedPnl(trade)
  }

  return toNumber(trade?.pnl) + getTradeCosts(trade)
}

export function getTradeNetPnl(trade) {
  if (isTradeOpen(trade)) {
    return getTradeGrossPnl(trade) - getTradeCosts(trade)
  }

  return toNumber(trade?.pnl)
}
