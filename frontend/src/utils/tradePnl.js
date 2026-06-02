function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isTradeOpen(trade) {
  return !trade?.exit_price && !trade?.exit_time
}

export function getTradeGrossPnl(trade) {
  if (isTradeOpen(trade)) {
    return 0
  }

  const pnl = toNumber(trade?.pnl)
  const commission = toNumber(trade?.commission)
  const fees = toNumber(trade?.fees)
  return pnl + commission + fees
}

export function getTradeNetPnl(trade) {
  if (isTradeOpen(trade)) {
    return 0
  }

  return toNumber(trade?.pnl)
}
