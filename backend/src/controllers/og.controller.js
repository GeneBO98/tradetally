const Trade = require('../models/Trade');
const { fetchCurrentPriceForSymbol, computeUnrealized } = require('../services/openPositionPricing');
const { renderTradeCardPng } = require('../services/shareCardImageService');

const FALLBACK_IMAGE = '/social-preview-v3.png';
const SITE_TITLE = 'TradeTally - Trading Journal with Behavioral Analytics';
const SITE_DESCRIPTION = 'Free trading journal that detects revenge trading, overconfidence, and behavioral patterns. Auto-sync Schwab and IBKR. Open source and self-hostable.';

function num(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Attach a live current price + unrealized P&L to an open non-option position,
// mirroring the trade detail endpoint so the card matches the in-app one.
async function enrichOpenPosition(trade) {
  const isOpen = !trade.exit_time && !trade.exit_price;
  if (!isOpen || trade.instrument_type === 'option') return;
  const price = await fetchCurrentPriceForSymbol(trade.underlying_symbol || trade.symbol, null);
  if (price == null) return;
  trade.current_price = price;
  const { unrealizedPnl, unrealizedPnlPercent } = computeUnrealized(trade, price);
  trade.unrealizedPnl = unrealizedPnl;
  trade.unrealizedPnlPercent = unrealizedPnlPercent;
}

function buildCardText(trade) {
  const symbol = String(trade.underlying_symbol || trade.symbol || '').toUpperCase();
  const side = String(trade.side || '').toUpperCase();
  const isOpen = !trade.exit_time && !trade.exit_price;
  const pnlPercent = isOpen ? num(trade.unrealizedPnlPercent) : num(trade.pnl_percent ?? trade.pnlPercent);
  const rValue = num(trade.r_value ?? trade.rValue);

  let result;
  if (pnlPercent !== null) result = `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`;
  else if (rValue !== null) result = `${rValue >= 0 ? '+' : ''}${rValue.toFixed(1)}R`;
  else result = isOpen ? 'open' : (num(trade.pnl) >= 0 ? 'win' : 'loss');

  const headline = [symbol, side, result].filter(Boolean).join(' ');
  const title = `${headline}${isOpen ? ' (open)' : ''} · TradeTally`;
  const description = isOpen
    ? `Open ${side.toLowerCase()} position on ${symbol}, shared from TradeTally.`
    : `${side ? side.charAt(0) + side.slice(1).toLowerCase() + ' ' : ''}trade on ${symbol} (${result}), shared from TradeTally.`;
  return { title, description };
}

function renderOgHtml({ title, description, image, canonical }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(image);
  const url = escapeHtml(canonical);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TradeTally">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:secure_url" content="${img}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@TradeTallyIO">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${url}">
</head>
<body><p>Redirecting to <a href="${url}">${t}</a></p></body>
</html>`;
}

const ogController = {
  // Crawler-facing HTML with per-trade Open Graph tags. Only public trades get a
  // per-trade card; anything else falls back to the generic site card.
  async tradeOgHtml(req, res) {
    const site = baseUrl(req);
    try {
      const trade = await Trade.findById(req.params.id, null); // null user => public-only
      if (!trade || trade.is_public !== true) {
        res.set('Cache-Control', 'public, max-age=300');
        return res.type('html').send(renderOgHtml({
          title: SITE_TITLE,
          description: SITE_DESCRIPTION,
          image: `${site}${FALLBACK_IMAGE}`,
          canonical: `${site}/`
        }));
      }
      await enrichOpenPosition(trade);
      const { title, description } = buildCardText(trade);
      res.set('Cache-Control', 'public, max-age=120');
      return res.type('html').send(renderOgHtml({
        title,
        description,
        image: `${site}/og/trades/${trade.id}/card.png`,
        canonical: `${site}/trades/${trade.id}`
      }));
    } catch (error) {
      console.error('[OG] tradeOgHtml failed:', error.message);
      return res.type('html').send(renderOgHtml({
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        image: `${site}${FALLBACK_IMAGE}`,
        canonical: `${site}/`
      }));
    }
  },

  // The card image itself. Renders only for public trades; otherwise redirects to
  // the static site image so the link still shows something.
  async tradeCardImage(req, res) {
    try {
      const trade = await Trade.findById(req.params.id, null);
      if (!trade || trade.is_public !== true) {
        return res.redirect(302, FALLBACK_IMAGE);
      }
      await enrichOpenPosition(trade);
      const png = await renderTradeCardPng(trade);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=120');
      return res.send(png);
    } catch (error) {
      console.error('[OG] tradeCardImage failed:', error.message);
      return res.redirect(302, FALLBACK_IMAGE);
    }
  }
};

module.exports = ogController;
