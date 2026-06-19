const EmailService = require('../../src/services/emailService');

describe('EmailService.sendSupportRequest', () => {
  const originalEnv = { ...process.env };
  let createTransporterSpy;
  let logEmailSpy;
  let sendMail;

  beforeEach(() => {
    process.env = { ...originalEnv };
    sendMail = jest.fn().mockResolvedValue({ success: true });
    createTransporterSpy = jest.spyOn(EmailService, 'createTransporter').mockReturnValue({ sendMail });
    logEmailSpy = jest.spyOn(EmailService, 'logEmail').mockResolvedValue();
  });

  afterEach(() => {
    process.env = originalEnv;
    createTransporterSpy.mockRestore();
    logEmailSpy.mockRestore();
  });

  test('sends inline HTML with escaped content and <br> line breaks', async () => {
    await EmailService.sendSupportRequest({
      to: 'owner@example.com',
      userEmail: 'user@example.com',
      username: 'Trader',
      tier: 'Pro',
      subject: `Can't load <settings>`,
      message: `I'm seeing <script>alert("x")</script>\nIt's broken`
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailOptions = sendMail.mock.calls[0][0];

    // No slug/variables — we send raw HTML so the `<br>` line breaks
    // render correctly instead of being escaped to literal text.
    expect(mailOptions.slug).toBeUndefined();
    expect(mailOptions.variables).toBeUndefined();

    // Escaped values appear in the HTML body.
    expect(mailOptions.html).toContain(`Can't load &lt;settings&gt;`);
    expect(mailOptions.html).toContain(
      `I'm seeing &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>It's broken`
    );

    // Plain-text alternative keeps the raw message intact.
    expect(mailOptions.text).toContain(`I'm seeing <script>alert("x")</script>\nIt's broken`);

    // Reply-to routes responses to the requester.
    expect(mailOptions.replyTo).toBe('user@example.com');
  });
});
