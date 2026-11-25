const service = require('../services/journalTagSuggestionService');
const feedback = require('../services/journalTagFeedbackService');

exports.suggestTags = async (req, res) => {
  if (process.env.JOURNAL_TAG_SUGGESTIONS_ENABLED === 'false') {
    return res.status(503).json({ error: 'AI tag suggestions are temporarily disabled.' });
  }
  const text = req.body?.text;
  if (typeof text !== 'string' || text.length > 12000) {
    return res.status(400).json({ error: 'Provide journal text of at most 12,000 characters.' });
  }
  try {
    const result = await service.suggest(req.user.id, text);
    let requestId = null;
    try { requestId = await feedback.createRun(req.user.id, result, req.body.entryId || null); }
    catch { console.warn('[JOURNAL_TAGS] Feedback tracking unavailable'); }
    return res.json({ ...result, requestId });
  } catch (error) {
    // Provider errors can contain request text and credentials. Never serialize them.
    const credits = /credit|Pro subscription/i.test(error.message || '');
    return res.status(credits ? 402 : 503).json({ error: credits
      ? 'AI tag suggestions require available AI credits.'
      : 'AI tag suggestions are unavailable. You can still choose tags yourself.' });
  }
};

exports.recordFeedback = async (req, res) => {
  try {
    return res.json(await feedback.record(req.user.id, req.params.requestId, req.body));
  } catch (error) {
    return res.status([400, 404, 409].includes(error.status) ? error.status : 503)
      .json({ error: error.status ? error.message : 'Feedback is temporarily unavailable.' });
  }
};
