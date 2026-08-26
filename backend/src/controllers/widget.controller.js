const jwt = require('jsonwebtoken');
const { generateWidgetToken } = require('../middleware/auth');
const widgetSnapshotService = require('../services/widgetSnapshotService');

function issueToken(req, res) {
  const token = generateWidgetToken(req.user);
  const decoded = jwt.decode(token);
  res.set('Cache-Control', 'private, no-store');
  res.set('Pragma', 'no-cache');
  res.set('Vary', 'Authorization');
  return res.json({
    token,
    expiresAt: new Date(decoded.exp * 1000).toISOString()
  });
}

async function getSnapshot(req, res, next) {
  try {
    const snapshot = await widgetSnapshotService.getSnapshot(req.user);
    res.set('Cache-Control', 'private, no-store');
    res.set('Vary', 'Authorization');
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
}

module.exports = { issueToken, getSnapshot };
