const db = require('../config/database');
const EmailService = require('./emailService');

class TrialScheduler {
  
  // Run all trial-related scheduled tasks
  static async runScheduledTasks() {
    try {
      console.log('[START] Running trial scheduled tasks...');
      
      // Check for trials expiring in 3 days and send reminder
      await this.sendTrialReminders(3);
      
      // Check for trials expiring in 1 day and send final reminder
      await this.sendTrialReminders(1);
      
      // Check for expired trials and send expiration notice
      await this.sendTrialExpirationNotices();
      
      console.log('[SUCCESS] Trial scheduled tasks completed');
      
    } catch (error) {
      console.error('[ERROR] Error running trial scheduled tasks:', error);
    }
  }
  
  // Send trial reminder emails to users whose trials are expiring soon
  static async sendTrialReminders(daysRemaining) {
    try {
      console.log(`[EMAIL] Checking for trials expiring in ${daysRemaining} days...`);
      
      // Calculate the date range for trials expiring in the specified number of days
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysRemaining);
      
      // Find users whose trials expire on the target date and haven't been notified yet
      const query = `
        SELECT 
          u.id,
          u.email,
          u.username,
          u.full_name,
          to_.expires_at,
          to_.reason
        FROM tier_overrides to_
        INNER JOIN users u ON to_.user_id = u.id
        WHERE to_.tier = 'pro'
          AND to_.reason ILIKE '%trial%'
          AND to_.expires_at::date = $1::date
          AND to_.expires_at > NOW()
          AND (to_.reminder_sent_at IS NULL OR to_.reminder_sent_at::date != CURRENT_DATE)
      `;
      
      const result = await db.query(query, [targetDate]);
      
      if (result.rows.length === 0) {
        console.log(`No trial reminders to send for ${daysRemaining} days`);
        return;
      }
      
      console.log(`Found ${result.rows.length} users with trials expiring in ${daysRemaining} days`);
      
      for (const user of result.rows) {
        try {
          await EmailService.sendTrialExpirationEmail(
            user.email,
            user.username || user.full_name || 'there',
            daysRemaining
          );
          
          // Mark reminder as sent
          await db.query(
            'UPDATE tier_overrides SET reminder_sent_at = NOW() WHERE user_id = $1',
            [user.id]
          );
          
          console.log(`Trial reminder sent to ${user.email} (${daysRemaining} days)`);
        } catch (error) {
          console.error(`Failed to send trial reminder to ${user.email}:`, error);
        }
      }
      
    } catch (error) {
      console.error(`Error sending trial reminders for ${daysRemaining} days:`, error);
    }
  }
  
  // Send trial expiration notices to users whose trials have expired
  static async sendTrialExpirationNotices() {
    try {
      console.log('[EMAIL] Checking for expired trials...');
      
      // Find users whose trials expired in the last 24 hours and haven't been notified
      const query = `
        SELECT 
          u.id,
          u.email,
          u.username,
          u.full_name,
          to_.expires_at,
          to_.reason
        FROM tier_overrides to_
        INNER JOIN users u ON to_.user_id = u.id
        WHERE to_.tier = 'pro'
          AND to_.reason ILIKE '%trial%'
          AND to_.expires_at < NOW()
          AND to_.expires_at > (NOW() - INTERVAL '24 hours')
          AND (to_.expiration_sent_at IS NULL)
      `;
      
      const result = await db.query(query);
      
      if (result.rows.length === 0) {
        console.log('No trial expiration notices to send');
        return;
      }
      
      console.log(`Found ${result.rows.length} users with expired trials`);
      
      for (const user of result.rows) {
        try {
          await EmailService.sendTrialExpirationEmail(
            user.email,
            user.username || user.full_name || 'there',
            0 // 0 means expired
          );
          
          // Mark expiration notice as sent
          await db.query(
            'UPDATE tier_overrides SET expiration_sent_at = NOW() WHERE user_id = $1',
            [user.id]
          );
          
          console.log(`Trial expiration notice sent to ${user.email}`);
        } catch (error) {
          console.error(`Failed to send trial expiration notice to ${user.email}:`, error);
        }
      }
      
    } catch (error) {
      console.error('Error sending trial expiration notices:', error);
    }
  }
  
  // Start the trial scheduler
  static startScheduler() {
    console.log('[START] Starting trial scheduler...');
    
    // Run immediately
    this.runScheduledTasks();
    
    // Run every 6 hours (4 times per day)
    setInterval(() => {
      this.runScheduledTasks();
    }, 6 * 60 * 60 * 1000);
    
    console.log('[SUCCESS] Trial scheduler started (runs every 6 hours)');
  }
}

module.exports = TrialScheduler;