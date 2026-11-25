const { randomUUID } = require('crypto');
const db = require('../config/database');
const { TAGS } = require('./journalTagSuggestionService');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function error(status, message) { return Object.assign(new Error(message), { status }); }

async function createRun(userId, result, entryId = null) {
  if (!result.model) return null;
  let baselineTags = [];
  if (entryId) {
    if (!UUID.test(entryId)) throw error(400, 'Invalid journal reference');
    const entry = (await db.query('SELECT tags FROM diary_entries WHERE id=$1 AND user_id=$2', [entryId, userId])).rows[0];
    if (!entry) throw error(404, 'Journal entry not found');
    baselineTags = entry.tags || [];
  }
  const id = randomUUID();
  const decisions = result.decisions.map(d => ({ tag: d.tag, status: d.status,
    suggested: d.suggested === true, probability: d.probability }));
  // Evidence stays in the response and the user's own journal, not analytics.
  await db.query(`INSERT INTO journal_tag_suggestion_runs
    (id,user_id,entry_id,provider,model,classifier_version,decisions,baseline_tags)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
  [id, userId, entryId, result.provider, result.model, result.version, JSON.stringify(decisions), JSON.stringify(baselineTags)]);
  // Bound opportunistic cleanup; reads also exclude expired runs.
  await db.query(`DELETE FROM journal_tag_suggestion_runs WHERE id IN
    (SELECT id FROM journal_tag_suggestion_runs WHERE expires_at <= NOW() ORDER BY expires_at LIMIT 500)`);
  return id;
}

async function record(userId, runId, input) {
  if (!UUID.test(runId || '') || !input || !UUID.test(input.eventId || '')) throw error(400, 'Invalid feedback reference');
  if (!['shown', 'accepted', 'dismissed', 'removed', 'saved'].includes(input.action)) throw error(400, 'Invalid feedback action');
  return db.withTransaction(async client => {
    const run = (await client.query(`SELECT * FROM journal_tag_suggestion_runs
      WHERE id=$1 AND user_id=$2 AND expires_at > NOW() FOR UPDATE`, [runId, userId])).rows[0];
    if (!run) throw error(404, 'Suggestion not found');
    const offered = run.decisions.filter(d => d.suggested).map(d => d.tag);
    const events = [];
    if (input.action === 'saved') {
      if (!UUID.test(input.entryId || '')) throw error(400, 'Invalid journal reference');
      // Never trust client-supplied tags or another user's entry as a label.
      const entry = (await client.query(`SELECT id,tags FROM diary_entries
        WHERE id=$1 AND user_id=$2 AND entry_type='diary' FOR SHARE`, [input.entryId, userId])).rows[0];
      if (!entry) throw error(404, 'Journal entry not found');
      if (run.entry_id && run.entry_id !== entry.id) throw error(409, 'Suggestion belongs to a different entry');
      await client.query('UPDATE journal_tag_suggestion_runs SET entry_id=$2 WHERE id=$1', [runId, entry.id]);
      const savedTags = Array.isArray(entry.tags) ? entry.tags : [];
      for (const tag of offered) events.push([tag, savedTags.includes(tag) ? 'saved_accepted' : 'saved_not_selected']);
      for (const tag of savedTags) if (Object.hasOwn(TAGS, tag) && !offered.includes(tag)
        && !(run.baseline_tags || []).includes(tag)) events.push([tag, 'manual_added']);
    } else {
      const tags = input.action === 'shown' ? input.tags : [input.tag];
      if (!Array.isArray(tags) || tags.length > Object.keys(TAGS).length || tags.some(t => !offered.includes(t))) {
        throw error(400, 'Feedback must refer to an offered tag');
      }
      if (input.action === 'shown') await client.query(
        'UPDATE journal_tag_suggestion_runs SET shown_at=COALESCE(shown_at,NOW()) WHERE id=$1', [runId]);
      for (const tag of new Set(tags)) events.push([tag, input.action]);
    }
    for (const [tag, action] of events) {
      await client.query(`INSERT INTO journal_tag_suggestion_feedback (id,run_id,tag,action,event_key)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (run_id,tag,action,event_key) DO NOTHING`,
      [randomUUID(), runId, tag, action, input.action === 'shown' ? 'first_shown' : input.eventId]);
    }
    return { recorded: true };
  });
}

// Journal edits made outside the wrap-up also record the persisted selection.
async function observeEntrySave(userId, entryId) {
  if (!UUID.test(entryId || '')) return;
  const runs = (await db.query(`SELECT id FROM journal_tag_suggestion_runs
    WHERE user_id=$1 AND entry_id=$2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 20`, [userId, entryId])).rows;
  for (const run of runs) await record(userId, run.id, { action: 'saved', eventId: randomUUID(), entryId });
}
module.exports = { createRun, record, observeEntrySave };
