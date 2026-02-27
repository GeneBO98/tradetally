const packageInfo = require('../../../package.json');
const webhooksEnabled = process.env.ENABLE_V1_WEBHOOKS === 'true';

function getPublicCapabilities() {
  return {
    authentication: {
      methods: ['email_password', 'bearer_jwt', 'api_key'],
      refresh_tokens: true,
      api_keys: true
    },
    data: {
      trade_crud: true,
      user_profile: true,
      settings_management: true,
      bulk_operations: true
    },
    platform: {
      request_ids: true,
      rate_limiting: true,
      webhooks: webhooksEnabled
    }
  };
}

function getPublicFeatures() {
  return {
    trade_management: true,
    bulk_trade_operations: true,
    user_profile_management: true,
    settings_management: true,
    public_openapi_spec: true,
    request_ids: true,
    api_key_authentication: true,
    webhook_subscriptions: webhooksEnabled
  };
}

function getPublicEndpoints(baseUrl = '/api/v1') {
  return {
    auth: {
      register: `${baseUrl}/auth/register`,
      login: `${baseUrl}/auth/login`,
      logout: `${baseUrl}/auth/logout`,
      refresh: `${baseUrl}/auth/refresh`,
      me: `${baseUrl}/auth/me`,
      sessionStatus: `${baseUrl}/auth/session/status`,
      sessionExtend: `${baseUrl}/auth/session/extend`
    },
    server: {
      info: `${baseUrl}/server/info`,
      features: `${baseUrl}/server/features`,
      version: `${baseUrl}/server/version`,
      capabilities: `${baseUrl}/server/capabilities`,
      endpoints: `${baseUrl}/server/endpoints`,
      health: `${baseUrl}/server/health`
    },
    trades: {
      list: `${baseUrl}/trades`,
      create: `${baseUrl}/trades`,
      retrieve: `${baseUrl}/trades/{id}`,
      update: `${baseUrl}/trades/{id}`,
      delete: `${baseUrl}/trades/{id}`,
      bulkCreate: `${baseUrl}/trades/bulk`,
      bulkUpdate: `${baseUrl}/trades/bulk`,
      bulkDelete: `${baseUrl}/trades/bulk`,
      recent: `${baseUrl}/trades/recent`,
      quickSummary: `${baseUrl}/trades/summary/quick`
    },
    users: {
      profile: `${baseUrl}/users/profile`,
      avatar: `${baseUrl}/users/profile/avatar`,
      password: `${baseUrl}/users/password`,
      preferences: `${baseUrl}/users/preferences`,
      syncInfo: `${baseUrl}/users/sync-info`
    },
    settings: {
      root: `${baseUrl}/settings`,
      notifications: `${baseUrl}/settings/notifications`,
      display: `${baseUrl}/settings/display`,
      privacy: `${baseUrl}/settings/privacy`
    }
  };
}

function standardResponseHeaders() {
  return {
    'X-Request-ID': {
      description: 'Request correlation ID echoed by the API',
      schema: { type: 'string', example: '0c1893d7-b322-4e44-9d3e-3c33dc4a5b36' }
    },
    'X-Rate-Limit-Remaining': {
      description: 'Remaining requests in the current rate limit window',
      schema: { type: 'integer', example: 992 }
    },
    'X-Rate-Limit-Reset': {
      description: 'Unix timestamp when the current window resets',
      schema: { type: 'integer', example: 1730061600 }
    },
    'X-Idempotency-Replayed': {
      description: 'Present and set to true when a stored idempotent response is replayed',
      schema: { type: 'string', example: 'true' }
    }
  };
}

function errorResponse(ref = '#/components/schemas/ErrorEnvelope', description = 'Request failed') {
  return {
    description,
    headers: standardResponseHeaders(),
    content: {
      'application/json': {
        schema: { $ref: ref }
      }
    }
  };
}

function buildPaths(baseUrl) {
  const endpoints = getPublicEndpoints(baseUrl);
  const requestIdHeaderRef = { $ref: '#/components/parameters/RequestIdHeader' };
  const authHeaderRef = { $ref: '#/components/parameters/AuthorizationHeader' };
  const idempotencyHeaderRef = { $ref: '#/components/parameters/IdempotencyKeyHeader' };
  const badRequest = errorResponse('#/components/schemas/ErrorEnvelope', 'Validation or request error');
  const unauthorized = errorResponse('#/components/schemas/ErrorEnvelope', 'Authentication required');
  const forbidden = errorResponse('#/components/schemas/ErrorEnvelope', 'Forbidden');
  const notFound = errorResponse('#/components/schemas/ErrorEnvelope', 'Resource not found');
  const conflict = errorResponse('#/components/schemas/ErrorEnvelope', 'Conflict');
  const tradeSecurity = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

  return {
    [endpoints.auth.register]: {
      post: {
        tags: ['Authentication'],
        summary: 'Register a user account',
        parameters: [requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
              example: {
                email: 'trader@example.com',
                password: 'SecurePassword123!',
                fullName: 'Taylor Trader'
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Account created',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSessionResponse' }
              }
            }
          },
          400: badRequest,
          409: conflict
        }
      }
    },
    [endpoints.auth.login]: {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate and receive access tokens',
        parameters: [requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: {
                email: 'trader@example.com',
                password: 'SecurePassword123!'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Authenticated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSessionResponse' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.auth.logout]: {
      post: {
        tags: ['Authentication'],
        summary: 'Invalidate the current session',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Session invalidated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Logged out successfully' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.auth.refresh]: {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh an access token',
        parameters: [requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Token refreshed',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.auth.me]: {
      get: {
        tags: ['Authentication'],
        summary: 'Get the authenticated user session',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Current session details',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSessionResponse' }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.auth.sessionStatus]: {
      get: {
        tags: ['Authentication'],
        summary: 'Get session status',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Session status',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    active: { type: 'boolean', example: true },
                    expiresAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.auth.sessionExtend]: {
      post: {
        tags: ['Authentication'],
        summary: 'Extend the current session',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Session extended',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Session extended' },
                    expiresAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.server.info]: {
      get: {
        tags: ['Server'],
        summary: 'Get server discovery information',
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Server discovery payload',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServerInfoResponse' }
              }
            }
          }
        }
      }
    },
    [endpoints.server.features]: {
      get: {
        tags: ['Server'],
        summary: 'Get supported public API features',
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Public features',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    features: { type: 'object', additionalProperties: { type: 'boolean' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    [endpoints.server.version]: {
      get: {
        tags: ['Server'],
        summary: 'Get public API version information',
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Version details',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    api: {
                      type: 'object',
                      properties: {
                        version: { type: 'string', example: 'v1' },
                        current: { type: 'boolean' },
                        deprecated: { type: 'boolean' }
                      }
                    },
                    server: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        version: { type: 'string' },
                        description: { type: 'string' }
                      }
                    },
                    capabilities: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    },
    [endpoints.server.capabilities]: {
      get: {
        tags: ['Server'],
        summary: 'Get public API capabilities',
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Public capabilities',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    capabilities: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    },
    [endpoints.server.endpoints]: {
      get: {
        tags: ['Server'],
        summary: 'List supported public API endpoints',
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Endpoint catalog',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    baseUrl: { type: 'string', example: '/api/v1' },
                    endpoints: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    },
    [endpoints.server.health]: {
      get: {
        tags: ['Server'],
        summary: 'Get instance health for the public API',
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Health status',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'OK' },
                    api: { type: 'string', example: 'v1' },
                    database: { type: 'string', example: 'connected' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    },
    [endpoints.trades.list]: {
      get: {
        tags: ['Trades'],
        summary: 'List trades',
        security: tradeSecurity,
        parameters: [
          requestIdHeaderRef,
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'symbol', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }
        ],
        responses: {
          200: {
            description: 'Paginated trade list',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TradeListResponse' },
                example: {
                  data: [
                    {
                      id: 'e7aa51b0-a216-4ac8-a3fe-6ceca61b67a1',
                      symbol: 'AAPL',
                      side: 'long',
                      quantity: 100,
                      entryPrice: 150.25,
                      exitPrice: 155.75,
                      entryTime: '2026-02-20T14:30:00.000Z',
                      pnl: 550
                    }
                  ],
                  pagination: {
                    limit: 50,
                    offset: 0,
                    total: 1,
                    hasMore: false
                  }
                }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      },
      post: {
        tags: ['Trades'],
        summary: 'Create a trade',
        security: tradeSecurity,
        parameters: [requestIdHeaderRef, idempotencyHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TradeWrite' },
              example: {
                symbol: 'AAPL',
                side: 'long',
                quantity: 100,
                entryPrice: 150.25,
                entryTime: '2026-02-20T14:30:00.000Z'
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Trade created',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TradeResponse' }
              }
            }
          },
          200: {
            description: 'Trade created',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TradeResponse' }
              }
            }
          },
          400: badRequest,
          409: conflict,
          401: unauthorized
        }
      }
    },
    [endpoints.trades.retrieve]: {
      get: {
        tags: ['Trades'],
        summary: 'Get a trade by ID',
        security: tradeSecurity,
        parameters: [
          requestIdHeaderRef,
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Trade detail',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TradeResponse' }
              }
            }
          },
          401: unauthorized,
          404: notFound
        }
      },
      put: {
        tags: ['Trades'],
        summary: 'Update a trade',
        security: tradeSecurity,
        parameters: [
          requestIdHeaderRef,
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TradeWrite' }
            }
          }
        },
        responses: {
          200: {
            description: 'Trade updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TradeResponse' }
              }
            }
          },
          400: badRequest,
          401: unauthorized,
          404: notFound
        }
      },
      delete: {
        tags: ['Trades'],
        summary: 'Delete a trade',
        security: tradeSecurity,
        parameters: [
          requestIdHeaderRef,
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Trade deleted',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Trade deleted successfully' }
                  }
                }
              }
            }
          },
          401: unauthorized,
          404: notFound
        }
      }
    },
    [endpoints.trades.bulkCreate]: {
      post: {
        tags: ['Trades'],
        summary: 'Bulk create trades',
        security: tradeSecurity,
        parameters: [requestIdHeaderRef, idempotencyHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['trades'],
                properties: {
                  trades: {
                    type: 'array',
                    minItems: 1,
                    items: { $ref: '#/components/schemas/TradeWrite' }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk create result with partial failures when applicable',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BulkTradeResult' }
              }
            }
          },
          400: badRequest,
          409: conflict,
          401: unauthorized
        }
      },
      put: {
        tags: ['Trades'],
        summary: 'Bulk update trades',
        security: tradeSecurity,
        parameters: [requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['trades'],
                properties: {
                  trades: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['id'],
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        symbol: { type: 'string' },
                        side: { type: 'string', enum: ['long', 'short'] },
                        quantity: { type: 'number' },
                        entryPrice: { type: 'number' },
                        exitPrice: { type: 'number', nullable: true },
                        entryTime: { type: 'string', format: 'date-time' },
                        exitTime: { type: 'string', format: 'date-time', nullable: true },
                        notes: { type: 'string' },
                        strategy: { type: 'string' },
                        setup: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } }
                      },
                      additionalProperties: true
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk update result with partial failures when applicable',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BulkTradeResult' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      },
      delete: {
        tags: ['Trades'],
        summary: 'Bulk delete trades',
        security: tradeSecurity,
        parameters: [requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tradeIds'],
                properties: {
                  tradeIds: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk delete result with partial failures when applicable',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BulkTradeResult' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.trades.recent]: {
      get: {
        tags: ['Trades'],
        summary: 'Get recent trades by descending entry time',
        security: tradeSecurity,
        parameters: [
          requestIdHeaderRef,
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 10 } },
          { name: 'symbol', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }
        ],
        responses: {
          200: {
            description: 'Paginated recent trades',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TradeListResponse' }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.trades.quickSummary]: {
      get: {
        tags: ['Trades'],
        summary: 'Get a compact trading summary',
        security: tradeSecurity,
        parameters: [requestIdHeaderRef],
        responses: {
          200: {
            description: 'Quick summary',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QuickSummaryResponse' }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.users.profile]: {
      get: {
        tags: ['Users'],
        summary: 'Get the authenticated user profile',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Profile response',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileResponse' }
              }
            }
          },
          401: unauthorized
        }
      },
      put: {
        tags: ['Users'],
        summary: 'Update the authenticated user profile',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  timezone: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Profile updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileResponse' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.users.avatar]: {
      post: {
        tags: ['Users'],
        summary: 'Upload an avatar',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['avatar'],
                properties: {
                  avatar: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Avatar uploaded',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileResponse' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete the current avatar',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Avatar removed',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileResponse' }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.users.password]: {
      put: {
        tags: ['Users'],
        summary: 'Change the current password',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Password updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Password updated successfully' }
                  }
                }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.users.preferences]: {
      get: {
        tags: ['Users'],
        summary: 'Get user preferences',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Preferences',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PreferencesResponse' }
              }
            }
          },
          401: unauthorized
        }
      },
      put: {
        tags: ['Users'],
        summary: 'Update user preferences',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  theme: { type: 'string', enum: ['light', 'dark'] },
                  timezone: { type: 'string' },
                  emailNotifications: { type: 'boolean' },
                  publicProfile: { type: 'boolean' },
                  defaultTags: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Preferences updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PreferencesResponse' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.users.syncInfo]: {
      get: {
        tags: ['Users'],
        summary: 'Get sync metadata summary (read-only informational endpoint)',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Sync metadata',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sync: {
                      type: 'object',
                      properties: {
                        lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
                        syncVersion: { type: 'integer' },
                        pendingChanges: { type: 'integer' },
                        conflictsCount: { type: 'integer' },
                        deviceCount: { type: 'integer' },
                        enabled: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      }
    },
    [endpoints.settings.root]: {
      get: {
        tags: ['Settings'],
        summary: 'Get settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Settings',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SettingsResponse' }
              }
            }
          },
          401: unauthorized
        }
      },
      put: {
        tags: ['Settings'],
        summary: 'Update settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: true
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Settings updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SettingsResponse' }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.settings.notifications]: {
      get: {
        tags: ['Settings'],
        summary: 'Get notification settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Notification settings',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    notifications: { type: 'object' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      },
      put: {
        tags: ['Settings'],
        summary: 'Update notification settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'boolean' },
                  notifications: {
                    type: 'object',
                    properties: {
                      email: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Notification settings updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updated: { type: 'boolean' },
                    notifications: { type: 'object' }
                  }
                }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.settings.display]: {
      get: {
        tags: ['Settings'],
        summary: 'Get display settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Display settings',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    display: { type: 'object' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      },
      put: {
        tags: ['Settings'],
        summary: 'Update display settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  theme: { type: 'string', enum: ['light', 'dark'] },
                  timezone: { type: 'string' },
                  display: {
                    type: 'object',
                    properties: {
                      theme: { type: 'string', enum: ['light', 'dark'] },
                      timezone: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Display settings updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updated: { type: 'boolean' },
                    display: { type: 'object' }
                  }
                }
              }
            }
          },
          400: badRequest,
          401: unauthorized
        }
      }
    },
    [endpoints.settings.privacy]: {
      get: {
        tags: ['Settings'],
        summary: 'Get privacy settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        responses: {
          200: {
            description: 'Privacy settings',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    privacy: { type: 'object' }
                  }
                }
              }
            }
          },
          401: unauthorized
        }
      },
      put: {
        tags: ['Settings'],
        summary: 'Update privacy settings',
        security: [{ bearerAuth: [] }],
        parameters: [authHeaderRef, requestIdHeaderRef],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  publicProfile: { type: 'boolean' },
                  privacy: {
                    type: 'object',
                    properties: {
                      publicProfile: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Privacy settings updated',
            headers: standardResponseHeaders(),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updated: { type: 'boolean' },
                    privacy: { type: 'object' }
                  }
                }
              }
            }
          },
          400: badRequest,
          401: unauthorized,
          403: forbidden
        }
      }
    }
  };
}

function buildV1OpenApiSpec(origin = '') {
  const baseUrl = '/api/v1';
  const serverUrl = origin || 'http://localhost:5001';

  return {
    openapi: '3.0.0',
    info: {
      title: 'TradeTally Public API',
      version: packageInfo.version,
      description: 'Stable public API for TradeTally. `/api/v1` is the supported public contract. `/api` and `/api/v2` remain compatibility surfaces.',
      contact: {
        name: 'TradeTally Support',
        url: 'https://docs.tradetally.io'
      }
    },
    servers: [
      {
        url: serverUrl,
        description: 'TradeTally server root'
      }
    ],
    tags: [
      { name: 'Authentication' },
      { name: 'Server' },
      { name: 'Trades' },
      { name: 'Users' },
      { name: 'Settings' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      parameters: {
        AuthorizationHeader: {
          name: 'Authorization',
          in: 'header',
          required: true,
          schema: { type: 'string', example: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          description: 'Bearer JWT access token'
        },
        RequestIdHeader: {
          name: 'X-Request-ID',
          in: 'header',
          required: false,
          schema: { type: 'string', example: '0c1893d7-b322-4e44-9d3e-3c33dc4a5b36' },
          description: 'Optional client-provided request correlation ID. If omitted, one is generated and returned.'
        },
        IdempotencyKeyHeader: {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 255, example: '02cb1d10-dce0-4bbf-9c6f-6e6a68a5c47b' },
          description: 'Optional idempotency key for safely retrying create requests without duplicate writes.'
        }
      },
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          required: ['error', 'requestId'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                message: { type: 'string', example: 'Trade not found' },
                details: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'object', additionalProperties: true } },
                    { type: 'object', additionalProperties: true }
                  ]
                }
              }
            },
            requestId: { type: 'string', example: '0c1893d7-b322-4e44-9d3e-3c33dc4a5b36' }
          }
        },
        Pagination: {
          type: 'object',
          required: ['limit', 'offset', 'total', 'hasMore'],
          properties: {
            limit: { type: 'integer', minimum: 1, example: 50 },
            offset: { type: 'integer', minimum: 0, example: 0 },
            total: { type: 'integer', minimum: 0, example: 271 },
            hasMore: { type: 'boolean', example: true }
          }
        },
        Trade: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            symbol: { type: 'string', example: 'AAPL' },
            side: { type: 'string', enum: ['long', 'short'] },
            quantity: { type: 'number', example: 100 },
            entryPrice: { type: 'number', example: 150.25 },
            exitPrice: { type: 'number', nullable: true, example: 155.75 },
            entryTime: { type: 'string', format: 'date-time' },
            exitTime: { type: 'string', format: 'date-time', nullable: true },
            pnl: { type: 'number', nullable: true, example: 550.0 },
            strategy: { type: 'string', nullable: true }
          }
        },
        TradeWrite: {
          type: 'object',
          required: ['symbol', 'entryTime', 'entryPrice', 'quantity', 'side'],
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            entryTime: { type: 'string', format: 'date-time' },
            exitTime: { type: 'string', format: 'date-time', nullable: true },
            entryPrice: { type: 'number', example: 150.25 },
            exitPrice: { type: 'number', nullable: true, example: 155.75 },
            quantity: { type: 'number', example: 100 },
            side: { type: 'string', enum: ['long', 'short'] },
            instrumentType: { type: 'string', enum: ['stock', 'option', 'future', 'crypto'] },
            notes: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            strategy: { type: 'string' },
            setup: { type: 'string' }
          }
        },
        TradeListResponse: {
          type: 'object',
          required: ['data', 'pagination'],
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/Trade' }
            },
            pagination: { $ref: '#/components/schemas/Pagination' }
          }
        },
        TradeResponse: {
          type: 'object',
          properties: {
            trade: { $ref: '#/components/schemas/Trade' }
          }
        },
        BulkTradeResult: {
          type: 'object',
          properties: {
            created: { type: 'integer', minimum: 0, nullable: true },
            updated: { type: 'integer', minimum: 0, nullable: true },
            deleted: { type: 'integer', minimum: 0, nullable: true },
            failed: { type: 'integer', minimum: 0 },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'integer', minimum: 0 },
                  tradeId: { type: 'string', format: 'uuid', nullable: true },
                  status: { type: 'string', example: 'created' },
                  error: { type: 'string', nullable: true },
                  trade: { $ref: '#/components/schemas/Trade' }
                }
              }
            }
          }
        },
        QuickSummaryResponse: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                totalTrades: { type: 'integer' },
                openTrades: { type: 'integer' },
                todayPnL: { type: 'number' },
                weekPnL: { type: 'number' },
                monthPnL: { type: 'number' },
                winRate: { type: 'number' },
                avgWin: { type: 'number' },
                avgLoss: { type: 'number' }
              }
            }
          }
        },
        ProfileResponse: {
          type: 'object',
          properties: {
            profile: { type: 'object', additionalProperties: true },
            message: { type: 'string' }
          }
        },
        PreferencesResponse: {
          type: 'object',
          properties: {
            updated: { type: 'boolean' },
            preferences: { type: 'object', additionalProperties: true }
          }
        },
        SettingsResponse: {
          type: 'object',
          properties: {
            updated: { type: 'boolean' },
            settings: { type: 'object', additionalProperties: true }
          }
        },
        AuthSessionResponse: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            token: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            fullName: { type: 'string' }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' }
          }
        },
        ServerInfoResponse: {
          type: 'object',
          properties: {
            server: { type: 'object', additionalProperties: true },
            api: { type: 'object', additionalProperties: true },
            features: { type: 'object', additionalProperties: true },
            mobile: { type: 'object', additionalProperties: true }
          }
        }
      }
    },
    paths: buildPaths(baseUrl)
  };
}

function getDocumentationMetadata(origin = '') {
  const spec = buildV1OpenApiSpec(origin);
  const endpoints = getPublicEndpoints('/api/v1');

  return {
    documentation: {
      title: spec.info.title,
      version: spec.info.version,
      base_url: '/api/v1',
      endpoint_groups: Object.keys(endpoints),
      total_paths: Object.keys(spec.paths).length,
      authentication: {
        supported: ['Bearer JWT', 'X-API-Key'],
        api_keys: true
      },
      headers: {
        request_id: 'X-Request-ID',
        rate_limit_remaining: 'X-Rate-Limit-Remaining',
        rate_limit_reset: 'X-Rate-Limit-Reset',
        idempotency_key: 'Idempotency-Key',
        idempotency_replayed: 'X-Idempotency-Replayed'
      },
      compatibility: {
        supported_public_contract: '/api/v1',
        legacy_routes: ['/api', '/api/v2']
      },
      openapi_url: `${origin || ''}/.well-known/openapi.json`.replace(/([^:]\/)\/+/g, '$1')
    }
  };
}

module.exports = {
  buildV1OpenApiSpec,
  getDocumentationMetadata,
  getPublicCapabilities,
  getPublicEndpoints,
  getPublicFeatures
};
