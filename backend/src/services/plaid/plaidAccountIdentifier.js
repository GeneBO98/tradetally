/**
 * The account identifier TradeTally uses to tie a Plaid account's trades,
 * holdings, and cash together. Holdings sync stamps this onto investment_lots
 * and linkPlaidAccount stamps the same value onto the managed user_accounts row,
 * so positions and cashflow roll up to one account. Both paths MUST derive the
 * identifier the same way or holdings stop matching their managed account.
 *
 * @param {string|null} institutionName - Plaid connection institution name
 * @param {string|null} mask - Plaid account mask (last 4)
 * @returns {string} e.g. "Fidelity 1234" or "Fidelity" when no mask is present
 */
function derivePlaidAccountIdentifier(institutionName, mask) {
  const institution = institutionName || 'Plaid';
  return mask ? `${institution} ${mask}` : institution;
}

module.exports = { derivePlaidAccountIdentifier };
