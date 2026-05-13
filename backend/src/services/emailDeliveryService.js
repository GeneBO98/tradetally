const EmailService = require('./emailService');

module.exports = {
  isConfigured() {
    return EmailService.isConfigured();
  },

  async sendMail(mailOptions) {
    const transporter = EmailService.createTransporter();
    return transporter.sendMail(mailOptions);
  }
};
