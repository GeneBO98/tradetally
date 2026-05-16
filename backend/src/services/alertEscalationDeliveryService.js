const fetch = require('node-fetch');
const OperationalAlert = require('../models/OperationalAlert');
const EmailService = require('./emailService');
const escapeHtml = require('../utils/escapeHtml');

const SEVERITY_RANK = { info: 1, warning: 2, critical: 3 };

function shouldDeliver(alert, destination) {
  const alertRank = SEVERITY_RANK[alert.severity] || SEVERITY_RANK.warning;
  const destinationRank = SEVERITY_RANK[destination.severity] || SEVERITY_RANK.warning;
  return destination.isEnabled !== false && alertRank >= destinationRank;
}

function deliveryEnabled(destination) {
  if (destination.metadata?.dryRun === true) return false;
  return process.env.ALERT_ESCALATION_DELIVERY_ENABLED === 'true';
}

function alertPayload(alert, destination) {
  return {
    alertId: alert.id,
    alertType: alert.alertType,
    severity: alert.severity,
    status: alert.status,
    entityType: alert.entityType,
    entityId: alert.entityId,
    message: alert.message,
    payload: alert.payload || {},
    destinationType: destination.destinationType,
    generatedAt: new Date().toISOString()
  };
}

function retryDelayMinutes(retryCount = 0, metadata = {}) {
  const baseMinutes = Number(metadata.retryBaseMinutes || process.env.ALERT_ESCALATION_RETRY_BASE_MINUTES || 5);
  const maxMinutes = Number(metadata.retryMaxMinutes || process.env.ALERT_ESCALATION_RETRY_MAX_MINUTES || 240);
  const safeBase = Number.isFinite(baseMinutes) && baseMinutes > 0 ? baseMinutes : 5;
  const safeMax = Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : 240;
  return Math.min(safeMax, safeBase * Math.pow(2, Math.max(0, retryCount)));
}

function maxRetries(metadata = {}) {
  const configured = Number(metadata.maxRetries || process.env.ALERT_ESCALATION_MAX_RETRIES || 5);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.round(configured), 0), 25) : 5;
}

function nextRetryAt(retryCount = 0, metadata = {}) {
  return new Date(Date.now() + retryDelayMinutes(retryCount, metadata) * 60 * 1000).toISOString();
}

function deliveryAlertFromPayload(delivery) {
  const payload = delivery.payload || {};
  return {
    id: payload.alertId || delivery.alertId,
    alertType: payload.alertType || 'operational_alert_retry',
    severity: payload.severity || delivery.severity || 'warning',
    status: payload.status || 'active',
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    message: payload.message || delivery.errorMessage || 'Retried operational alert delivery',
    payload: payload.payload || {}
  };
}

class AlertEscalationDeliveryService {
  static async deliverAlerts(alerts = [], destinations = []) {
    const deliveries = [];
    for (const alert of alerts) {
      if (!alert || alert.status !== 'active') continue;
      for (const destination of destinations) {
        if (!shouldDeliver(alert, destination)) continue;
        deliveries.push(await this.deliverAlert(alert, destination));
      }
    }
    return deliveries;
  }

  static async deliverAlert(alert, destination) {
    const retryCount = Math.max(0, parseInt(destination.retryCount || '0', 10) || 0);
    const payload = alertPayload(alert, destination);
    const baseRecord = {
      alertId: alert.id,
      destinationId: destination.id,
      destinationType: destination.destinationType,
      target: destination.target,
      severity: alert.severity,
      retryCount,
      payload
    };

    if (!deliveryEnabled(destination)) {
      return OperationalAlert.recordEscalationDelivery({
        ...baseRecord,
        status: 'skipped',
        dryRun: true,
        errorMessage: 'Delivery disabled; recorded as dry run'
      });
    }

    try {
      if (destination.destinationType === 'email') {
        await this.deliverEmail(destination, payload);
        return OperationalAlert.recordEscalationDelivery({ ...baseRecord, status: 'sent' });
      }
      if (destination.destinationType === 'slack') {
        const responseStatus = await this.deliverSlack(destination, payload);
        return OperationalAlert.recordEscalationDelivery({ ...baseRecord, status: 'sent', responseStatus });
      }
      const responseStatus = await this.deliverWebhook(destination, payload);
      return OperationalAlert.recordEscalationDelivery({ ...baseRecord, status: 'sent', responseStatus });
    } catch (error) {
      const deadLetter = retryCount >= maxRetries(destination.metadata || {});
      return OperationalAlert.recordEscalationDelivery({
        ...baseRecord,
        status: 'failed',
        errorMessage: error.message,
        nextRetryAt: deadLetter ? null : nextRetryAt(retryCount, destination.metadata || {}),
        retryReason: error.message,
        deadLetteredAt: deadLetter ? new Date().toISOString() : null,
        deadLetterReason: deadLetter ? `Max retries reached: ${error.message}` : null
      });
    }
  }

  static async retryDelivery(deliveryId, actorUserId = null) {
    const previous = await OperationalAlert.findEscalationDeliveryById(deliveryId);
    if (!previous) {
      const error = new Error('Escalation delivery not found');
      error.status = 404;
      throw error;
    }
    if (!['failed', 'skipped'].includes(previous.status)) {
      const error = new Error('Only failed or skipped escalation deliveries can be retried');
      error.status = 400;
      throw error;
    }
    await OperationalAlert.markEscalationDeliveryRetryClaimed(previous.id, {
      reason: `Retry requested${actorUserId ? ` by ${actorUserId}` : ''}`
    });

    const destination = previous.destinationId
      ? await OperationalAlert.findEscalationDestinationById(previous.destinationId)
      : null;
    const fallbackDestination = {
      id: previous.destinationId,
      destinationType: previous.destinationType,
      target: previous.target,
      severity: previous.severity,
      isEnabled: true,
      metadata: {}
    };
    const retryDestination = {
      ...(destination || fallbackDestination),
      retryCount: previous.retryCount + 1,
      metadata: {
        ...(destination?.metadata || {}),
        retryOfDeliveryId: previous.id,
        retryRequestedBy: actorUserId || null
      }
    };
    const alert = previous.alertId
      ? await OperationalAlert.findById(previous.alertId)
      : null;

    return this.deliverAlert(alert || deliveryAlertFromPayload(previous), retryDestination);
  }

  static async processDueRetries({ limit = 25, actorUserId = null, includeSkipped = false } = {}) {
    const dueDeliveries = OperationalAlert.claimDueEscalationRetryDeliveries
      ? await OperationalAlert.claimDueEscalationRetryDeliveries({ limit, includeSkipped })
      : await OperationalAlert.listDueEscalationRetryDeliveries({ limit, includeSkipped });
    const retried = [];
    const failed = [];

    for (const delivery of dueDeliveries) {
      try {
        retried.push(await this.retryDelivery(delivery.id, actorUserId));
      } catch (error) {
        if ((delivery.retryCount || 0) >= maxRetries()) {
          await OperationalAlert.markEscalationDeliveryDeadLettered?.(delivery.id, {
            reason: `Retry worker failed after max attempts: ${error.message}`
          });
        }
        failed.push({
          deliveryId: delivery.id,
          error: error.message
        });
      }
    }

    return {
      checked: dueDeliveries.length,
      retried,
      failed
    };
  }

  static async deliverEmail(destination, payload) {
    if (!EmailService.isConfigured()) {
      throw new Error('Email transport is not configured');
    }
    const transporter = EmailService.createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
      to: destination.target,
      subject: `[TradeTally] ${payload.severity.toUpperCase()} ${payload.alertType}`,
      text: `${payload.message}\n\nEntity: ${payload.entityType || '-'} ${payload.entityId || '-'}\nAlert: ${payload.alertId}`,
      html: EmailService.getBaseTemplate(
        'Operational Alert',
        `
          <h1 style="color:#18181b;font-size:20px;margin:0 0 12px 0;">${escapeHtml(payload.severity.toUpperCase())} ${escapeHtml(payload.alertType)}</h1>
          <p style="color:#52525b;font-size:14px;line-height:1.5;">${escapeHtml(payload.message)}</p>
          <p style="color:#71717a;font-size:12px;">Entity ${escapeHtml(payload.entityType || '-')} ${escapeHtml(payload.entityId || '-')}</p>
        `
      )
    });
  }

  static async deliverSlack(destination, payload) {
    const response = await fetch(destination.target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `TradeTally ${payload.severity.toUpperCase()} ${payload.alertType}: ${payload.message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${payload.severity.toUpperCase()} ${payload.alertType}*\n${payload.message}`
            }
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Entity: ${payload.entityType || '-'} ${payload.entityId || '-'}` },
              { type: 'mrkdwn', text: `Alert: ${payload.alertId}` }
            ]
          }
        ]
      })
    });
    if (!response.ok) throw new Error(`Slack delivery failed with HTTP ${response.status}`);
    return response.status;
  }

  static async deliverWebhook(destination, payload) {
    const headers = {
      'Content-Type': 'application/json',
      ...(destination.metadata?.headers || {})
    };
    const response = await fetch(destination.target, {
      method: destination.metadata?.method || 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Webhook delivery failed with HTTP ${response.status}`);
    return response.status;
  }
}

module.exports = AlertEscalationDeliveryService;
