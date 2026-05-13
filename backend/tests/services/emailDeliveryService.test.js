const mockAxios = {
  post: jest.fn()
};

const mockTransporter = {
  sendMail: jest.fn()
};

const mockCreateTransport = jest.fn(() => mockTransporter);

jest.mock('axios', () => mockAxios);
jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport
}));

const emailDeliveryService = require('../../src/services/emailDeliveryService');
const emailService = require('../../src/services/emailService');

describe('emailDeliveryService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.SEQUENZY_API_KEY;
    delete process.env.SEQUENZY_API_BASE_URL;
    delete process.env.SEQUENZY_FROM;
    delete process.env.SEQUENZY_FROM_TRANSACTIONAL;
    delete process.env.SEQUENZY_FROM_MARKETING;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('uses Sequenzy by default', () => {
    process.env.SEQUENZY_API_KEY = 'seq_test_key';

    expect(emailDeliveryService.getEmailProvider()).toBe('sequenzy');
    expect(emailDeliveryService.isConfigured()).toBe(true);
  });

  test('requires Sequenzy API key when provider is sequenzy', () => {
    process.env.EMAIL_PROVIDER = 'sequenzy';

    expect(emailDeliveryService.isConfigured()).toBe(false);

    process.env.SEQUENZY_API_KEY = 'seq_test_key';

    expect(emailDeliveryService.isConfigured()).toBe(true);
  });

  test('sends direct HTML content through Sequenzy', async () => {
    process.env.EMAIL_PROVIDER = 'sequenzy';
    process.env.SEQUENZY_API_KEY = 'seq_test_key';
    mockAxios.post.mockResolvedValue({ data: { success: true, jobId: 'job_123' } });

    const result = await emailDeliveryService.sendMail({
      from: { name: 'TradeTally', address: 'noreply@tradetally.io' },
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      replyTo: 'support@tradetally.io',
      headers: {
        'List-Unsubscribe': '<https://tradetally.io/api/unsubscribe?token=test>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://api.sequenzy.com/api/v1/transactional/send',
      expect.objectContaining({
        to: ['user@example.com'],
        from: 'TradeTally <noreply@tradetally.io>',
        replyTo: 'support@tradetally.io',
        subject: 'Test Subject',
        body: '<p>Hello</p>',
        headers: {
          'List-Unsubscribe': '<https://tradetally.io/api/unsubscribe?token=test>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer seq_test_key'
        })
      })
    );
    expect(result).toEqual({ success: true, jobId: 'job_123' });
  });

  test('sends template slug and variables through Sequenzy', async () => {
    process.env.EMAIL_PROVIDER = 'sequenzy';
    process.env.SEQUENZY_API_KEY = 'seq_test_key';
    mockAxios.post.mockResolvedValue({ data: { success: true, jobId: 'job_template' } });

    await emailDeliveryService.sendMail({
      to: 'user@example.com',
      slug: 'email-verification',
      variables: {
        verification_url: 'https://tradetally.io/verify-email/token123'
      }
    });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://api.sequenzy.com/api/v1/transactional/send',
      expect.objectContaining({
        to: ['user@example.com'],
        slug: 'email-verification',
        variables: {
          verification_url: 'https://tradetally.io/verify-email/token123'
        }
      }),
      expect.any(Object)
    );
  });

  test('uses split sender defaults for transactional vs marketing mail', () => {
    process.env.EMAIL_FROM_TRANSACTIONAL = 'noreply@mail.tradetally.io';
    process.env.EMAIL_FROM_MARKETING = 'noreply@updates.tradetally.io';

    expect(emailService.getTransactionalFromAddress()).toBe('noreply@mail.tradetally.io');
    expect(emailService.getMarketingFromAddress()).toBe('noreply@updates.tradetally.io');
  });
});
