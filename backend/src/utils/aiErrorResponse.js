// Provider diagnostics belong in server logs, never in customer responses.
function sendAIUnavailable(res) {
  return res.status(503).json({
    success: false,
    code: 'AI_UNAVAILABLE',
    error: 'AI analysis temporarily unavailable',
    message: 'AI analysis is temporarily unavailable. Please try again shortly.'
  });
}

module.exports = { sendAIUnavailable };
