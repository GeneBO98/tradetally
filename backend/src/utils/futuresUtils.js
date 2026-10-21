/**
 * Dollars per quoted price point and minimum outright tick, per contract.
 * Exchange quote units matter: grains/livestock quoted in cents use dollars
 * per cent here, not bushels/pounds per contract. Broker multipliers remain
 * authoritative for exports using other units.
 * Sources: documentation/reviews/futures-contract-specifications.md
 */
const FUTURES_CONTRACTS = Object.freeze({
  ES: [50, 0.25], NQ: [20, 0.25], YM: [5, 1], RTY: [50, 0.1],
  MES: [5, 0.25], MNQ: [2, 0.25], MYM: [0.5, 1], M2K: [5, 0.1],
  NES: [0.5, 0.5], NNQ: [0.2, 0.5], NDOW: [0.05, 2], N2K: [0.5, 0.2],
  CL: [1000, 0.01], MCL: [100, 0.01], NG: [10000, 0.001],
  MNG: [1000, 0.001], QG: [2500, 0.005], RB: [42000, 0.0001], HO: [42000, 0.0001],
  GC: [100, 0.1], MGC: [10, 0.1], SI: [5000, 0.005], SIL: [1000, 0.01],
  HG: [12500, 0.0005], MHG: [2500, 0.0005], PL: [50, 0.1], PA: [100, 0.5], PAM: [10, 0.5],
  '1OZ': [1, 0.25],
  BTC: [5, 5], MBT: [0.1, 5], ETH: [50, 0.5], MET: [0.1, 0.5],
  VX: [1000, 0.05], VXM: [100, 0.05],
  ZB: [1000, 1 / 32], UB: [1000, 1 / 32], ZN: [1000, 1 / 64],
  TN: [1000, 1 / 64], ZF: [1000, 1 / 128], ZT: [2000, 1 / 256],
  ZC: [50, 0.25], ZW: [50, 0.25], ZS: [50, 0.25], KE: [50, 0.25],
  MZC: [5, 0.5], MZW: [5, 0.5], MZS: [5, 0.5], MZM: [10, 0.2], MZL: [60, 0.02],
  ZM: [100, 0.1], ZL: [600, 0.01], HE: [400, 0.025], LE: [400, 0.025], GF: [500, 0.025],
  '6E': [125000, 0.00005], '6B': [62500, 0.0001], '6A': [100000, 0.00005],
  '6C': [100000, 0.00005], '6J': [12500000, 0.0000005], '6S': [125000, 0.00005],
  '6N': [100000, 0.00005], '6M': [500000, 0.00001],
  M6E: [12500, 0.0001], M6B: [6250, 0.0001], M6A: [10000, 0.0001],
  MCD: [10000, 0.0001], MJY: [1250000, 0.000001], MSF: [12500, 0.0001]
});

// Documented CQG product codes for the same CME contracts.
const ROOT_ALIASES = Object.freeze({ ENQ: 'NQ', EP: 'ES' });

function normalizeRoot(root) {
  const normalized = typeof root === 'string' ? root.trim().toUpperCase() : '';
  return ROOT_ALIASES[normalized] || normalized;
}

/** Unknown contracts have no guessed dollar multiplier. */
function getFuturesPointValue(underlying) {
  return FUTURES_CONTRACTS[normalizeRoot(underlying)]?.[0] ?? null;
}

function getFuturesTickSize(underlying) {
  return FUTURES_CONTRACTS[normalizeRoot(underlying)]?.[1] ?? null;
}

function isKnownFuturesRoot(root) {
  return Object.prototype.hasOwnProperty.call(FUTURES_CONTRACTS, normalizeRoot(root));
}

function resolveFuturesRoot(input) {
  const normalized = normalizeRoot(input);
  if (isKnownFuturesRoot(normalized)) return normalized;
  const extracted = extractUnderlyingFromFuturesSymbol(normalized);
  return extracted && isKnownFuturesRoot(extracted) ? normalizeRoot(extracted) : null;
}

/** Accept broker contract, exchange-prefixed, continuous and display symbols. */
function extractUnderlyingFromFuturesSymbol(symbol) {
  if (!symbol) return null;
  const normalized = String(symbol).trim().toUpperCase()
    .replace(/^F\.[A-Z]{2,}\./, '').replace(/^[A-Z_]+:/, '').replace(/^\//, '');
  const contract = normalized.match(/^([A-Z0-9]{1,4})([FGHJKMNQUVXZ])(\d{1,4})$/);
  if (contract && /[A-Z]/.test(contract[1])) return contract[1];
  const continuous = normalized.match(/^([A-Z0-9]{1,4})\d+!$/);
  if (continuous && /[A-Z]/.test(continuous[1])) return continuous[1];
  const display = normalized.match(/^([A-Z0-9]{1,4})\s+(?:[A-Z]{3}\s?\d{2}|(?:0[1-9]|1[0-2])-\d{2})$/);
  return display ? display[1] : null;
}

module.exports = {
  getFuturesPointValue,
  getFuturesTickSize,
  extractUnderlyingFromFuturesSymbol,
  isKnownFuturesRoot,
  resolveFuturesRoot
};
