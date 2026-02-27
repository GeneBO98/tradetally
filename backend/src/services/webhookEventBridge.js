const { subscribe } = require('../events/domainEvents');
const { webhookService, ALLOWED_EVENT_TYPES } = require('./webhookService');
const logger = require('../utils/logger');

class WebhookEventBridge {
  constructor() {
    this.initialized = false;
    this.unsubscribeHandlers = [];
  }

  start() {
    if (this.initialized) {
      return;
    }

    for (const eventType of ALLOWED_EVENT_TYPES) {
      const unsubscribe = subscribe(eventType, async (event) => {
        try {
          await webhookService.handleDomainEvent(event);
        } catch (error) {
          logger.logError(`Webhook event bridge failed for ${eventType}: ${error.message}`);
        }
      });

      this.unsubscribeHandlers.push(unsubscribe);
    }

    this.initialized = true;
    logger.info('[WEBHOOK-BRIDGE] Started domain event bridge');
  }

  stop() {
    if (!this.initialized) {
      return;
    }

    for (const unsubscribe of this.unsubscribeHandlers) {
      try {
        unsubscribe();
      } catch (error) {
        logger.logError(`[WEBHOOK-BRIDGE] Failed to unsubscribe handler: ${error.message}`);
      }
    }

    this.unsubscribeHandlers = [];
    this.initialized = false;
    logger.info('[WEBHOOK-BRIDGE] Stopped domain event bridge');
  }
}

module.exports = new WebhookEventBridge();
