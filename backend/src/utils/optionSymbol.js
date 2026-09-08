// OCC contract symbols, e.g. SPY   260618P00350000.
function isOptionContractSymbol(symbol) {
  const compact = String(symbol || '').toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(compact);
}

module.exports = { isOptionContractSymbol };
