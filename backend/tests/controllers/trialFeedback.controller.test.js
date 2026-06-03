jest.mock('../../src/services/trialFeedbackService', () => ({
  getSurveyContext: jest.fn(),
  submitFeedback: jest.fn(),
  getOptions: jest.fn(() => [
    { value: 'too_expensive', label: 'Too expensive' }
  ]),
  isValidReason: jest.fn((reason) => reason === 'too_expensive')
}));
jest.mock('../../src/services/trialFeedbackTokenService', () => ({
  verifyToken: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn()
}));

const TrialFeedbackService = require('../../src/services/trialFeedbackService');
const trialFeedbackTokenService = require('../../src/services/trialFeedbackTokenService');
const trialFeedbackController = require('../../src/controllers/trialFeedback.controller');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

describe('trial feedback controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTrialFeedbackStatus', () => {
    it('returns 400 when token is missing', async () => {
      const req = { query: {} };
      const res = createResponse();

      await trialFeedbackController.getTrialFeedbackStatus(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('Missing trial feedback token');
    });

    it('returns 400 when token is invalid', async () => {
      trialFeedbackTokenService.verifyToken.mockReturnValue(null);
      const req = { query: { token: 'bad-token' } };
      const res = createResponse();

      await trialFeedbackController.getTrialFeedbackStatus(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('Invalid or expired trial feedback link');
    });

    it('returns survey data for a valid token', async () => {
      trialFeedbackTokenService.verifyToken.mockReturnValue('user-1');
      TrialFeedbackService.getSurveyContext.mockResolvedValue({
        username: 'alice',
        trialExpired: true,
        trialExpiredAt: '2026-04-18T00:00:00.000Z',
        hasActiveSubscription: false,
        feedback: {
          primaryReason: 'too_expensive',
          feedbackText: '',
          submittedAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z'
        }
      });

      const req = { query: { token: 'good-token' } };
      const res = createResponse();

      await trialFeedbackController.getTrialFeedbackStatus(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.data.feedback.primaryReason).toBe('too_expensive');
      expect(res.payload.data.options).toEqual([
        { value: 'too_expensive', label: 'Too expensive' }
      ]);
    });
  });

  describe('submitTrialFeedback', () => {
    it('returns 400 when reason is invalid', async () => {
      trialFeedbackTokenService.verifyToken.mockReturnValue('user-1');

      const req = {
        body: {
          token: 'good-token',
          primaryReason: 'invalid'
        }
      };
      const res = createResponse();

      await trialFeedbackController.submitTrialFeedback(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('invalid_primary_reason');
      expect(TrialFeedbackService.submitFeedback).not.toHaveBeenCalled();
    });

    it('saves valid feedback', async () => {
      trialFeedbackTokenService.verifyToken.mockReturnValue('user-1');
      TrialFeedbackService.submitFeedback.mockResolvedValue({
        primaryReason: 'too_expensive',
        feedbackText: 'Need to cut costs.',
        submittedAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      });

      const req = {
        body: {
          token: 'good-token',
          primaryReason: 'too_expensive',
          feedbackText: 'Need to cut costs.'
        }
      };
      const res = createResponse();

      await trialFeedbackController.submitTrialFeedback(req, res);

      expect(TrialFeedbackService.submitFeedback).toHaveBeenCalledWith('user-1', {
        primaryReason: 'too_expensive',
        feedbackText: 'Need to cut costs.'
      });
      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.data.feedback.primaryReason).toBe('too_expensive');
    });

    it('returns 404 when trial context is missing', async () => {
      trialFeedbackTokenService.verifyToken.mockReturnValue('user-1');
      TrialFeedbackService.submitFeedback.mockRejectedValue(new Error('Trial not found'));

      const req = {
        body: {
          token: 'good-token',
          primaryReason: 'too_expensive'
        }
      };
      const res = createResponse();

      await trialFeedbackController.submitTrialFeedback(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.payload.error).toBe('Trial not found');
    });
  });
});
