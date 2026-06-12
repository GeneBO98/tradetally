const sharp = require('sharp');
const path = require('path');

// Server-rendered version of the in-app TradeShareCard (frontend canvas). Built
// as an SVG and rasterized with sharp so shared trade links unfurl into a card.
// Open Graph ratio, 1200x630.
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const PAD = 72;

// The logo mark is composited on as a raster, not drawn in the SVG: the favicon
// is an Inkscape SVG with filters resvg can't render inline. Pre-rendered PNG
// lives in the backend so it's available in both native and Docker deploys.
const LOGO_PATH = path.join(__dirname, '../assets/tradetally-mark.png');
const LOGO_SIZE = 52;
const LOGO_TOP = 44;
const WORDMARK_X = PAD + LOGO_SIZE + 16;

let logoBufferPromise = null;
function getLogoBuffer() {
  if (!logoBufferPromise) {
    logoBufferPromise = sharp(LOGO_PATH)
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
      .catch((error) => {
        console.warn('[SHARE-CARD] logo mark unavailable:', error.message);
        return null;
      });
  }
  return logoBufferPromise;
}

const COLORS = {
  background: '#101418',
  textPrimary: '#f4f4f5',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  win: '#10b981',
  loss: '#ef4444',
  divider: '#262d36',
  brand: '#F0812A'
};

const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function num(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : '+'}$${formatted}`;
}

function formatPrice(value) {
  const parsed = num(value);
  if (parsed === null) return '-';
  const decimals = Math.abs(parsed) < 10 ? 4 : 2;
  return `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: decimals })}`;
}

function formatDate(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
  } catch (e) {
    return '';
  }
}

function formatHoldTime(trade) {
  const entry = trade.entry_time ? new Date(trade.entry_time) : null;
  const exit = trade.exit_time ? new Date(trade.exit_time) : null;
  if (!entry || !exit || Number.isNaN(entry.getTime()) || Number.isNaN(exit.getTime())) return null;
  const minutes = Math.max(0, Math.round((exit - entry) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  }
  return `${Math.floor(minutes / (60 * 24))}d`;
}

// Rough advance width used for stats-row column spacing only (display elements
// that must not overlap use tspan flow instead). Sized generously for DejaVu,
// the widest font likely to render this card.
function estimateWidth(text, fontSize, weight = 700) {
  const factor = weight >= 700 ? 0.72 : 0.66;
  return String(text).length * fontSize * factor;
}

function text(content, x, y, { size, weight = 400, color = COLORS.textPrimary, anchor = 'start' }) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

function buildTradeCardSvg(trade) {
  const isOpen = !trade.exit_time && !trade.exit_price;
  const currentPrice = num(trade.currentPrice ?? trade.current_price);
  const hasPnl = isOpen ? (num(trade.unrealizedPnl) !== null) : true;
  const pnl = isOpen ? (num(trade.unrealizedPnl) ?? 0) : (num(trade.pnl) ?? 0);
  const pnlPercent = isOpen ? num(trade.unrealizedPnlPercent) : num(trade.pnl_percent ?? trade.pnlPercent);
  const rValue = num(trade.r_value ?? trade.rValue);
  const isWin = pnl >= 0;
  const resultColor = !hasPnl ? COLORS.textSecondary : (isWin ? COLORS.win : COLORS.loss);

  const symbol = String(trade.underlying_symbol || trade.symbol || '').toUpperCase();
  const side = String(trade.side || '').toUpperCase();

  // Hero
  let hero;
  if (!hasPnl) hero = 'OPEN';
  else if (pnlPercent !== null) hero = `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`;
  else if (rValue !== null) hero = `${rValue >= 0 ? '+' : ''}${rValue.toFixed(1)}R`;
  else hero = isWin ? 'WIN' : 'LOSS';

  // Stats
  const stats = [{ label: 'ENTRY', value: formatPrice(trade.entry_price) }];
  if (isOpen) {
    stats.push({ label: 'CURRENT', value: currentPrice !== null ? formatPrice(currentPrice) : '-' });
    const stop = num(trade.stop_loss ?? trade.stopLoss);
    if (stop !== null) stats.push({ label: 'STOP', value: formatPrice(stop) });
  } else {
    stats.push({ label: 'EXIT', value: formatPrice(trade.exit_price) });
    const hold = formatHoldTime(trade);
    if (hold) stats.push({ label: 'HOLD', value: hold });
  }

  const parts = [];
  // Background
  parts.push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLORS.background}"/>`);

  // Brand wordmark. The logo mark is composited on in renderTradeCardPng().
  const baseY = 96;
  parts.push(text('TradeTally', WORDMARK_X, baseY - 4, { size: 30, weight: 600 }));

  // Status / date, top right
  if (isOpen) {
    parts.push(text('OPEN', CARD_WIDTH - PAD, baseY - 4, { size: 24, weight: 700, color: COLORS.brand, anchor: 'end' }));
  } else {
    parts.push(text(formatDate(trade.trade_date), CARD_WIDTH - PAD, baseY - 4, { size: 24, color: COLORS.textSecondary, anchor: 'end' }));
  }

  // Symbol + side label. Rendered as tspans in ONE text element so the renderer
  // spaces them with real glyph widths - estimating font metrics server-side
  // overlapped on DejaVu (prod font), which runs wider than the estimate.
  const symbolY = 218;
  {
    const sideColor = side === 'SHORT' ? COLORS.loss : COLORS.win;
    let line = `<text x="${PAD}" y="${symbolY}" font-family="${FONT}">`;
    line += `<tspan font-size="76" font-weight="700" fill="${COLORS.textPrimary}">${escapeXml(symbol)}</tspan>`;
    if (side) {
      line += `<tspan dx="28" dy="-14" font-size="30" font-weight="700" fill="${sideColor}">${escapeXml(side)}</tspan>`;
    }
    line += '</text>';
    parts.push(line);
  }

  // Hero + secondary ("unrealized", R-multiple) flow the same way.
  const heroY = 380;
  const secondaryParts = [];
  if (isOpen && hasPnl) secondaryParts.push('unrealized');
  if (rValue !== null) secondaryParts.push(`${rValue >= 0 ? '+' : ''}${rValue.toFixed(1)}R`);
  {
    let line = `<text x="${PAD}" y="${heroY}" font-family="${FONT}">`;
    line += `<tspan font-size="128" font-weight="700" fill="${resultColor}">${escapeXml(hero)}</tspan>`;
    if (secondaryParts.length > 0) {
      line += `<tspan dx="36" dy="-8" font-size="40" font-weight="600" fill="${COLORS.textSecondary}">${escapeXml(secondaryParts.join('  ·  '))}</tspan>`;
    }
    line += '</text>';
    parts.push(line);
  }

  // Stats row (fixed columns)
  const statsY = 478;
  let statX = PAD;
  for (const stat of stats) {
    parts.push(text(stat.label, statX, statsY, { size: 20, weight: 600, color: COLORS.textMuted }));
    parts.push(text(stat.value, statX, statsY + 44, { size: 34, weight: 600 }));
    statX += Math.max(estimateWidth(stat.value, 34, 600), estimateWidth(stat.label, 20, 600)) + 80;
  }

  // Footer. A broker-verified trade (cloud-only) swaps the left label for a green
  // check + "Broker-verified" and the right label for the public verify URL.
  parts.push(`<line x1="${PAD}" y1="${CARD_HEIGHT - 86}" x2="${CARD_WIDTH - PAD}" y2="${CARD_HEIGHT - 86}" stroke="${COLORS.divider}" stroke-width="2"/>`);
  const footerY = CARD_HEIGHT - 40;
  const verified = trade.verification?.status === 'broker_verified';
  if (verified) {
    const checkR = 13;
    const checkCx = PAD + checkR;
    const checkCy = footerY - 8;
    parts.push(`<circle cx="${checkCx}" cy="${checkCy}" r="${checkR}" fill="${COLORS.win}"/>`);
    parts.push(`<path d="M ${checkCx - 6} ${checkCy} l 4 4 l 7 -8" fill="none" stroke="#0b1f17" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(text('Broker-verified', checkCx + checkR + 12, footerY, { size: 24, weight: 600, color: COLORS.win }));
    const verifyLabel = trade.verification?.verifyLabel || 'tradetally.io';
    parts.push(text(verifyLabel, CARD_WIDTH - PAD, footerY, { size: 22, weight: 500, color: COLORS.textSecondary, anchor: 'end' }));
  } else {
    parts.push(text('Journaled with TradeTally', PAD, footerY, { size: 24, weight: 500, color: COLORS.textMuted }));
    parts.push(text('tradetally.io', CARD_WIDTH - PAD, footerY, { size: 24, weight: 500, color: COLORS.textSecondary, anchor: 'end' }));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">${parts.join('')}</svg>`;
}

async function renderTradeCardPng(trade) {
  const svg = buildTradeCardSvg(trade);
  const logo = await getLogoBuffer();
  const base = sharp(Buffer.from(svg));
  if (logo) {
    base.composite([{ input: logo, top: LOGO_TOP, left: PAD }]);
  }
  return base.png().toBuffer();
}

module.exports = { buildTradeCardSvg, renderTradeCardPng, CARD_WIDTH, CARD_HEIGHT };
