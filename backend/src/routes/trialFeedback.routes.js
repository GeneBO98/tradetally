const express = require('express');
const router = express.Router();
const trialFeedbackController = require('../controllers/trialFeedback.controller');

router.get('/', trialFeedbackController.getTrialFeedbackStatus);
router.post('/', trialFeedbackController.submitTrialFeedback);

module.exports = router;
