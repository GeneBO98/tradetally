jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));
jest.mock('../../src/services/unsubscribeService', () => ({}));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/trialFeedbackTokenService', () => ({ generateToken: jest.fn(() => 'TKN') }));

const EmailService = require('../../src/services/emailService');

describe('EmailService trial-feedback survey block', () => {
  const OLD_ENV = process.env.FRONTEND_URL;
  beforeAll(() => { process.env.FRONTEND_URL = 'https://app.example.com'; });
  afterAll(() => { process.env.FRONTEND_URL = OLD_ENV; });

  it('getTrialFeedbackUrl builds a tokenized, reason-tagged URL', () => {
    const url = EmailService.getTrialFeedbackUrl('user-1', 'too_expensive');
    expect(url).toBe('https://app.example.com/trial-feedback?token=TKN&reason=too_expensive');
  });

  it('getTrialFeedbackSurveyBlock returns the 8 reason links with html + text', () => {
    const block = EmailService.getTrialFeedbackSurveyBlock('user-1');
    expect(block.links).toHaveLength(8);
    expect(block.html).toContain('what stopped you from subscribing');
    expect(block.html).toContain('Too expensive');
    expect(block.html).toContain('token=TKN');
    expect(block.text).toContain('Too expensive');
    block.links.forEach((l) => expect(l.url).toContain('token=TKN'));
  });

  it('returns an empty block when userId is missing (never blocks the email)', () => {
    expect(EmailService.getTrialFeedbackSurveyBlock(null)).toEqual({ html: '', text: '', links: [] });
  });
});
