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
          bearerFormat: 'JWT',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
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
              description: 'Exit price per share (optional)',
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