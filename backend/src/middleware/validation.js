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
    exitTime: Joi.date().iso().allow(null),
    entryPrice: Joi.number().positive().required(),
    exitPrice: Joi.number().positive().allow(null),
    quantity: Joi.number().integer().positive().required(),
    side: Joi.string().valid('long', 'short').required(),
    commission: Joi.number().min(0).default(0),
    fees: Joi.number().min(0).default(0),
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
    exitTime: Joi.date().iso().allow(null),
    entryPrice: Joi.number().positive(),
    exitPrice: Joi.number().positive().allow(null),
    quantity: Joi.number().integer().positive(),
    side: Joi.string().valid('long', 'short'),
    commission: Joi.number().min(0),
    fees: Joi.number().min(0),
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
    timezone: Joi.string().max(50)
  }).min(1)
};

module.exports = { validate, schemas };