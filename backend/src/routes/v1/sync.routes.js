const express = require('express');
const router = express.Router();
const syncController = require('../../controllers/v1/sync.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

// Full sync operations
router.get('/full', authenticate, syncController.getFullSync);
router.post('/full/init', authenticate, syncController.initializeFullSync);

// Delta sync operations
router.get('/delta', authenticate, syncController.getDeltaSync);
router.post('/delta', authenticate, validate(schemas.deltaSync), syncController.processDeltaSync);

// Sync metadata and status
router.get('/status', authenticate, syncController.getSyncStatus);
router.get('/metadata', authenticate, syncController.getSyncMetadata);
router.post('/metadata/update', authenticate, syncController.updateSyncMetadata);

// Conflict resolution
router.get('/conflicts', authenticate, syncController.getConflicts);
router.post('/conflicts/resolve', authenticate, validate(schemas.conflictResolution), syncController.resolveConflicts);

// Change tracking
router.get('/changes', authenticate, syncController.getChanges);
router.post('/changes/push', authenticate, validate(schemas.pushChanges), syncController.pushChanges);
router.post('/changes/pull', authenticate, syncController.pullChanges);

// Sync queues (for offline support)
router.get('/queue', authenticate, syncController.getSyncQueue);
router.post('/queue/add', authenticate, validate(schemas.queueItem), syncController.addToSyncQueue);
router.post('/queue/process', authenticate, syncController.processSyncQueue);
router.delete('/queue/:id', authenticate, syncController.removeSyncQueueItem);

// Sync performance and optimization
router.get('/stats', authenticate, syncController.getSyncStats);
router.post('/optimize', authenticate, syncController.optimizeSync);

// Manual sync triggers
router.post('/trigger/full', authenticate, syncController.triggerFullSync);
router.post('/trigger/partial', authenticate, syncController.triggerPartialSync);

module.exports = router;