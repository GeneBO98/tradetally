// Pure formatting helpers shared across the Behavioral Analytics view and its
// extracted section components. Behavior is identical to the original inline
// helpers that previously lived in BehavioralAnalyticsView.vue.

// Format date for display (e.g. "Jul 4, 2024, 10:30 AM")
export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format minutes to human-readable duration
export function formatMinutes(minutes) {
  // Handle edge cases
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return "N/A";
  }

  const mins = Math.round(Number(minutes));

  if (mins < 1) {
    return "< 1m";
  } else if (mins < 60) {
    return `${mins}m`;
  } else if (mins < 1440) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  } else {
    const days = Math.floor(mins / 1440);
    const remainingMinutes = mins % 1440;
    const hours = Math.floor(remainingMinutes / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
}

// Calculate time between two trade timestamps
export function getTimeBetweenTrades(startTime, endTime) {
  if (!startTime || !endTime) return "Unknown";

  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  const diffMins = Math.round(diffMs / (1000 * 60));

  if (diffMins < 60) {
    return `${diffMins} minutes`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } else {
    const days = Math.floor(diffMins / 1440);
    const hours = Math.floor((diffMins % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
}

// Get stored P&L value from the database (no calculation - uses stored value)
export function getPnLValue(trade) {
  if (!trade) return 0;

  // Use the stored pnl value from the database - no calculation needed
  if (trade.pnl !== null && trade.pnl !== undefined) {
    return parseFloat(trade.pnl);
  }

  // If pnl is missing, return 0 and log an error
  console.error("Missing pnl field in trade data:", trade);
  return 0;
}

// Title-case a personality identifier (e.g. "mean_reversion" -> "Mean Reversion")
export function formatPersonalityName(personality) {
  return String(personality || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Title-case a strategy identifier
export function formatStrategyLabel(strategy) {
  return String(strategy || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Human-readable label for a position risk basis
export function formatRiskBasisLabel(basis) {
  const labels = {
    max_loss: "max theoretical loss",
    stop_loss: "stop-loss risk",
    net_debit: "net debit paid",
    notional: "notional exposure",
    undefined_risk_notional: "approximate undefined-risk exposure",
    position_size: "position size fallback",
  };
  return labels[basis] || "position size fallback";
}
