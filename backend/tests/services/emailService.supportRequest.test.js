const EmailService = require('../../src/services/emailService');

describe('EmailService.sendSupportRequest', () => {
  const originalEnv = { ...process.env };
  let createTransporterSpy;
  let logEmailSpy;
  let sendMail;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.EMAIL_PROVIDER = 'sequenzy';
    sendMail = jest.fn().mockResolvedValue({ success: true });
    createTransporterSpy = jest.spyOn(EmailService, 'createTransporter').mockReturnValue({ sendMail });
    logEmailSpy = jest.spyOn(EmailService, 'logEmail').mockResolvedValue();
  });

  afterEach(() => {
    process.env = originalEnv;
    createTransporterSpy.mockRestore();
    logEmailSpy.mockRestore();
  });

  test('preserves apostrophes while escaping HTML in support request content', async () => {
    await EmailService.sendSupportRequest({
      to: 'owner@example.com',
      userEmail: 'user@example.com',
      username: 'Trader',
      tier: 'Pro',
      subject: `Can't load <settings>`,
      message: `I'm seeing <script>alert("x")</script>\nIt's broken`
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'support-request',
      variables: expect.objectContaining({
        support_subject: `Can't load &lt;settings&gt;`,
        message_html: `I'm seeing &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>It's broken`
      }),
      text: expect.stringContaining(`I'm seeing <script>alert("x")</script>\nIt's broken`)
    }));
  });
});
