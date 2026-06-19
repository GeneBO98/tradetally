const Joi = require('joi');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(5001),
  FRONTEND_URL: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  JWT_SECRET: Joi.string().min(16).required(),
  DB_HOST: Joi.string().min(1).required(),
  DB_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DB_USER: Joi.string().min(1).required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().min(1).required(),
  API_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null),
  RATE_LIMIT_ENABLED: Joi.string().valid('true', 'false').default('true'),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).optional(),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).optional(),
  EMAIL_HOST: Joi.string().allow('', null),
  EMAIL_PORT: Joi.number().integer().min(1).max(65535).optional(),
  EMAIL_USER: Joi.string().allow('', null),
  EMAIL_PASS: Joi.string().allow('', null),
  EMAIL_FROM: Joi.string().email().allow('', null),
  SUPPORT_EMAIL: Joi.string().email().allow('', null),
  ENABLE_PRICE_MONITORING: Joi.string().valid('true', 'false').default('true'),
  MARKET_DATA_PROVIDER: Joi.string().valid('finnhub', 'fmp').default('finnhub'),
  FINNHUB_API_KEY: Joi.string().allow('', null),
  FMP_API_KEY: Joi.string().allow('', null),
  ENABLE_BACKUP_SCHEDULER: Joi.string().valid('true', 'false').default('true'),
  BACKUP_DIR: Joi.string().allow('', null)
}).unknown(true);

function validateEnv() {
  const { value, error } = envSchema.validate(process.env, {
    abortEarly: false,
    convert: true
  });

  if (error) {
    const details = error.details.map((detail) => detail.message).join(', ');
    const validationError = new Error(`Environment validation failed: ${details}`);
    validationError.code = 'ENV_VALIDATION_FAILED';
    throw validationError;
  }

  const warnings = [];

  if (value.NODE_ENV === 'production' && value.JWT_SECRET.includes('your_jwt_secret')) {
    warnings.push('JWT_SECRET is using the example placeholder value.');
  }

  const effectiveMarketDataProvider = value.MARKET_DATA_PROVIDER === 'fmp' ? 'fmp' : 'finnhub';
  const marketDataKey = effectiveMarketDataProvider === 'fmp' ? value.FMP_API_KEY : value.FINNHUB_API_KEY;
  const marketDataKeyName = effectiveMarketDataProvider === 'fmp' ? 'FMP_API_KEY' : 'FINNHUB_API_KEY';
  if (value.ENABLE_PRICE_MONITORING !== 'false' && !marketDataKey) {
    warnings.push(`ENABLE_PRICE_MONITORING is enabled but ${marketDataKeyName} is not configured.`);
  }

  const emailFieldsConfigured = [value.EMAIL_HOST, value.EMAIL_USER, value.EMAIL_PASS].filter(Boolean).length;
  if (emailFieldsConfigured > 0 && emailFieldsConfigured < 3) {
    warnings.push('Email configuration is partial. EMAIL_HOST, EMAIL_USER, and EMAIL_PASS must all be set.');
  }

  return {
    env: value,
    warnings
  };
}

module.exports = {
  validateEnv
};
