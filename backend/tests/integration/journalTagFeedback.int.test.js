const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const feedback = require('../../src/services/journalTagFeedbackService');
const owner = randomUUID(), other = randomUUID();
let entryId, runId;
const result = { version: 1, provider: 'lightweight', model: 'test-model', decisions: [
  { tag: 'fomo', status: 'present', suggested: true, probability: 0.92, evidence: 'Private quotation must not enter analytics.' },
  { tag: 'patient', status: 'insufficient_evidence', suggested: false, probability: 0.1 }
] };
beforeAll(async () => {
  for (const id of [owner, other]) await db.query(`INSERT INTO users(id,email,username,password_hash)
    VALUES ($1,$2,$3,'test')`, [id, `${id}@example.invalid`, `tag-${id}`]);
});
beforeEach(async () => {
  await db.query('DELETE FROM journal_tag_suggestion_runs WHERE user_id=ANY($1::uuid[])', [[owner, other]]);
  entryId = randomUUID();
  await db.query(`INSERT INTO diary_entries(id,user_id,entry_date,entry_type,content,tags)
    VALUES ($1,$2,CURRENT_DATE,'diary','Synthetic private text',ARRAY['patient'])`, [entryId, owner]);
  runId = await feedback.createRun(owner, result, entryId);
});
afterAll(async () => {
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[owner, other]]);
  await db.pool.end();
});
const event = (action, fields = {}) => ({ action, eventId: randomUUID(), ...fields });

test('stores metadata without excerpts, and impressions are idempotent', async () => {
  const run = (await db.query('SELECT * FROM journal_tag_suggestion_runs WHERE id=$1', [runId])).rows[0];
  expect(JSON.stringify(run)).not.toContain('Private quotation');
  expect(run.baseline_tags).toEqual(['patient']);
  await feedback.record(owner, runId, event('shown', { tags: ['fomo'] }));
  await feedback.record(owner, runId, event('shown', { tags: ['fomo'] }));
  const rows = (await db.query('SELECT * FROM journal_tag_suggestion_feedback WHERE run_id=$1', [runId])).rows;
  expect(rows).toHaveLength(1);
  expect((await db.query('SELECT shown_at FROM journal_tag_suggestion_runs WHERE id=$1', [runId])).rows[0].shown_at).not.toBeNull();
});
test('isolates owners and refuses arbitrary tags', async () => {
  await expect(feedback.record(other, runId, event('accepted', { tag: 'fomo' }))).rejects.toMatchObject({ status: 404 });
  await expect(feedback.record(owner, runId, event('accepted', { tag: 'patient' }))).rejects.toMatchObject({ status: 400 });
});
test('checks actual persisted tags and distinguishes manual additions from existing tags', async () => {
  await db.query("UPDATE diary_entries SET tags=ARRAY['fomo','patient','hesitation'] WHERE id=$1", [entryId]);
  const saved = event('saved', { entryId, tags: ['malicious-client-value'] });
  await feedback.record(owner, runId, saved);
  await feedback.record(owner, runId, saved);
  const rows = (await db.query('SELECT tag,action FROM journal_tag_suggestion_feedback WHERE run_id=$1 ORDER BY tag', [runId])).rows;
  expect(rows).toEqual([{ tag: 'fomo', action: 'saved_accepted' }, { tag: 'hesitation', action: 'manual_added' }]);
  await db.query("UPDATE diary_entries SET tags=ARRAY['patient'] WHERE id=$1", [entryId]);
  await feedback.observeEntrySave(owner, entryId);
  expect((await db.query("SELECT count(*)::int AS n FROM journal_tag_suggestion_feedback WHERE run_id=$1 AND action='saved_not_selected'", [runId])).rows[0].n).toBe(1);
});
test('does not link feedback to another owner or a second entry', async () => {
  const foreignId = randomUUID();
  await db.query(`INSERT INTO diary_entries(id,user_id,entry_date,entry_type,content)
    VALUES ($1,$2,CURRENT_DATE,'diary','Synthetic')`, [foreignId, other]);
  await expect(feedback.record(owner, runId, event('saved', { entryId: foreignId }))).rejects.toMatchObject({ status: 404 });
  const second = randomUUID();
  await db.query(`INSERT INTO diary_entries(id,user_id,entry_date,entry_type,content)
    VALUES ($1,$2,CURRENT_DATE,'diary','Synthetic')`, [second, owner]);
  await expect(feedback.record(owner, runId, event('saved', { entryId: second }))).rejects.toMatchObject({ status: 409 });
});
test('expired feedback is rejected and user deletion cascades metadata', async () => {
  await db.query("UPDATE journal_tag_suggestion_runs SET expires_at=NOW()-INTERVAL '1 day' WHERE id=$1", [runId]);
  await expect(feedback.record(owner, runId, event('accepted', { tag: 'fomo' }))).rejects.toMatchObject({ status: 404 });
  const temporaryUser = randomUUID();
  await db.query(`INSERT INTO users(id,email,username,password_hash) VALUES ($1,$2,$3,'test')`,
    [temporaryUser, `${temporaryUser}@example.invalid`, `tag-${temporaryUser}`]);
  const temporaryRun = await feedback.createRun(temporaryUser, result);
  await feedback.record(temporaryUser, temporaryRun, event('accepted', { tag: 'fomo' }));
  await db.query('DELETE FROM users WHERE id=$1', [temporaryUser]);
  expect((await db.query('SELECT id FROM journal_tag_suggestion_feedback WHERE run_id=$1', [temporaryRun])).rows).toEqual([]);
});
