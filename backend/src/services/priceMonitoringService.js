const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

class PriceMonitoringService {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = null;
    this.intervalMs = 30000; // 30 seconds
    this.emailTransporter = null;
    this.initializeEmailTransporter();
  }

  initializeEmailTransporter() {
    if (this.isEmailConfigured()) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_PORT == 465,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    }
  }

  isEmailConfigured() {
    return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
  }

  async start() {
    if (this.isRunning) {
      console.log('Price monitoring service is already running');
      return;
    }

    console.log('Starting price monitoring service...');
    this.isRunning = true;

    // Initial run
    await this.monitorPrices();

    // Set up interval
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorPrices();
      } catch (error) {
        console.error('Error in price monitoring interval:', error);
      }
    }, this.intervalMs);

    console.log(`Price monitoring service started with ${this.intervalMs}ms interval`);
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping price monitoring service...');
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('Price monitoring service stopped');
  }

  async monitorPrices() {
    try {
      // Get all unique symbols from active alerts and watchlists
      const symbolsQuery = `
        SELECT DISTINCT symbol 
        FROM (
          SELECT symbol FROM price_alerts WHERE is_active = TRUE
          UNION
          SELECT symbol FROM watchlist_items
        ) AS symbols
      `;
      
      const symbolsResult = await db.query(symbolsQuery);
      const symbols = symbolsResult.rows.map(row => row.symbol);

      if (symbols.length === 0) {
        logger.logDebug('No symbols to monitor');
        return;
      }

      logger.logDebug(`Monitoring ${symbols.length} symbols: ${symbols.join(', ')}`);

      // Track API failures to detect widespread outages
      let consecutiveFailures = 0;
      let successCount = 0;

      // Update prices for all symbols
      for (const symbol of symbols) {
        const success = await this.updateSymbolPrice(symbol);
        
        if (success) {
          successCount++;
          consecutiveFailures = 0; // Reset failure counter on success
        } else {
          consecutiveFailures++;
          
          // If we have too many consecutive failures, the API might be down
          if (consecutiveFailures >= 5) {
            logger.logWarn(`Detected possible API outage after ${consecutiveFailures} consecutive failures. Pausing monitoring for this cycle.`);
            break;
          }
        }
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.logDebug(`Price monitoring cycle complete: ${successCount}/${symbols.length} symbols updated successfully`);

      // Only check for triggered alerts if we had some successful price updates
      if (successCount > 0) {
        await this.checkAlerts();
      }

    } catch (error) {
      logger.logError('Error in monitorPrices:', error);
    }
  }

  async updateSymbolPrice(symbol) {
    try {
      let priceData = null;
      let dataSource = 'finnhub';

      // Try Finnhub first
      try {
        priceData = await finnhub.getQuote(symbol);
        if (!priceData || !priceData.c) {
          throw new Error('Invalid price data from Finnhub');
        }
      } catch (finnhubError) {
        const errorMsg = finnhubError?.message || 'Unknown Finnhub error';
        
        // Only log detailed errors for non-502 errors to avoid spam during outages
        if (errorMsg.includes('502')) {
          logger.logDebug(`Finnhub temporarily unavailable for ${symbol} (502 error)`);
        } else {
          logger.logWarn(`Finnhub failed for ${symbol}: ${errorMsg}`);
        }
        
        // Return false to indicate failure
        return false;
      }

      const currentPrice = priceData.c;
      const previousClose = priceData.pc || 0;
      const priceChange = priceData.d || (currentPrice - previousClose);
      const percentChange = priceData.dp || (previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0);

      // Update price monitoring table
      await db.query(`
        INSERT INTO price_monitoring (symbol, current_price, previous_price, price_change, percent_change, data_source)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (symbol) DO UPDATE SET
          previous_price = price_monitoring.current_price,
          current_price = $2,
          price_change = $4,
          percent_change = $5,
          last_updated = CURRENT_TIMESTAMP,
          data_source = $6
      `, [symbol, currentPrice, previousClose, priceChange, percentChange, dataSource]);

      logger.logDebug(`Updated price for ${symbol}: ${currentPrice} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`);

      // Return true to indicate success
      return true;

    } catch (error) {
      logger.logError(`Error updating price for ${symbol}:`, error);
      return false;
    }
  }

  async checkAlerts() {
    try {
      // Get all active alerts with current prices
      const alertsQuery = `
        SELECT 
          pa.id,
          pa.user_id,
          pa.symbol,
          pa.alert_type,
          pa.target_price,
          pa.change_percent,
          pa.current_price as alert_creation_price,
          pa.email_enabled,
          pa.browser_enabled,
          pa.repeat_enabled,
          pa.triggered_at,
          COALESCE(pm.current_price::NUMERIC, 0) AS current_price,
          pm.percent_change,
          u.email,
          us.email_notifications as user_email_enabled
        FROM price_alerts pa
        JOIN users u ON pa.user_id = u.id
        LEFT JOIN user_settings us ON u.id = us.user_id
        LEFT JOIN price_monitoring pm ON pa.symbol = pm.symbol
        WHERE pa.is_active = TRUE
        AND u.tier = 'pro'
        AND pm.current_price IS NOT NULL
      `;

      const alertsResult = await db.query(alertsQuery);
      const alerts = alertsResult.rows;

      for (const alert of alerts) {
        const shouldTrigger = this.shouldTriggerAlert(alert);
        
        if (shouldTrigger) {
          await this.triggerAlert(alert);
        }
      }

    } catch (error) {
      logger.logError('Error checking alerts:', error);
    }
  }

  shouldTriggerAlert(alert) {
    const { alert_type, target_price, change_percent, current_price, percent_change, repeat_enabled, triggered_at } = alert;

    // If alert was already triggered and repeat is disabled, don't trigger again
    if (triggered_at && !repeat_enabled) {
      return false;
    }

    // If repeat is enabled, only trigger again if it's been at least 1 hour since last trigger
    if (triggered_at && repeat_enabled) {
      const hoursSinceLastTrigger = (Date.now() - new Date(triggered_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastTrigger < 1) {
        return false;
      }
    }

    switch (alert_type) {
      case 'above':
        return current_price >= target_price;
      
      case 'below':
        return current_price <= target_price;
      
      case 'change_percent':
        return Math.abs(percent_change) >= Math.abs(change_percent);
      
      default:
        return false;
    }
  }

  async triggerAlert(alert) {
    try {
      const { id, user_id, symbol, alert_type, target_price, change_percent, current_price, email_enabled, browser_enabled, email, user_email_enabled } = alert;

      // Create notification message
      let message = '';
      const currentPriceNum = parseFloat(current_price);
      const targetPriceNum = parseFloat(target_price);
      const changePercentNum = parseFloat(change_percent);
      const percentChangeNum = parseFloat(alert.percent_change);
      
      switch (alert_type) {
        case 'above':
          message = `${symbol} has reached $${currentPriceNum.toFixed(2)}, which is above your target of $${targetPriceNum.toFixed(2)}`;
          break;
        case 'below':
          message = `${symbol} has dropped to $${currentPriceNum.toFixed(2)}, which is below your target of $${targetPriceNum.toFixed(2)}`;
          break;
        case 'change_percent':
          message = `${symbol} has moved ${percentChangeNum >= 0 ? '+' : ''}${percentChangeNum.toFixed(2)}%, reaching your threshold of ${changePercentNum >= 0 ? '+' : ''}${changePercentNum.toFixed(2)}%`;
          break;
      }

      // Send email notification if enabled
      if (email_enabled && user_email_enabled && this.isEmailConfigured() && email) {
        await this.sendEmailNotification(email, symbol, message, alert);
      }

      // Create browser notification record (actual browser notification would be handled by frontend WebSocket/SSE)
      if (browser_enabled) {
        await this.createBrowserNotification(alert, message);
      }

      // Update alert triggered_at timestamp
      await db.query(
        'UPDATE price_alerts SET triggered_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      console.log(`Alert triggered for ${symbol}: ${message}`);

    } catch (error) {
      logger.logError('Error triggering alert:', error);
    }
  }

  async sendEmailNotification(email, symbol, message, alert) {
    try {
      if (!this.emailTransporter) {
        logger.logWarn('Email not configured, skipping email notification');
        return;
      }

      const subject = `Price Alert: ${symbol}`;
      const html = `
        <h2>Price Alert Triggered</h2>
        <p><strong>${message}</strong></p>
        <hr>
        <h3>Alert Details:</h3>
        <ul>
          <li><strong>Symbol:</strong> ${symbol}</li>
          <li><strong>Current Price:</strong> $${parseFloat(alert.current_price).toFixed(2)}</li>
          <li><strong>Alert Type:</strong> ${alert.alert_type}</li>
          ${alert.target_price ? `<li><strong>Target Price:</strong> $${parseFloat(alert.target_price).toFixed(2)}</li>` : ''}
          ${alert.change_percent ? `<li><strong>Target Change:</strong> ${alert.change_percent}%</li>` : ''}
          <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p><em>This alert was sent from your TradeTally Pro account.</em></p>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: subject,
        html: html
      });

      // Log notification
      await this.logNotification(alert.id, alert.user_id, symbol, 'email', message, alert, 'sent');

      console.log(`Email notification sent to ${email} for ${symbol} alert`);

    } catch (error) {
      logger.logError('Error sending email notification:', error);
      
      // Log failed notification
      await this.logNotification(alert.id, alert.user_id, symbol, 'email', message, alert, 'failed', error.message);
    }
  }

  async createBrowserNotification(alert, message) {
    try {
      // Send real-time notification via SSE
      const notificationsController = require('../controllers/notifications.controller');
      
      const notification = {
        id: alert.id,
        symbol: alert.symbol,
        alert_type: alert.alert_type,
        message: message,
        trigger_price: alert.current_price,
        target_price: alert.target_price,
        change_percent: alert.change_percent,
        timestamp: new Date().toISOString()
      };

      const sent = await notificationsController.sendNotificationToUser(alert.user_id, notification);
      
      // Log browser notification
      await this.logNotification(alert.id, alert.user_id, alert.symbol, 'browser', message, alert, sent ? 'sent' : 'failed');
      
      console.log(`Browser notification ${sent ? 'sent' : 'failed'} for ${alert.symbol} alert`);

    } catch (error) {
      logger.logError('Error creating browser notification:', error);
      await this.logNotification(alert.id, alert.user_id, alert.symbol, 'browser', message, alert, 'failed', error.message);
    }
  }

  async logNotification(alertId, userId, symbol, notificationType, message, alert, status, errorMessage = null) {
    try {
      const notificationId = uuidv4();
      
      await db.query(`
        INSERT INTO alert_notifications (
          id, price_alert_id, user_id, symbol, notification_type,
          trigger_price, target_price, change_percent, message,
          delivery_status, error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        notificationId, alertId, userId, symbol, notificationType,
        alert.current_price, alert.target_price, alert.change_percent,
        message, status, errorMessage
      ]);

    } catch (error) {
      logger.logError('Error logging notification:', error);
    }
  }

  // Manual method to check specific symbol
  async checkSymbol(symbol) {
    await this.updateSymbolPrice(symbol);
    await this.checkAlerts();
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      emailConfigured: this.isEmailConfigured(),
      lastCheck: new Date().toISOString()
    };
  }
}

// Export singleton instance
const priceMonitoringService = new PriceMonitoringService();
module.exports = priceMonitoringService;