const logger = require('../utils/logger');

function logSkipped(action, identifier) {
  logger.debug(`[SEQUENZY] ${action} skipped; Sequenzy integration is disabled`, {
    identifier
  });
}

module.exports = {
  queueSyncUserById(userId) {
    logSkipped('Subscriber sync', userId);
  },

  queueDeleteSubscriber(email) {
    logSkipped('Subscriber deletion', email);
  }
};
