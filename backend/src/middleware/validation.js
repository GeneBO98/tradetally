const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    console.log('[VALIDATION] Request body:', JSON.stringify(req.body, null, 2));
    const { error } = schema.validate(req.body);
    if (error) {
      console.log('[VALIDATION ERROR] Details:', JSON.stringify(error.details, null, 2));
      const errorMessages = error.details.map(d => `${d.path.join('.')}: ${d.message}`);
      console.log('[VALIDATION ERROR] Messages:', errorMessages);
      return res.status(400).json({
        error: 'Validation Error',
        details: errorMessages.join(', '),
        fields: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message,
          type: d.type
        }))
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
    quantity: Joi.number().positive().required(),
    side: Joi.string().valid('long', 'short').required(),
    instrumentType: Joi.string().valid('stock', 'option', 'future').default('stock'),
    commission: Joi.number().min(0).default(0),
    entryCommission: Joi.number().min(0).default(0),
    exitCommission: Joi.number().min(0).default(0),
    fees: Joi.number().min(0).default(0),
    mae: Joi.number().allow(null, ''),
    mfe: Joi.number().allow(null, ''),
    notes: Joi.string().allow(''),
    isPublic: Joi.boolean().default(false),
    broker: Joi.string().max(50).allow(''),
    strategy: Joi.string().max(100).allow(''),
    setup: Joi.string().max(100).allow(''),
    tags: Joi.array().items(Joi.string().max(50)),
    confidence: Joi.number().integer().min(1).max(10).allow(null, ''),
    // Risk management fields
    stopLoss: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.valid(null, '')
    ),
    takeProfit: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.valid(null, '')
    ),
    // Options-specific fields
    underlyingSymbol: Joi.string().max(10).allow(null, ''),
    optionType: Joi.string().valid('call', 'put').allow(null, ''),
    strikePrice: Joi.number().positive().allow(null, ''),
    expirationDate: Joi.date().iso().allow(null, ''),
    contractSize: Joi.number().integer().positive().allow(null, ''),
    // Futures-specific fields
    underlyingAsset: Joi.string().max(50).allow(null, ''),
    contractMonth: Joi.string().valid('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC').allow(null, ''),
    contractYear: Joi.number().integer().min(2020).max(2100).allow(null, ''),
    tickSize: Joi.number().positive().allow(null, ''),
    pointValue: Joi.number().positive().allow(null, ''),
    // Executions array - supports both individual fills and grouped round-trip executions
    executions: Joi.array().items(
      Joi.alternatives().try(
        // Individual fill format
        Joi.object({
          action: Joi.string().valid('buy', 'sell').required(),
          quantity: Joi.number().positive().required(),
          price: Joi.number().positive().required(),
          datetime: Joi.date().iso().required(),
          commission: Joi.number().min(0).default(0),
          fees: Joi.number().min(0).default(0)
        }),
        // Grouped round-trip format
        Joi.object({
          side: Joi.string().valid('long', 'short').required(),
          quantity: Joi.number().positive().required(),
          entryPrice: Joi.number().positive().required(),
          exitPrice: Joi.number().positive().allow(null).optional(),
          entryTime: Joi.date().iso().required(),
          exitTime: Joi.date().iso().allow(null).optional(),
          commission: Joi.number().min(0).default(0),
          fees: Joi.number().min(0).default(0),
          pnl: Joi.number().allow(null).optional()
        })
      )
    ).optional()
  }),

  updateTrade: Joi.object({
    symbol: Joi.string().max(20),
    entryTime: Joi.date().iso(),
    exitTime: Joi.date().iso().allow(null, ''),
    entryPrice: Joi.number().positive(),
    exitPrice: Joi.number().positive().allow(null, ''),
    quantity: Joi.number().positive(),
    side: Joi.string().valid('long', 'short'),
    instrumentType: Joi.string().valid('stock', 'option', 'future'),
    commission: Joi.number().min(0),
    entryCommission: Joi.number().min(0),
    exitCommission: Joi.number().min(0),
    fees: Joi.number().min(0),
    mae: Joi.number().allow(null, ''),
    mfe: Joi.number().allow(null, ''),
    notes: Joi.string().allow(''),
    isPublic: Joi.boolean(),
    broker: Joi.string().max(50).allow(''),
    strategy: Joi.string().max(100).allow(''),
    setup: Joi.string().max(100).allow(''),
    tags: Joi.array().items(Joi.string().max(50)),
    confidence: Joi.number().integer().min(1).max(10).allow(null, ''),
    // Risk management fields
    stopLoss: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.valid(null, '')
    ),
    takeProfit: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.valid(null, '')
    ),
    // Options-specific fields
    underlyingSymbol: Joi.string().max(10).allow(null, ''),
    optionType: Joi.string().valid('call', 'put').allow(null, ''),
    strikePrice: Joi.number().positive().allow(null, ''),
    expirationDate: Joi.date().iso().allow(null, ''),
    contractSize: Joi.number().integer().positive().allow(null, ''),
    // Futures-specific fields
    underlyingAsset: Joi.string().max(50).allow(null, ''),
    contractMonth: Joi.string().valid('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC').allow(null, ''),
    contractYear: Joi.number().integer().min(2020).max(2100).allow(null, ''),
    tickSize: Joi.number().positive().allow(null, ''),
    pointValue: Joi.number().positive().allow(null, ''),
    // Executions array - supports both individual fills and grouped round-trip executions
    executions: Joi.array().items(
      Joi.alternatives().try(
        // Individual fill format
        Joi.object({
          action: Joi.string().valid('buy', 'sell').required(),
          quantity: Joi.number().positive().required(),
          price: Joi.number().positive().required(),
          datetime: Joi.date().iso().required(),
          commission: Joi.number().min(0).default(0),
          fees: Joi.number().min(0).default(0)
        }),
        // Grouped round-trip format
        Joi.object({
          side: Joi.string().valid('long', 'short').required(),
          quantity: Joi.number().positive().required(),
          entryPrice: Joi.number().positive().required(),
          exitPrice: Joi.number().positive().allow(null).optional(),
          entryTime: Joi.date().iso().required(),
          exitTime: Joi.date().iso().allow(null).optional(),
          commission: Joi.number().min(0).default(0),
          fees: Joi.number().min(0).default(0),
          pnl: Joi.number().allow(null).optional()
        })
      )
    ).optional()
  }).min(1),

  updateSettings: Joi.object({
    emailNotifications: Joi.boolean(),
    publicProfile: Joi.boolean(),
    defaultTags: Joi.array().items(Joi.string().max(50)),
    importSettings: Joi.object(),
    theme: Joi.string().valid('light', 'dark'),
    timezone: Joi.string().max(50),
    statisticsCalculation: Joi.string().valid('average', 'median'),
    enableTradeGrouping: Joi.boolean(),
    tradeGroupingTimeGapMinutes: Joi.number().integer().min(1).max(1440),
    autoCloseExpiredOptions: Joi.boolean(),
    defaultStopLossPercent: Joi.number().min(0).max(100).allow(null)
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
  }).min(1),

  // Diary validation schemas
  createDiaryEntry: Joi.object({
    entryDate: Joi.date().iso().required(),
    entryType: Joi.string().valid('diary', 'playbook').default('diary'),
    title: Joi.string().max(255).allow(null, ''),
    marketBias: Joi.string().valid('bullish', 'bearish', 'neutral').allow(null, ''),
    content: Joi.string().allow(null, ''),
    keyLevels: Joi.string().allow(null, ''),
    watchlist: Joi.array().items(Joi.string().max(50)).default([]),
    linkedTrades: Joi.array().items(Joi.string().uuid()).default([]),
    tags: Joi.array().items(Joi.string().max(50)).default([]),
    followedPlan: Joi.boolean().allow(null),
    lessonsLearned: Joi.string().allow(null, '')
  }),

  updateDiaryEntry: Joi.object({
    entryDate: Joi.date().iso(), // Add entryDate for update operations
    entryType: Joi.string().valid('diary', 'playbook'),
    title: Joi.string().max(255).allow(null, ''),
    marketBias: Joi.string().valid('bullish', 'bearish', 'neutral').allow(null, ''),
    content: Joi.string().allow(null, ''),
    keyLevels: Joi.string().allow(null, ''),
    watchlist: Joi.array().items(Joi.string().max(50)),
    linkedTrades: Joi.array().items(Joi.string().uuid()),
    tags: Joi.array().items(Joi.string().max(50)),
    followedPlan: Joi.boolean().allow(null),
    lessonsLearned: Joi.string().allow(null, '')
  }).min(1)
};

module.exports = { validate, schemas };