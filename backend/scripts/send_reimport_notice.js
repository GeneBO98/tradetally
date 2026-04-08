#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const nodemailer = require('nodemailer');
const db = require('../src/config/database');
const EmailService = require('../src/services/emailService');
const Trade = require('../src/models/Trade');

function parseArgs(argv) {
  const args = {
    minTradeDelta: 5,
    minPnlDelta: 1000,
    minAbsPnl: 0,
    limit: 100,
    send: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--min-trade-delta') {
      args.minTradeDelta = parseInt(argv[index + 1], 10) || args.minTradeDelta;
      index += 1;
      continue;
    }

    if (arg === '--min-pnl-delta') {
      args.minPnlDelta = parseFloat(argv[index + 1]) || args.minPnlDelta;
      index += 1;
      continue;
    }

    if (arg === '--min-abs-pnl') {
      args.minAbsPnl = parseFloat(argv[index + 1]) || args.minAbsPnl;
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      args.limit = parseInt(argv[index + 1], 10) || args.limit;
      index += 1;
      continue;
    }

    if (arg === '--send') {
      args.send = true;
    }
  }

  return args;
}

async function loadUsers() {
  const result = await db.query(`
    SELECT id, username, email
    FROM users
    WHERE is_active = true
      AND email IS NOT NULL
      AND email != ''
    ORDER BY created_at ASC
  `);

  return result.rows;
}

async function loadTrades(userId) {
  const result = await db.query(`
    SELECT
      id,
      symbol,
      side,
      quantity,
      entry_price,
      exit_price,
      entry_time,
      exit_time,
      commission,
      fees,
      pnl,
      broker,
      executions,
      instrument_type,
      strike_price,
      expiration_date,
      option_type,
      underlying_symbol,
      account_identifier
    FROM trades
    WHERE user_id = $1
    ORDER BY entry_time ASC NULLS LAST, created_at ASC, id ASC
  `, [userId]);

  return result.rows;
}

function normalizeExecutions(rawExecutions) {
  const executions = Array.isArray(rawExecutions) ? rawExecutions : [];
  const seen = new Set();

  return executions
    .filter(Boolean)
    .map((execution) => ({
      action: String(execution.action || execution.side || '').toLowerCase(),
      quantity: Number(execution.quantity || 0),
      price: Number(execution.price ?? execution.entryPrice ?? execution.exitPrice ?? 0),
      datetime: execution.datetime || execution.entryTime || execution.entry_time || execution.exitTime || execution.exit_time || null,
      commission: Number(execution.commission || 0),
      fees: Number(execution.fees || 0)
    }))
    .filter((execution) => execution.datetime && execution.quantity > 0 && Number.isFinite(execution.price))
    .sort((left, right) => new Date(left.datetime) - new Date(right.datetime))
    .filter((execution) => {
      const key = [
        execution.action,
        execution.quantity,
        execution.price,
        execution.datetime,
        execution.commission,
        execution.fees
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildBucketKey(trade) {
  return [
    trade.symbol,
    trade.instrument_type || 'stock',
    trade.strike_price ?? '',
    trade.expiration_date ?? '',
    trade.option_type ?? '',
    trade.underlying_symbol ?? '',
    trade.account_identifier ?? ''
  ].join('|');
}

function flattenTradeExecutions(trades) {
  const buckets = new Map();

  trades.forEach((trade) => {
    const executions = normalizeExecutions(trade.executions);
    if (executions.length === 0) return;

    const key = buildBucketKey(trade);
    if (!buckets.has(key)) {
      buckets.set(key, {
        trade,
        executions: []
      });
    }

    buckets.get(key).executions.push(...executions);
  });

  for (const bucket of buckets.values()) {
    bucket.executions = normalizeExecutions(bucket.executions);
  }

  return [...buckets.values()];
}

function signedQuantity(action, quantity) {
  return action === 'buy' ? quantity : -quantity;
}

function createTradeSeed(templateTrade, firstExecution, side) {
  return {
    symbol: templateTrade.symbol,
    broker: templateTrade.broker,
    side,
    instrument_type: templateTrade.instrument_type || 'stock',
    strike_price: templateTrade.strike_price,
    expiration_date: templateTrade.expiration_date,
    option_type: templateTrade.option_type,
    underlying_symbol: templateTrade.underlying_symbol,
    account_identifier: templateTrade.account_identifier,
    entryTime: firstExecution.datetime,
    tradeDate: new Date(firstExecution.datetime).toISOString().split('T')[0],
    executions: []
  };
}

function cloneExecution(execution, quantity) {
  return {
    action: execution.action,
    quantity,
    price: execution.price,
    datetime: execution.datetime,
    commission: execution.commission || 0,
    fees: execution.fees || 0
  };
}

function finalizeTrade(trade) {
  const aggregates = Trade.recalculateFromFills({
    side: trade.side,
    instrument_type: trade.instrument_type,
    contract_size: trade.instrument_type === 'option' ? 100 : null,
    point_value: null
  }, trade.executions);

  return {
    ...trade,
    quantity: aggregates.quantity,
    entryPrice: aggregates.entry_price,
    exitPrice: aggregates.exit_price,
    entryTime: aggregates.entry_time,
    exitTime: aggregates.exit_time,
    tradeDate: aggregates.trade_date,
    commission: aggregates.commission,
    fees: aggregates.fees,
    pnl: aggregates.pnl ?? 0,
    pnlPercent: aggregates.pnl_percent ?? 0
  };
}

function rebuildBucket(bucket) {
  const rebuilt = [];
  let currentPosition = 0;
  let currentTrade = null;

  const startNewTrade = (execution, side) => {
    currentTrade = createTradeSeed(bucket.trade, execution, side);
  };

  bucket.executions.forEach((execution) => {
    let remainingQty = execution.quantity;

    while (remainingQty > 0) {
      const currentSign = Math.sign(currentPosition);
      const executionSign = Math.sign(signedQuantity(execution.action, 1));

      if (currentPosition === 0 || currentSign === executionSign) {
        if (!currentTrade) {
          startNewTrade(execution, execution.action === 'buy' ? 'long' : 'short');
        }

        currentTrade.executions.push(cloneExecution(execution, remainingQty));
        currentPosition += signedQuantity(execution.action, remainingQty);
        remainingQty = 0;
        continue;
      }

      const closingQty = Math.min(Math.abs(currentPosition), remainingQty);
      currentTrade.executions.push(cloneExecution(execution, closingQty));
      currentPosition += signedQuantity(execution.action, closingQty);
      remainingQty -= closingQty;

      if (currentPosition === 0 && currentTrade) {
        rebuilt.push(finalizeTrade(currentTrade));
        currentTrade = null;
      }

      if (remainingQty > 0 && currentPosition === 0) {
        startNewTrade(execution, execution.action === 'buy' ? 'long' : 'short');
      }
    }
  });

  if (currentTrade && currentTrade.executions.length > 0) {
    rebuilt.push(finalizeTrade(currentTrade));
  }

  return rebuilt;
}

function rebuildTrades(trades) {
  return flattenTradeExecutions(trades).flatMap(rebuildBucket);
}

function aggregateTrades(trades) {
  return trades.reduce((summary, trade) => {
    const isOpen = !trade.exitTime && !trade.exit_time && !trade.exitPrice && !trade.exit_price;
    summary.tradeCount += 1;
    summary.openCount += isOpen ? 1 : 0;
    summary.closedCount += isOpen ? 0 : 1;
    summary.quantity += Number(trade.quantity || 0);
    summary.commission += Number(trade.commission || 0);
    summary.fees += Number(trade.fees || 0);
    summary.pnl += Number(trade.pnl || 0);
    return summary;
  }, {
    tradeCount: 0,
    openCount: 0,
    closedCount: 0,
    quantity: 0,
    commission: 0,
    fees: 0,
    pnl: 0
  });
}

function round(value, decimals = 6) {
  return Number(Number(value || 0).toFixed(decimals));
}

function buildAuditRow(user, currentTrades, rebuiltTrades) {
  const current = aggregateTrades(currentTrades);
  const rebuilt = aggregateTrades(rebuiltTrades);

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    currentTradeCount: current.tradeCount,
    rebuiltTradeCount: rebuilt.tradeCount,
    tradeCountDelta: rebuilt.tradeCount - current.tradeCount,
    currentPnl: round(current.pnl),
    rebuiltPnl: round(rebuilt.pnl),
    pnlDelta: round(rebuilt.pnl - current.pnl),
    absPnlDelta: round(Math.abs(rebuilt.pnl - current.pnl))
  };
}

function isDeliverableEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return false;

  const blockedDomains = [
    'passmail.net',
    'passmail.com',
    'yopmail.com',
    'mailinator.com',
    'jsncos.com',
    'example.com'
  ];

  return !blockedDomains.some((domain) => normalized.endsWith(`@${domain}`));
}

function buildEmailContent(username) {
  const safeName = username || 'there';
  const dashboardUrl = `${process.env.FRONTEND_URL || 'https://tradetally.io'}/import`;

  const html = EmailService.getBaseTemplate(
    'Trade import refresh available',
    `
      <h1 style="color: #18181b; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        A quick note about your trade history
      </h1>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        Hi ${safeName},
      </p>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        We recently improved several trade import and parsing paths in TradeTally. If you imported trades previously, a fresh import may produce cleaner trade grouping and more up-to-date performance calculations.
      </p>
      <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        No action is required, but if you want your account to reflect the latest importer improvements, we recommend re-importing your recent broker files.
      </p>
      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="${dashboardUrl}" style="${EmailService.getButtonStyle()}">
          Re-import Trades
        </a>
      </div>
      <p style="color: #a1a1aa; font-size: 13px; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        If you run into any issues during re-import, reply to this email and we’ll help.
      </p>
    `
  );

  const text = [
    `Hi ${safeName},`,
    '',
    'We recently improved several trade import and parsing paths in TradeTally.',
    'If you imported trades previously, a fresh import may produce cleaner trade grouping and more up-to-date performance calculations.',
    '',
    'No action is required, but if you want your account to reflect the latest importer improvements, we recommend re-importing your recent broker files.',
    '',
    `Re-import here: ${dashboardUrl}`,
    '',
    'If you run into any issues during re-import, reply to this email and we’ll help.'
  ].join('\n');

  return {
    subject: 'A quick TradeTally import update',
    html,
    text
  };
}

async function loadRecipients(args) {
  const users = await loadUsers();
  const recipients = [];

  for (const user of users) {
    if (!isDeliverableEmail(user.email)) continue;
    if (user.email.toLowerCase() === 'brennon.overton@icloud.com') continue;

    const currentTrades = await loadTrades(user.id);
    if (currentTrades.length === 0) continue;

    const rebuiltTrades = rebuildTrades(currentTrades);
    const row = buildAuditRow(user, currentTrades, rebuiltTrades);

    if (
      Math.abs(row.tradeCountDelta) >= args.minTradeDelta ||
      row.absPnlDelta >= args.minPnlDelta ||
      Math.abs(row.currentPnl) >= args.minAbsPnl ||
      Math.abs(row.rebuiltPnl) >= args.minAbsPnl
    ) {
      recipients.push(row);
    }
  }

  recipients.sort((left, right) => right.absPnlDelta - left.absPnlDelta);
  return recipients.slice(0, args.limit);
}

async function sendEmails(recipients) {
  if (!EmailService.isConfigured()) {
    throw new Error('Email is not configured');
  }

  const transporter = EmailService.createTransporter();
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@tradetally.io';

  for (const recipient of recipients) {
    const { subject, html, text } = buildEmailContent(recipient.username);
    const mailOptions = {
      from: {
        name: 'TradeTally',
        address: fromAddress
      },
      to: recipient.email,
      subject,
      html,
      text
    };

    await transporter.sendMail(mailOptions);
    await EmailService.logEmail({
      recipient: recipient.email,
      subject,
      emailType: 'reimport_notice',
      htmlBody: html,
      textBody: text,
      status: 'sent',
      userId: recipient.userId,
      metadata: {
        username: recipient.username,
        absPnlDelta: recipient.absPnlDelta,
        currentPnl: recipient.currentPnl,
        rebuiltPnl: recipient.rebuiltPnl,
        tradeCountDelta: recipient.tradeCountDelta
      }
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recipients = await loadRecipients(args);

  if (!args.send) {
    console.log(JSON.stringify({
      send: false,
      recipientCount: recipients.length,
      filters: {
        minTradeDelta: args.minTradeDelta,
        minPnlDelta: args.minPnlDelta,
        minAbsPnl: args.minAbsPnl,
        limit: args.limit
      },
      recipients
    }, null, 2));
    return;
  }

  await sendEmails(recipients);
  console.log(JSON.stringify({
    send: true,
    recipientCount: recipients.length,
    recipients: recipients.map((recipient) => ({
      username: recipient.username,
      email: recipient.email,
      absPnlDelta: recipient.absPnlDelta
    }))
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
