const EmailService = require('./emailService');
const TierService = require('./tierService');
const weeklyInsights = require('./weeklyDigest/insights');
const aiRecap = require('./weeklyDigest/aiRecap');
const maskEmail = require('../utils/maskEmail');

class WeeklyDigestScheduler {
  static async runScheduledTasks() {
    if (new Date().getUTCDay() === 1) await this.sendWeeklyDigests();
  }

  static async sendWeeklyDigests() {
    try {
      console.log('[EMAIL] Sending weekly digests...');
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const aggregates = await weeklyInsights.fetchWeeklyAggregates(startStr, endStr);
      if (aggregates.length === 0) {
        console.log('No weekly digests to send');
        return;
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://tradetally.io';
      const dashboardUrl = `${frontendUrl}/dashboard`;
      let aiRecapCount = 0;

      for (const agg of aggregates) {
        try {
          const highlight = weeklyInsights.pickHighlight(agg, {
            startDate: startStr,
            endDate: endStr,
            frontendUrl,
          });

          const tier = await TierService.getUserTier(agg.userId);
          const isPro = tier === 'pro';

          let recap = null;
          if (isPro) {
            recap = await aiRecap.generateRecap(agg.userId, agg, startStr, endStr);
            if (recap) aiRecapCount++;
          }

          await EmailService.sendWeeklyDigestEmail(
            agg.email,
            agg.username || agg.fullName || 'there',
            {
              tradeCount: agg.tradeCount,
              totalPnL: agg.totalPnL,
              dashboardUrl,
              highlight,
              aiRecap: recap,
              isPro,
            },
            agg.userId
          );
        } catch (err) {
          console.error(`Failed to send weekly digest to ${maskEmail(agg.email)}:`, err.message);
        }
      }
      console.log(`Weekly digests sent: ${aggregates.length} (AI recaps: ${aiRecapCount})`);
    } catch (error) {
      console.error('Error sending weekly digests:', error);
    }
  }

  static startScheduler() {
    if (this._interval) return;
    this.runScheduledTasks();
    this._interval = setInterval(() => this.runScheduledTasks(), 24 * 60 * 60 * 1000);
  }

  static stopScheduler() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }
}
module.exports = WeeklyDigestScheduler;
