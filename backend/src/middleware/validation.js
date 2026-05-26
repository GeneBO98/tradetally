const Joi = require('joi');
const { isV1Request, sendV1Error } = require('../utils/apiResponse');
const { ALL_SCOPES } = require('../utils/apiScopes');
const { sanitizeForLogging } = require('../utils/logSanitizer');

const WEBHOOK_EVENT_TYPES = Object.freeze([
  'trade.created',
  'trade.updated',
  'trade.deleted',
  'import.completed',
  'broker_sync.completed',
  'price_alert.triggered',
  'enrichment.completed'
]);
const WEBHOOK_PROVIDER_TYPES = Object.freeze(['custom', 'slack', 'discord']);

// Normalize snake_case fields to camelCase for API compatibility
const normalizeFieldNames = (body) => {
  if (!body || typeof body !== 'object') return body;
  const normalized = { ...body };
  
  // Map snake_case to camelCase (only if camelCase doesn't already exist)
  const fieldMappings = {
    instrument_type: 'instrumentType',
    underlying_symbol: 'underlyingSymbol',
    option_type: 'optionType',
    strike_price: 'strikePrice',
    expiration_date: 'expirationDate',
    contract_size: 'contractSize',
    underlying_asset: 'underlyingAsset',
    contract_month: 'contractMonth',
    contract_year: 'contractYear',
    tick_size: 'tickSize',
    point_value: 'pointValue',
    stop_loss: 'stopLoss',
    take_profit: 'takeProfit'
  };
  
  Object.keys(fieldMappings).forEach(snakeCase => {
    const camelCase = fieldMappings[snakeCase];
    if (normalized[snakeCase] !== undefined && normalized[camelCase] === undefined) {
      normalized[camelCase] = normalized[snakeCase];
    }
  });
  
  return normalized;
};

const validate = (schema) => {
  return (req, res, next) => {
    // Normalize snake_case to camelCase before validation
    req.body = normalizeFieldNames(req.body);
    
    const { error } = schema.validate(req.body);
    if (error) {
      const fields = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type
      }));
      const errorMessages = error.details.map(d => `${d.path.join('.')}: ${d.message}`);

      if (process.env.NODE_ENV !== 'production') {
        console.log('[VALIDATION ERROR]', {
          fields,
          body: sanitizeForLogging(req.body)
        });
      }

      if (isV1Request(req)) {
        return sendV1Error(res, 400, 'VALIDATION_ERROR', 'Request validation failed', fields);
      }

      return res.status(400).json({
        error: 'Validation Error',
        details: errorMessages.join(', '),
        fields
      });
    }
    next();
  };
};

const nullableString = (max = 255) => Joi.string().max(max).allow('', null);
const nullableDate = Joi.alternatives().try(
  Joi.date().iso(),
  Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  Joi.valid(null, '')
);
const nullableNumber = Joi.alternatives().try(Joi.number(), Joi.valid(null, ''));
const aiProviderSchema = Joi.string().valid('gemini', 'claude', 'openai', 'ollama', 'lmstudio', 'perplexity', 'local');

const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(30).optional(),
    password: Joi.string().min(8).required(),
    fullName: Joi.string().max(255).allow(''),
    marketing_consent: Joi.boolean().default(false),
    utm_source: Joi.string().max(255).allow('', null),
    utm_medium: Joi.string().max(255).allow('', null),
    utm_campaign: Joi.string().max(255).allow('', null),
    utm_term: Joi.string().max(255).allow('', null),
    utm_content: Joi.string().max(255).allow('', null),
    referral_source: Joi.string().max(2048).allow('', null),
    landing_page: Joi.string().max(2048).allow('', null),
    deviceInfo: Joi.object({
      name: Joi.string().max(255).required(),
      type: Joi.string().valid('ios', 'android', 'web', 'desktop').required(),
      model: Joi.string().max(255).allow(''),
      fingerprint: Joi.string().max(255).allow(''),
      platformVersion: Joi.string().max(50).allow(''),
      appVersion: Joi.string().max(50).allow('')
    }).optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  internalCrmSyncRun: Joi.object({
    targets: Joi.array()
      .items(Joi.string().valid('twenty', 'invoiceNinja'))
      .min(1)
      .optional(),
    reason: Joi.string().max(255).allow('', null).optional()
  }),

  internalCrmSyncUserRun: Joi.object({
    targets: Joi.array()
      .items(Joi.string().valid('twenty', 'invoiceNinja'))
      .min(1)
      .optional(),
    reason: Joi.string().max(255).allow('', null).optional()
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required()
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).required()
  }),

  verify2FA: Joi.object({
    tempToken: Joi.string().allow('', null),
    temp_token: Joi.string().allow('', null),
    token: Joi.string().allow('', null),
    twoFactorCode: Joi.string().allow('', null),
    two_factor_code: Joi.string().allow('', null),
    code: Joi.string().allow('', null)
  }).or('tempToken', 'temp_token', 'token')
    .or('twoFactorCode', 'two_factor_code', 'code'),


  createTrade: Joi.object({
    symbol: Joi.string().max(20).required(),
    entryTime: Joi.date().iso().required(),
    exitTime: Joi.date().iso().allow(null, ''),
    entryPrice: Joi.number().positive().required(),
    exitPrice: Joi.number().min(0).allow(null, ''),
    quantity: Joi.number().positive().required(),
    side: Joi.string().valid('long', 'short').required(),
    instrumentType: Joi.string().valid('stock', 'option', 'future', 'crypto').default('stock'),
    instrument_type: Joi.string().valid('stock', 'option', 'future', 'crypto').optional(), // Accept snake_case for API compatibility
    commission: Joi.number().default(0),  // Can be negative for rebates
    entryCommission: Joi.number().default(0),  // Can be negative for rebates
    exitCommission: Joi.number().default(0),  // Can be negative for rebates
    fees: Joi.number().default(0),  // Can be negative for rebates
    mae: Joi.number().allow(null, ''),
    mfe: Joi.number().allow(null, ''),
    notes: Joi.string().allow(''),
    isPublic: Joi.boolean().default(false),
    broker: Joi.string().max(50).allow(''),
    account_identifier: Joi.string().max(50).allow(''),
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
    // Additional take profit targets (TP2, TP3, etc.)
    takeProfitTargets: Joi.array().items(Joi.object({
      price: Joi.number().positive().required(),
      shares: Joi.number().integer().positive().allow(null).optional(),
      percentage: Joi.number().min(1).max(100).allow(null).optional()
    })).default([]),
    // Chart URL for TradingView links
    chartUrl: Joi.string().uri().max(1000).allow(null, ''),
    // Manual target hit override (SL/TP hit first)
    manualTargetHitFirst: Joi.string().valid('take_profit', 'stop_loss').allow(null, ''),
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
          price: Joi.number().min(0).required(),
          datetime: Joi.date().iso().required(),
          commission: Joi.number().default(0),  // Can be negative for rebates
          fees: Joi.number().default(0),  // Can be negative for rebates
          stopLoss: Joi.number().positive().allow(null, '').optional(),
          takeProfit: Joi.number().positive().allow(null, '').optional(),
          takeProfitTargets: Joi.array().items(Joi.object({
            price: Joi.number().positive().required(),
            shares: Joi.number().integer().positive().allow(null).optional(),
            percentage: Joi.number().min(1).max(100).allow(null).optional()
          })).default([]).optional()
        }).unknown(true),
        // Grouped round-trip format
        Joi.object({
          side: Joi.string().valid('long', 'short').required(),
          quantity: Joi.number().positive().required(),
          entryPrice: Joi.number().positive().required(),
          exitPrice: Joi.number().min(0).allow(null).optional(),
          entryTime: Joi.date().iso().required(),
          exitTime: Joi.date().iso().allow(null).optional(),
          commission: Joi.number().default(0),  // Can be negative for rebates
          fees: Joi.number().default(0),  // Can be negative for rebates
          pnl: Joi.number().allow(null).optional(),
          stopLoss: Joi.number().positive().allow(null, '').optional(),
          takeProfit: Joi.number().positive().allow(null, '').optional(),
          takeProfitTargets: Joi.array().items(Joi.object({
            price: Joi.number().positive().required(),
            shares: Joi.number().integer().positive().allow(null).optional(),
            percentage: Joi.number().min(1).max(100).allow(null).optional()
          })).default([]).optional()
        }).unknown(true)
      )
    ).optional()
  }),

  createShellTrade: Joi.object({
    symbol: Joi.string().max(20).required(),
    side: Joi.string().valid('long', 'short').required(),
    instrumentType: Joi.string().valid('stock', 'option', 'future', 'crypto').default('stock'),
    instrument_type: Joi.string().valid('stock', 'option', 'future', 'crypto').optional(),
    broker: Joi.string().max(50).allow(''),
    account_identifier: Joi.string().max(50).allow(''),
    strategy: Joi.string().max(100).allow(''),
    setup: Joi.string().max(100).allow(''),
    tags: Joi.array().items(Joi.string().max(50)),
    notes: Joi.string().allow(''),
    confidence: Joi.number().integer().min(1).max(10).allow(null, ''),
    stopLoss: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.valid(null, '')
    ),
    takeProfit: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.valid(null, '')
    ),
    takeProfitTargets: Joi.array().items(Joi.object({
      price: Joi.number().positive().required(),
      shares: Joi.number().integer().positive().allow(null).optional(),
      percentage: Joi.number().min(1).max(100).allow(null).optional()
    })).default([]),
    chartUrl: Joi.string().uri().max(1000).allow(null, ''),
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
    pointValue: Joi.number().positive().allow(null, '')
  }),

  addFill: Joi.object({
    action: Joi.string().valid('buy', 'sell').required(),
    quantity: Joi.number().positive().required(),
    price: Joi.number().min(0).required(),
    datetime: Joi.date().iso().required(),
    commission: Joi.number().default(0),
    fees: Joi.number().default(0)
  }),

  updateTrade: Joi.object({
    symbol: Joi.string().max(20),
    entryTime: Joi.date().iso(),
    exitTime: Joi.date().iso().allow(null, ''),
    entryPrice: Joi.number().positive(),
    exitPrice: Joi.number().min(0).allow(null, ''),
    quantity: Joi.number().positive(),
    side: Joi.string().valid('long', 'short'),
    instrumentType: Joi.string().valid('stock', 'option', 'future', 'crypto'),
    commission: Joi.number(),  // Can be negative for rebates
    entryCommission: Joi.number(),  // Can be negative for rebates
    exitCommission: Joi.number(),  // Can be negative for rebates
    fees: Joi.number(),  // Can be negative for rebates
    mae: Joi.number().allow(null, ''),
    mfe: Joi.number().allow(null, ''),
    notes: Joi.string().allow(''),
    isPublic: Joi.boolean(),
    broker: Joi.string().max(50).allow(''),
    account_identifier: Joi.string().max(50).allow(''),
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
    // Additional take profit targets (TP2, TP3, etc.)
    takeProfitTargets: Joi.array().items(Joi.object({
      price: Joi.number().positive().required(),
      shares: Joi.number().integer().positive().allow(null).optional(),
      percentage: Joi.number().min(1).max(100).allow(null).optional()
    })).default([]),
    // Chart URL for TradingView links
    chartUrl: Joi.string().uri().max(1000).allow(null, ''),
    // Manual target hit override (SL/TP hit first)
    manualTargetHitFirst: Joi.string().valid('take_profit', 'stop_loss').allow(null, ''),
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
          price: Joi.number().min(0).required(),
          datetime: Joi.date().iso().required(),
          commission: Joi.number().default(0),  // Can be negative for rebates
          fees: Joi.number().default(0),  // Can be negative for rebates
          stopLoss: Joi.number().positive().allow(null, '').optional(),
          takeProfit: Joi.number().positive().allow(null, '').optional(),
          takeProfitTargets: Joi.array().items(Joi.object({
            price: Joi.number().positive().required(),
            shares: Joi.number().integer().positive().allow(null).optional(),
            percentage: Joi.number().min(1).max(100).allow(null).optional()
          })).default([]).optional()
        }).unknown(true),
        // Grouped round-trip format
        Joi.object({
          side: Joi.string().valid('long', 'short').required(),
          quantity: Joi.number().positive().required(),
          entryPrice: Joi.number().positive().required(),
          exitPrice: Joi.number().min(0).allow(null).optional(),
          entryTime: Joi.date().iso().required(),
          exitTime: Joi.date().iso().allow(null).optional(),
          commission: Joi.number().default(0),  // Can be negative for rebates
          fees: Joi.number().default(0),  // Can be negative for rebates
          pnl: Joi.number().allow(null).optional(),
          stopLoss: Joi.number().positive().allow(null, '').optional(),
          takeProfit: Joi.number().positive().allow(null, '').optional(),
          takeProfitTargets: Joi.array().items(Joi.object({
            price: Joi.number().positive().required(),
            shares: Joi.number().integer().positive().allow(null).optional(),
            percentage: Joi.number().min(1).max(100).allow(null).optional()
          })).default([]).optional()
        }).unknown(true)
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
    timeDisplayFormat: Joi.string().valid('12h', '24h'),
    statisticsCalculation: Joi.string().valid('average', 'median'),
    enableTradeGrouping: Joi.boolean(),
    tradeGroupingTimeGapMinutes: Joi.number().integer().min(1).max(1440),
    autoCloseExpiredOptions: Joi.boolean(),
    defaultStopLossType: Joi.string().valid('percent', 'lod', 'dollar').default('percent'),
    defaultStopLossPercent: Joi.number().min(0).max(100).allow(null),
    defaultStopLossDollars: Joi.number().min(0).allow(null),
    defaultTakeProfitPercent: Joi.number().min(0).max(1000).allow(null),
    dashboardLayout: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      visible: Joi.boolean().required()
    })).allow(null),
    analyticsChartLayout: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      visible: Joi.boolean().required(),
      size: Joi.string().valid('full', 'half').optional()
    })).allow(null),
    displayCurrency: Joi.string().max(10),
    uiPreferences: Joi.object()
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
    newPassword: Joi.string().min(8).required()
  }),
  settings: Joi.ref('updateSettings'),

  // API Key validation schemas
  createApiKey: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    permissions: Joi.array().items(Joi.string().valid('read', 'write', 'admin')).default(['read']),
    scopes: Joi.array().items(Joi.string().valid(...ALL_SCOPES)).optional(),
    expiresIn: Joi.number().integer().min(1).max(365).allow(null)
  }),

  updateApiKey: Joi.object({
    name: Joi.string().min(1).max(255),
    permissions: Joi.array().items(Joi.string().valid('read', 'write', 'admin')),
    scopes: Joi.array().items(Joi.string().valid(...ALL_SCOPES)),
    expiresIn: Joi.number().integer().min(1).max(365).allow(null),
    isActive: Joi.boolean()
  }).min(1),

  // Webhook validation schemas
  createWebhook: Joi.object({
    url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
    providerType: Joi.string().valid(...WEBHOOK_PROVIDER_TYPES).default('custom'),
    description: Joi.string().max(500).allow('', null),
    eventTypes: Joi.array().items(Joi.string().valid(...WEBHOOK_EVENT_TYPES)).min(1).optional(),
    customHeaders: Joi.object().pattern(Joi.string(), Joi.string().max(1000)).default({}),
    isActive: Joi.boolean().default(true),
    secret: Joi.string().max(255).allow('', null)
  }),

  updateWebhook: Joi.object({
    url: Joi.string().uri({ scheme: ['http', 'https'] }),
    providerType: Joi.string().valid(...WEBHOOK_PROVIDER_TYPES),
    description: Joi.string().max(500).allow('', null),
    eventTypes: Joi.array().items(Joi.string().valid(...WEBHOOK_EVENT_TYPES)).min(1),
    customHeaders: Joi.object().pattern(Joi.string(), Joi.string().max(1000)),
    isActive: Joi.boolean(),
    secret: Joi.string().max(255).allow('', null),
    rotateSecret: Joi.boolean()
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
  }).min(1),

  createPlaybook: Joi.object({
    name: Joi.string().trim().max(120).required(),
    description: Joi.string().allow('', null),
    market: Joi.string().trim().max(50).allow('', null),
    timeframe: Joi.string().valid('scalper', 'day_trading', 'swing', 'position').allow(null, ''),
    side: Joi.string().valid('long', 'short', 'both').default('both'),
    requiredStrategy: Joi.string().trim().max(100).allow('', null),
    requiredSetup: Joi.string().trim().max(100).allow('', null),
    requiredTags: Joi.array().items(Joi.string().trim().max(50)).default([]),
    requireStopLoss: Joi.boolean().default(false),
    minimumTargetR: Joi.number().min(0).max(100).allow(null),
    checklistItems: Joi.array().items(
      Joi.object({
        label: Joi.string().trim().max(255).required(),
        itemOrder: Joi.number().integer().min(0).allow(null),
        weight: Joi.number().positive().max(100).default(1),
        isRequired: Joi.boolean().default(false)
      })
    ).min(1).required()
  }),

  updatePlaybook: Joi.object({
    name: Joi.string().trim().max(120).required(),
    description: Joi.string().allow('', null),
    market: Joi.string().trim().max(50).allow('', null),
    timeframe: Joi.string().valid('scalper', 'day_trading', 'swing', 'position').allow(null, ''),
    side: Joi.string().valid('long', 'short', 'both').default('both'),
    requiredStrategy: Joi.string().trim().max(100).allow('', null),
    requiredSetup: Joi.string().trim().max(100).allow('', null),
    requiredTags: Joi.array().items(Joi.string().trim().max(50)).default([]),
    requireStopLoss: Joi.boolean().default(false),
    minimumTargetR: Joi.number().min(0).max(100).allow(null),
    checklistItems: Joi.array().items(
      Joi.object({
        label: Joi.string().trim().max(255).required(),
        itemOrder: Joi.number().integer().min(0).allow(null),
        weight: Joi.number().positive().max(100).default(1),
        isRequired: Joi.boolean().default(false)
      })
    ).min(1).required()
  }),

  submitPlaybookReview: Joi.object({
    playbookId: Joi.string().uuid().required(),
    checklistResponses: Joi.array().items(
      Joi.object({
        checklistItemId: Joi.string().uuid().required(),
        checked: Joi.boolean().required()
      })
    ).required(),
    followedPlan: Joi.boolean().allow(null),
    reviewNotes: Joi.string().allow('', null)
  }),

  billingCheckout: Joi.object({
    priceId: Joi.string().required(),
    redirectUrl: Joi.string().max(2048).allow('', null),
    referral: nullableString(255)
  }),

  billingCancelSubscription: Joi.object({
    cancellationReason: Joi.string().max(100).required(),
    feedbackText: nullableString(2000)
  }),

  billingAppleReceipt: Joi.object({
    transaction_id: Joi.string().required(),
    product_id: Joi.string().required(),
    receipt_data: Joi.string().required(),
    environment: Joi.string().valid('Sandbox', 'Production', 'Xcode', 'LocalTesting').allow('', null)
  }),

  supportContact: Joi.object({
    subject: Joi.string().trim().max(200).required(),
    message: Joi.string().trim().max(5000).required()
  }),

  aiCreateSession: Joi.object({
    filters: Joi.object().unknown(true).default({}),
    tradeId: Joi.string().trim().max(64),
    analysisType: Joi.string().valid('single_trade'),
    apiKey: Joi.string().trim().max(500),
    modelName: Joi.string().trim().max(200)
  }),

  aiFollowup: Joi.object({
    message: Joi.string().trim().max(4000).required(),
    apiKey: Joi.string().trim().max(500),
    modelName: Joi.string().trim().max(200)
  }),

  brokerSyncIbkrConnection: Joi.object({
    flexToken: Joi.string().trim().required(),
    flexQueryId: Joi.string().trim().required(),
    accountLabel: nullableString(255),
    autoSyncEnabled: Joi.boolean().default(false),
    syncFrequency: Joi.string().valid('manual', 'hourly', 'daily', 'weekly').default('manual'),
    syncTime: nullableString(10),
    syncStartDate: nullableDate
  }),

  brokerSyncConnectionUpdate: Joi.object({
    accountLabel: nullableString(255),
    autoSyncEnabled: Joi.boolean(),
    syncFrequency: Joi.string().valid('manual', 'hourly', 'daily', 'weekly'),
    syncTime: nullableString(10),
    syncStartDate: nullableDate
  }).min(1),

  brokerSyncManualSync: Joi.object({
    startDate: nullableDate,
    endDate: nullableDate
  }),

  accountCreate: Joi.object({
    accountName: Joi.string().trim().max(255).required(),
    accountIdentifier: nullableString(100),
    broker: nullableString(100),
    initialBalance: Joi.number().min(0).default(0),
    initialBalanceDate: nullableDate.required(),
    isPrimary: Joi.boolean().default(false),
    notes: nullableString(2000)
  }),

  accountUpdate: Joi.object({
    accountName: Joi.string().trim().max(255),
    accountIdentifier: nullableString(100),
    broker: nullableString(100),
    initialBalance: Joi.number().min(0),
    initialBalanceDate: nullableDate,
    isPrimary: Joi.boolean(),
    notes: nullableString(2000)
  }).min(1),

  accountTransaction: Joi.object({
    transactionType: Joi.string().valid('deposit', 'withdrawal').required(),
    amount: Joi.number().positive().required(),
    transactionDate: nullableDate.required(),
    description: nullableString(1000)
  }),

  accountTransactionUpdate: Joi.object({
    transactionType: Joi.string().valid('deposit', 'withdrawal'),
    amount: Joi.number().positive(),
    transactionDate: nullableDate,
    description: nullableString(1000)
  }).min(1),

  accountLinkTrades: Joi.object({
    sourceIdentifier: nullableString(100),
    linkAll: Joi.boolean().default(false)
  }).custom((value, helpers) => {
    if (!value.sourceIdentifier && !value.linkAll) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'link trades validation').messages({
    'any.invalid': 'Must provide sourceIdentifier or set linkAll to true'
  }),

  investmentHoldingCreate: Joi.object({
    symbol: Joi.string().trim().max(20).required(),
    shares: Joi.number().positive().required(),
    costPerShare: Joi.number().positive().required(),
    purchaseDate: nullableDate,
    notes: nullableString(2000),
    broker: nullableString(100),
    accountIdentifier: nullableString(100)
  }),

  investmentHoldingUpdate: Joi.object({
    notes: nullableString(2000),
    targetAllocationPercent: nullableNumber,
    sector: nullableString(100)
  }).min(1),

  investmentLotCreate: Joi.object({
    shares: Joi.number().positive().required(),
    costPerShare: Joi.number().positive().required(),
    purchaseDate: nullableDate,
    broker: nullableString(100),
    accountIdentifier: nullableString(100),
    notes: nullableString(2000)
  }),

  investmentDividendCreate: Joi.object({
    dividendPerShare: Joi.number().positive().required(),
    sharesHeld: Joi.number().positive().required(),
    paymentDate: nullableDate.required(),
    exDividendDate: nullableDate,
    isDrip: Joi.boolean().default(false),
    dripShares: nullableNumber,
    dripPrice: nullableNumber,
    notes: nullableString(2000)
  }),

  investmentFavoriteToggle: Joi.object({
    symbol: Joi.string().trim().max(20).required()
  }),

  investmentCompare: Joi.object({
    symbols: Joi.array().items(Joi.string().trim().max(20)).min(2).max(3).required()
  }),

  investmentDcfCalculate: Joi.object({
    revenue_growth_low: nullableNumber,
    revenue_growth_medium: nullableNumber,
    revenue_growth_high: nullableNumber,
    profit_margin_low: nullableNumber,
    profit_margin_medium: nullableNumber,
    profit_margin_high: nullableNumber,
    fcf_margin_low: nullableNumber,
    fcf_margin_medium: nullableNumber,
    fcf_margin_high: nullableNumber,
    pe_low: nullableNumber,
    pe_medium: nullableNumber,
    pe_high: nullableNumber,
    pfcf_low: nullableNumber,
    pfcf_medium: nullableNumber,
    pfcf_high: nullableNumber,
    desired_return_low: nullableNumber,
    desired_return_medium: nullableNumber,
    desired_return_high: nullableNumber,
    projection_years: Joi.number().integer().min(1).max(30).default(10)
  }).unknown(false),

  gamificationChallengeCreate: Joi.object({
    key: Joi.string().trim().max(100).required(),
    title: Joi.string().trim().max(255).required(),
    description: nullableString(2000),
    challengeType: Joi.string().trim().max(100),
    metricType: Joi.string().trim().max(100),
    targetValue: Joi.number(),
    startDate: nullableDate,
    endDate: nullableDate,
    rewardPoints: Joi.number().integer().min(0),
    isActive: Joi.boolean()
  }).unknown(true),

  adminAiSettings: Joi.object({
    aiProvider: aiProviderSchema.required(),
    aiApiKey: nullableString(4096),
    aiApiUrl: nullableString(2048),
    aiModel: nullableString(255)
  }),

  testimonialSubmit: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    body: Joi.string().trim().max(2000).required(),
    display_name: nullableString(100)
  })
};

schemas.trade = schemas.createTrade;

module.exports = { validate, schemas };
