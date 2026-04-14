const BROKER_KEYWORDS = [
  'broker', 'brokerage', 'investment', 'trading', 'securities', 'margin',
  'schwab', 'fidelity', 'robinhood', 'etrade', 'e*trade', 'interactive brokers',
  'ibkr', 'webull', 'tradestation', 'tastytrade', 'vanguard', 'merrill',
  'alpaca', 'public.com', 'public app', 'm1 finance', 'thinkorswim', 'td ameritrade',
  'tradovate', 'lightspeed', 'charles schwab'
];

const TRANSFER_KEYWORDS = [
  'ach', 'wire', 'transfer', 'cash transfer', 'cash journal', 'incoming funds',
  'outgoing funds', 'deposit', 'withdrawal', 'funding', 'disbursement', 'sweep'
];

function includesKeyword(value, keywords) {
  const normalized = String(value || '').toLowerCase();
  return keywords.some(keyword => normalized.includes(keyword));
}

function amountIndicatesMoneyLeavingPlaidAccount(amount) {
  return Number(amount) > 0;
}

class PlaidClassificationService {
  classify(transaction, plaidAccount) {
    const description = String(transaction.description || '').trim();
    const metadata = transaction.metadata || {};
    const combinedText = [
      description,
      transaction.merchantName,
      metadata.categoryPrimary,
      metadata.categoryDetailed,
      metadata.investmentType,
      metadata.investmentSubtype
    ].filter(Boolean).join(' ');

    let confidence = 0;
    let reviewReason = null;

    if (includesKeyword(combinedText, TRANSFER_KEYWORDS)) {
      confidence += 35;
      reviewReason = reviewReason || 'transfer_keyword';
    }

    if (includesKeyword(combinedText, BROKER_KEYWORDS)) {
      confidence += 35;
      reviewReason = reviewReason || 'broker_keyword';
    }

    if (metadata.categoryPrimary && String(metadata.categoryPrimary).toLowerCase().includes('transfer')) {
      confidence += 20;
      reviewReason = reviewReason || 'transfer_category';
    }

    if (plaidAccount?.accountType === 'investment' || plaidAccount?.accountSubtype === 'brokerage') {
      confidence += 10;
    }

    if (metadata.transactionSource === 'investment') {
      confidence += 15;
      reviewReason = reviewReason || 'investment_activity';
    }

    const directionGuess = this.getDirectionGuess(transaction.amount, plaidAccount);

    return {
      directionGuess,
      confidence: Math.min(confidence, 100),
      reviewReason
    };
  }

  getDirectionGuess(amount, plaidAccount) {
    if (!plaidAccount?.trackingMode) {
      return 'ambiguous';
    }

    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
      return 'ambiguous';
    }

    const moneyLeavingPlaidAccount = amountIndicatesMoneyLeavingPlaidAccount(amount);

    if (plaidAccount.trackingMode === 'tracked_account') {
      return moneyLeavingPlaidAccount ? 'withdrawal' : 'deposit';
    }

    if (plaidAccount.trackingMode === 'funding_source') {
      return moneyLeavingPlaidAccount ? 'deposit' : 'withdrawal';
    }

    return 'ambiguous';
  }
}

module.exports = new PlaidClassificationService();
