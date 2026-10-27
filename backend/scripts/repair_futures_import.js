// Dry-run by default. Requires one reviewed user/import; never repairs all users.
// --username=... --import-id=... [--env-file=...] [--apply --backup=/absolute/path.json]
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { planFuturesImportRepair } = require('../src/utils/futuresImportRepair');

function argument(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const username = argument('username');
  const importId = argument('import-id');
  const apply = process.argv.includes('--apply');
  const backup = argument('backup');
  if (!username || !importId) throw new Error('Specify --username and --import-id. Review a dry run before applying.');
  if (apply && (!backup || !path.isAbsolute(backup))) throw new Error('--apply requires an absolute --backup path.');
  const env = require('dotenv').parse(fs.readFileSync(argument('env-file') || path.join(__dirname, '../.env')));
  const client = new Client({
    host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
    options: `-c statement_timeout=15000 -c lock_timeout=3000${apply ? '' : ' -c default_transaction_read_only=on'}`
  });
  await client.connect();
  try {
    await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY');
    const user = (await client.query('SELECT id,timezone FROM users WHERE username=$1', [username])).rows[0];
    if (!user) throw new Error('User not found.');
    const log = (await client.query('SELECT id,broker,error_details FROM import_logs WHERE user_id=$1 AND id=$2', [user.id, importId])).rows[0];
    if (!log) throw new Error('Import not found for this user.');
    const trades = (await client.query(`SELECT * FROM trades WHERE user_id=$1 AND import_id=$2 ORDER BY id${apply ? ' FOR UPDATE' : ''}`, [user.id, importId])).rows;
    const plans = trades.map(trade => planFuturesImportRepair(trade, log, user.timezone || 'UTC'));
    const repairs = plans.filter(plan => !plan.skipped);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry_run', username, importId, plans: plans.map(plan => {
      if (plan.skipped) return plan;
      const { executions, ...after } = plan.after;
      return { ...plan, after };
    }), beforePnl: trades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0),
    afterPnl: plans.reduce((sum, plan, index) => sum + Number(plan.skipped ? trades[index].pnl || 0 : plan.after.pnl || 0), 0) }, null, 2));
    if (!apply || repairs.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    // Exclusive creation, private permissions, and fsync ensure the original
    // records are durable before any trade is changed. Includes derived values.
    const descriptor = fs.openSync(backup, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, JSON.stringify({ createdAt: new Date().toISOString(), userId: user.id, importId, trades, plans }, null, 2));
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }

    for (const plan of repairs) {
      const after = plan.after;
      const updated = await client.query(`UPDATE trades SET
        point_value=$1,tick_size=COALESCE($2,tick_size),executions=$3::jsonb,
        pnl=$4,pnl_percent=$5,commission=$6,fees=$7,r_value=$8,
        mae=CASE WHEN $9 THEN NULL ELSE mae END,mfe=CASE WHEN $9 THEN NULL ELSE mfe END,
        post_exit_mae=CASE WHEN $9 THEN NULL ELSE post_exit_mae END,
        post_exit_mfe=CASE WHEN $9 THEN NULL ELSE post_exit_mfe END,
        management_r=NULL,entry_commission=$13,exit_commission=$14,updated_at=NOW()
        WHERE id=$10 AND user_id=$11 AND import_id=$12 RETURNING id`,
      [after.pointValue,after.tickSize,JSON.stringify(after.executions),after.pnl,after.pnlPercent,after.commission,after.fees,after.rValue,plan.multiplierChanged,plan.id,user.id,importId,after.entryCommission,after.exitCommission]);
      if (updated.rowCount !== 1) throw new Error(`Trade changed during repair: ${plan.id}`);
    }
    await client.query('DELETE FROM analytics_cache WHERE user_id=$1', [user.id]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ repaired: repairs.length, backup }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
