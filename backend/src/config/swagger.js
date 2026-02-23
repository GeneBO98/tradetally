const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TradeTally API',
      version: '1.0.0',
      description: 'TradeTally trading journal and analytics API',
      contact: {
        name: 'TradeTally Support',
        url: 'https://tradetally.com',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT or API Key',
          description: 'Enter a JWT access token or an API key (format: tt_live_xxx). API keys can be created under Profile > API Keys.',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Enter your API key (format: tt_live_xxx). API keys can be created under Profile > API Keys.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            code: {
              type: 'string',
              description: 'Error code',
            },
          },
        },
        Trade: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Trade ID',
            },
            symbol: {
              type: 'string',
              description: 'Stock symbol',
              example: 'AAPL',
            },
            side: {
              type: 'string',
              enum: ['long', 'short'],
              description: 'Trade direction',
            },
            quantity: {
              type: 'number',
              description: 'Number of shares',
              example: 100,
            },
            entryPrice: {
              type: 'number',
              format: 'float',
              description: 'Entry price per share',
              example: 150.25,
            },
            exitPrice: {
              type: 'number',
              format: 'float',
              description: 'Exit price per share',
              example: 155.75,
            },
            entryTime: {
              type: 'string',
              format: 'date-time',
              description: 'Entry timestamp',
            },
            exitTime: {
              type: 'string',
              format: 'date-time',
              description: 'Exit timestamp',
            },
            pnl: {
              type: 'number',
              format: 'float',
              description: 'Profit/Loss amount',
              example: 550.00,
            },
            commission: {
              type: 'number',
              format: 'float',
              description: 'Commission paid',
              example: 1.00,
            },
            fees: {
              type: 'number',
              format: 'float', 
              description: 'Additional fees',
              example: 0.50,
            },
            notes: {
              type: 'string',
              description: 'Trade notes',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Trade tags',
            },
            strategy: {
              type: 'string',
              description: 'Trading strategy',
              example: 'momentum',
            },
            enrichmentStatus: {
              type: 'string',
              enum: ['pending', 'completed'],
              description: 'Enrichment status',
            },
          },
        },
        CreateTrade: {
          type: 'object',
          required: ['symbol', 'side', 'quantity', 'entryPrice', 'entryTime'],
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock/option/future symbol',
              example: 'AAPL',
            },
            side: {
              type: 'string',
              enum: ['long', 'short'],
              description: 'Trade direction',
            },
            quantity: {
              type: 'number',
              description: 'Number of shares/contracts',
              example: 100,
            },
            entryPrice: {
              type: 'number',
              format: 'float',
              description: 'Entry price per share/contract',
              example: 150.25,
            },
            exitPrice: {
              type: 'number',
              format: 'float',
              description: 'Exit price per share/contract (optional)',
              example: 155.75,
            },
            entryTime: {
              type: 'string',
              format: 'date-time',
              description: 'Entry timestamp',
            },
            exitTime: {
              type: 'string',
              format: 'date-time',
              description: 'Exit timestamp (optional)',
            },
            commission: {
              type: 'number',
              format: 'float',
              description: 'Commission paid',
              example: 1.00,
            },
            fees: {
              type: 'number',
              format: 'float',
              description: 'Additional fees',
              example: 0.50,
            },
            notes: {
              type: 'string',
              description: 'Trade notes',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Trade tags',
            },
            instrumentType: {
              type: 'string',
              enum: ['stock', 'option', 'future', 'crypto'],
              default: 'stock',
              description: 'Type of instrument (also accepts instrument_type in snake_case)',
              example: 'option',
            },
            // Options-specific fields
            underlyingSymbol: {
              type: 'string',
              description: 'Underlying stock symbol for options (also accepts underlying_symbol)',
              example: 'AAPL',
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type (also accepts option_type)',
              example: 'call',
            },
            strikePrice: {
              type: 'number',
              format: 'float',
              description: 'Strike price for options (also accepts strike_price)',
              example: 150.00,
            },
            expirationDate: {
              type: 'string',
              format: 'date',
              description: 'Expiration date for options (also accepts expiration_date)',
              example: '2024-12-20',
            },
            contractSize: {
              type: 'integer',
              description: 'Contract size for options (defaults to 100) (also accepts contract_size)',
              example: 100,
            },
            // Futures-specific fields
            underlyingAsset: {
              type: 'string',
              description: 'Underlying asset for futures (also accepts underlying_asset)',
              example: 'ES',
            },
            contractMonth: {
              type: 'string',
              enum: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
              description: 'Contract month for futures (also accepts contract_month)',
              example: 'DEC',
            },
            contractYear: {
              type: 'integer',
              description: 'Contract year for futures (also accepts contract_year)',
              example: 2024,
            },
            tickSize: {
              type: 'number',
              format: 'float',
              description: 'Tick size for futures (also accepts tick_size)',
              example: 0.25,
            },
            pointValue: {
              type: 'number',
              format: 'float',
              description: 'Point value for futures (also accepts point_value)',
              example: 50.00,
            },
            // Risk management fields
            stopLoss: {
              type: 'number',
              format: 'float',
              description: 'Stop loss price (also accepts stop_loss)',
              example: 145.00,
            },
            takeProfit: {
              type: 'number',
              format: 'float',
              description: 'Take profit price (also accepts take_profit)',
              example: 160.00,
            },
            // Additional fields
            broker: {
              type: 'string',
              description: 'Broker name',
              example: 'Interactive Brokers',
            },
            account_identifier: {
              type: 'string',
              description: 'Account identifier',
              example: 'U123456',
            },
            strategy: {
              type: 'string',
              description: 'Trading strategy',
              example: 'day_trading',
            },
            setup: {
              type: 'string',
              description: 'Trade setup',
              example: 'breakout',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID',
            },
            username: {
              type: 'string',
              description: 'Username',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address',
            },
            fullName: {
              type: 'string',
              description: 'Full name',
            },
            tier: {
              type: 'string',
              enum: ['free', 'pro'],
              description: 'User tier',
            },
          },
        },
        Analytics: {
          type: 'object',
          properties: {
            totalTrades: {
              type: 'number',
              description: 'Total number of trades',
            },
            totalPnL: {
              type: 'number',
              format: 'float',
              description: 'Total profit/loss',
            },
            winRate: {
              type: 'number',
              format: 'float',
              description: 'Win rate percentage',
            },
            avgWin: {
              type: 'number',
              format: 'float',
              description: 'Average winning trade',
            },
            avgLoss: {
              type: 'number',
              format: 'float',
              description: 'Average losing trade',
            },
            profitFactor: {
              type: 'number',
              format: 'float',
              description: 'Profit factor',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.js',
    './src/routes/v1/*.js',
    './src/controllers/*.js',
  ],
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerSpec: specs,
  swaggerUi,
};