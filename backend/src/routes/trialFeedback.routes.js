const express = require('express');

const router = express.Router();

router.post('/', (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Trial feedback is no longer available'
  });
});

module.exports = router;
