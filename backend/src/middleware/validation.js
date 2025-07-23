const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    console.log('Validating request body:', req.body);
    const { error } = schema.validate(req.body);
    if (error) {
      console.log('Validation error:', error.details);
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message).join(', ')
      });
    }
    next();
  };
};

const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(30).required(),
    password: Joi.string().min(6).required(),
    fullName: Joi.string().max(255).allow('')
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  createTrade: Joi.object({
    symbol: Joi.string().max(20).required(),
    entryTime: Joi.date().iso().required(),
    exitTime: Joi.date().iso().allow(null, ''),
    entryPrice: Joi.number().positive().required(),
    exitPrice: Joi.number().positive().allow(null, ''),
    quantity: Joi.number().integer().positive().required(),
    side: Joi.string().valid('long', 'short').required(),
    commission: Joi.number().min(0).default(0),
    fees: Joi.number().min(0).default(0),
    mae: Joi.number().allow(null, ''),
    mfe: Joi.number().allow(null, ''),
    notes: Joi.string().allow(''),
    isPublic: Joi.boolean().default(false),
    broker: Joi.string().max(50).allow(''),
    strategy: Joi.string().max(100).allow(''),
    setup: Joi.string().max(100).allow(''),
    tags: Joi.array().items(Joi.string().max(50))
  }),

  updateTrade: Joi.object({
    symbol: Joi.string().max(20),
    entryTime: Joi.date().iso(),
    exitTime: Joi.date().iso().allow(null, ''),
    entryPrice: Joi.number().positive(),
    exitPrice: Joi.number().positive().allow(null, ''),
    quantity: Joi.number().integer().positive(),
    side: Joi.string().valid('long', 'short'),
    commission: Joi.number().min(0),
    fees: Joi.number().min(0),
    mae: Joi.number().allow(null, ''),
    mfe: Joi.number().allow(null, ''),
    notes: Joi.string().allow(''),
    isPublic: Joi.boolean(),
    broker: Joi.string().max(50).allow(''),
    strategy: Joi.string().max(100).allow(''),
    setup: Joi.string().max(100).allow(''),
    tags: Joi.array().items(Joi.string().max(50))
  }).min(1),

  updateSettings: Joi.object({
    emailNotifications: Joi.boolean(),
    publicProfile: Joi.boolean(),
    defaultTags: Joi.array().items(Joi.string().max(50)),
    importSettings: Joi.object(),
    theme: Joi.string().valid('light', 'dark'),
    timezone: Joi.string().max(50),
    statisticsCalculation: Joi.string().valid('average', 'median')
  }).min(1),

  // Mobile-specific validation schemas
  deviceLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    deviceInfo: Joi.object({
      name: Joi.string().max(255).required(),
      type: Joi.string().valid('ios', 'android', 'web', 'desktop').required(),
      model: Joi.string().max(255).allow(''),
      fingerprint: Joi.string().max(255).allow(''),
      platformVersion: Joi.string().max(50).allow(''),
      appVersion: Joi.string().max(50).allow('')
    }).required()
  }),

  deviceRegistration: Joi.object({
    name: Joi.string().max(255).required(),
    type: Joi.string().valid('ios', 'android', 'web', 'desktop').required(),
    model: Joi.string().max(255).allow(''),
    fingerprint: Joi.string().max(255).allow(''),
    platformVersion: Joi.string().max(50).allow(''),
    appVersion: Joi.string().max(50).allow('')
  }),

  deviceUpdate: Joi.object({
    name: Joi.string().max(255),
    model: Joi.string().max(255).allow(''),
    platformVersion: Joi.string().max(50).allow(''),
    appVersion: Joi.string().max(50).allow('')
  }).min(1),

  pushToken: Joi.object({
    token: Joi.string().max(500).required(),
    platform: Joi.string().valid('fcm', 'apns').required()
  }),

  deltaSync: Joi.object({
    lastSyncVersion: Joi.number().integer().min(0).required(),
    changes: Joi.array().items(Joi.object({
      entityType: Joi.string().valid('trade', 'journal', 'settings', 'user_profile').required(),
      entityId: Joi.string().uuid().required(),
      action: Joi.string().valid('create', 'update', 'delete').required(),
      data: Joi.object().when('action', {
        is: 'delete',
        then: Joi.optional(),
        otherwise: Joi.required()
      })
    })).default([])
  }),

  conflictResolution: Joi.object({
    conflicts: Joi.array().items(Joi.object({
      conflictId: Joi.string().uuid().required(),
      resolution: Joi.string().valid('client', 'server', 'merge').required(),
      mergedData: Joi.object().when('resolution', {
        is: 'merge',
        then: Joi.required(),
        otherwise: Joi.optional()
      })
    })).required()
  }),

  pushChanges: Joi.object({
    changes: Joi.array().items(Joi.object({
      entityType: Joi.string().valid('trade', 'journal', 'settings', 'user_profile').required(),
      entityId: Joi.string().uuid().required(),
      action: Joi.string().valid('create', 'update', 'delete').required(),
      data: Joi.object().required(),
      timestamp: Joi.date().iso().required()
    })).required()
  }),

  queueItem: Joi.object({
    entityType: Joi.string().valid('trade', 'journal', 'settings', 'user_profile').required(),
    entityId: Joi.string().uuid().required(),
    action: Joi.string().valid('create', 'update', 'delete').required(),
    data: Joi.object().required(),
    priority: Joi.number().integer().min(1).max(10).default(5)
  }),

  // Reuse existing schemas with aliases
  trade: Joi.ref('createTrade'),
  journalEntry: Joi.object({
    content: Joi.string().required(),
    type: Joi.string().valid('note', 'lesson', 'emotion', 'setup').default('note'),
    tags: Joi.array().items(Joi.string().max(50)).default([])
  }),
  updateProfile: Joi.object({
    fullName: Joi.string().max(255).allow(''),
    timezone: Joi.string().max(50)
  }).min(1),
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required()
  }),
  settings: Joi.ref('updateSettings'),

  // API Key validation schemas
  createApiKey: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    permissions: Joi.array().items(Joi.string().valid('read', 'write', 'admin')).default(['read']),
    expiresIn: Joi.number().integer().min(1).max(365).allow(null)
  }),

  updateApiKey: Joi.object({
    name: Joi.string().min(1).max(255),
    permissions: Joi.array().items(Joi.string().valid('read', 'write', 'admin')),
    expiresIn: Joi.number().integer().min(1).max(365).allow(null),
    isActive: Joi.boolean()
  }).min(1)
};

module.exports = { validate, schemas };