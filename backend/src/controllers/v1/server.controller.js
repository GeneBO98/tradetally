const db = require('../../config/database');

const serverController = {
  /**
   * Get server information for mobile app discovery
   */
  async getServerInfo(req, res, next) {
    try {
      // Get instance configuration from database
      const configResult = await db.query(`
        SELECT key, value FROM instance_config 
        WHERE is_public = true
      `);

      const config = {};
      configResult.rows.forEach(row => {
        config[row.key] = row.value;
      });

      // Determine if this is the cloud instance
      const isCloud = req.get('host')?.includes('tradetally.io') || false;

      res.json({
        server: {
          name: config.instance_name || 'TradeTally',
          version: config.api_version || 'v1',
          url: config.instance_url || `${req.protocol}://${req.get('host')}`,
          isCloud: isCloud,
          timestamp: new Date().toISOString()
        },
        api: {
          version: 'v1',
          baseUrl: '/api/v1',
          endpoints: {
            auth: '/api/v1/auth',
            users: '/api/v1/users', 
            trades: '/api/v1/trades',
            analytics: '/api/v1/analytics',
            settings: '/api/v1/settings',
            devices: '/api/v1/devices',
            sync: '/api/v1/sync',
            server: '/api/v1/server'
          }
        },
        features: config.features || {
          mobile_sync: true,
          device_management: true,
          push_notifications: false,
          biometric_auth: true,
          offline_mode: true,
          multi_device: true
        },
        mobile: config.mobile_config || {
          min_app_version: '1.0.0',
          sync_interval_seconds: 300,
          session_timeout_minutes: 15,
          max_devices_per_user: 10,
          access_token_minutes: 15,
          refresh_token_days: 30
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get server configuration (detailed)
   */
  async getServerConfig(req, res, next) {
    try {
      const configResult = await db.query(`
        SELECT key, value, description FROM instance_config 
        WHERE is_public = true
        ORDER BY key
      `);

      const config = {};
      configResult.rows.forEach(row => {
        config[row.key] = {
          value: row.value,
          description: row.description
        };
      });

      res.json({ config });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get available features
   */
  async getFeatures(req, res, next) {
    try {
      const result = await db.query(`
        SELECT value FROM instance_config 
        WHERE key = 'features'
      `);

      const features = result.rows[0]?.value || {
        mobile_sync: true,
        device_management: true,
        push_notifications: false,
        biometric_auth: true,
        offline_mode: true,
        multi_device: true
      };

      res.json({ features });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get API version info
   */
  async getVersion(req, res, next) {
    try {
      const packageInfo = require('../../../package.json');
      
      res.json({
        api: {
          version: 'v1',
          current: true,
          deprecated: false
        },
        server: {
          name: packageInfo.name,
          version: packageInfo.version,
          description: packageInfo.description
        },
        capabilities: {
          refresh_tokens: true,
          device_management: true,
          sync: true,
          push_notifications: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
          websockets: false // Future feature
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Check for available updates from GitHub releases
   */
  async checkForUpdates(req, res, next) {
    try {
      const versionService = require('../../services/versionService');
      const result = await versionService.checkForUpdates();
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get server capabilities
   */
  async getCapabilities(req, res, next) {
    try {
      res.json({
        authentication: {
          methods: ['email_password'],
          refresh_tokens: true,
          device_tracking: true,
          biometric_support: true,
          multi_device: true,
          session_management: true
        },
        data: {
          sync: true,
          offline_support: true,
          conflict_resolution: true,
          bulk_operations: true,
          real_time: false // Future WebSocket feature
        },
        mobile: {
          push_notifications: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
          background_sync: true,
          deep_linking: true,
          share_extension: true
        },
        security: {
          https_required: process.env.NODE_ENV === 'production',
          token_rotation: true,
          device_trust: true,
          rate_limiting: true
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get available API endpoints
   */
  async getEndpoints(req, res, next) {
    try {
      const baseUrl = '/api/v1';
      
      res.json({
        baseUrl,
        endpoints: {
          // Authentication
          'auth.login': `${baseUrl}/auth/login`,
          'auth.login_device': `${baseUrl}/auth/login/device`,
          'auth.refresh': `${baseUrl}/auth/refresh`,
          'auth.logout': `${baseUrl}/auth/logout`,
          'auth.register': `${baseUrl}/auth/register`,
          
          // User management
          'users.profile': `${baseUrl}/users/profile`,
          'users.preferences': `${baseUrl}/users/preferences`,
          'users.sync_info': `${baseUrl}/users/sync-info`,
          
          // Trades
          'trades.list': `${baseUrl}/trades`,
          'trades.create': `${baseUrl}/trades`,
          'trades.sync': `${baseUrl}/trades/sync`,
          'trades.bulk': `${baseUrl}/trades/bulk`,
          
          // Analytics
          'analytics.dashboard': `${baseUrl}/analytics/dashboard`,
          'analytics.mobile': `${baseUrl}/analytics/mobile/summary`,
          'analytics.performance': `${baseUrl}/analytics/performance`,
          
          // Settings
          'settings.get': `${baseUrl}/settings`,
          'settings.mobile': `${baseUrl}/settings/mobile`,
          'settings.notifications': `${baseUrl}/settings/notifications`,
          
          // Device management
          'devices.list': `${baseUrl}/devices`,
          'devices.register': `${baseUrl}/devices`,
          'devices.current': `${baseUrl}/devices/current/info`,
          'devices.trust': `${baseUrl}/devices/:id/trust`,
          
          // Sync
          'sync.full': `${baseUrl}/sync/full`,
          'sync.delta': `${baseUrl}/sync/delta`,
          'sync.status': `${baseUrl}/sync/status`,
          'sync.conflicts': `${baseUrl}/sync/conflicts`,
          
          // Server info
          'server.info': `${baseUrl}/server/info`,
          'server.health': `${baseUrl}/server/health`,
          'server.version': `${baseUrl}/server/version`
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Health check endpoint
   */
  async getHealth(req, res, next) {
    try {
      // Check database connection
      const dbResult = await db.query('SELECT 1 as health');
      const dbHealthy = dbResult.rows.length > 0;

      // Check critical tables exist
      const tablesResult = await db.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'trades', 'refresh_tokens', 'devices')
      `);
      const requiredTables = ['users', 'trades', 'refresh_tokens', 'devices'];
      const tablesHealthy = requiredTables.every(table => 
        tablesResult.rows.some(row => row.table_name === table)
      );

      const isHealthy = dbHealthy && tablesHealthy;

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: 'v1',
        checks: {
          database: dbHealthy ? 'ok' : 'error',
          tables: tablesHealthy ? 'ok' : 'error',
          mobile_ready: isHealthy
        },
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
        checks: {
          database: 'error',
          tables: 'unknown',
          mobile_ready: false
        }
      });
    }
  },

  /**
   * Get server status and statistics
   */
  async getStatus(req, res, next) {
    try {
      // Get user and device counts
      const statsResult = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
          (SELECT COUNT(*) FROM devices) as total_devices,
          (SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL) as active_tokens,
          (SELECT COUNT(*) FROM trades) as total_trades
      `);

      const stats = statsResult.rows[0];

      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        statistics: {
          users: {
            active: parseInt(stats.active_users),
            total: parseInt(stats.active_users) // Simplified for now
          },
          devices: {
            total: parseInt(stats.total_devices),
            active_sessions: parseInt(stats.active_tokens)
          },
          data: {
            trades: parseInt(stats.total_trades)
          }
        },
        system: {
          uptime_seconds: Math.floor(process.uptime()),
          memory_usage: process.memoryUsage(),
          node_version: process.version,
          environment: process.env.NODE_ENV || 'development'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get system metrics (basic)
   */
  async getMetrics(req, res, next) {
    try {
      const memUsage = process.memoryUsage();
      
      res.json({
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024) // MB
        },
        system: {
          platform: process.platform,
          arch: process.arch,
          node_version: process.version,
          pid: process.pid
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get mobile app configuration
   */
  async getMobileConfig(req, res, next) {
    try {
      const result = await db.query(`
        SELECT value FROM instance_config 
        WHERE key = 'mobile_config'
      `);

      const mobileConfig = result.rows[0]?.value || {
        min_app_version: '1.0.0',
        sync_interval_seconds: 300,
        session_timeout_minutes: 15,
        max_devices_per_user: 10,
        access_token_minutes: 15,
        refresh_token_days: 30
      };

      res.json({
        mobile: mobileConfig,
        server_time: new Date().toISOString(),
        timezone: 'UTC'
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get mobile app requirements
   */
  async getMobileRequirements(req, res, next) {
    try {
      res.json({
        minimum_version: '1.0.0',
        recommended_version: '1.2.0',
        force_update_version: null,
        requirements: {
          ios: {
            minimum_os: '13.0',
            required_permissions: ['internet', 'notifications'],
            recommended_permissions: ['biometric', 'background_refresh']
          },
          android: {
            minimum_api: 23, // Android 6.0
            target_api: 34,   // Android 14
            required_permissions: ['android.permission.INTERNET'],
            recommended_permissions: [
              'android.permission.USE_FINGERPRINT',
              'android.permission.USE_BIOMETRIC',
              'android.permission.RECEIVE_BOOT_COMPLETED'
            ]
          }
        },
        security: {
          require_https: process.env.NODE_ENV === 'production',
          require_certificate_pinning: false,
          allow_debug_builds: process.env.NODE_ENV !== 'production'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Well-known configuration for mobile app discovery
   */
  async getWellKnownConfig(req, res, next) {
    try {
      // Get public configuration
      const configResult = await db.query(`
        SELECT * FROM well_known_config
      `);

      const config = configResult.rows[0]?.config || {};
      
      // Determine if this is cloud instance
      const isCloud = req.get('host')?.includes('tradetally.io') || false;

      res.json({
        ...config,
        server: {
          name: config.instance_name || 'TradeTally',
          url: config.instance_url || `${req.protocol}://${req.get('host')}`,
          isCloud: isCloud,
          discovery_version: '1.0'
        },
        discovery: {
          timestamp: new Date().toISOString(),
          ttl: 3600 // Cache for 1 hour
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get OpenAPI specification
   */
  async getOpenAPISpec(req, res, next) {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}/api/v1`;
      
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'TradeTally Mobile API',
          version: 'v1',
          description: 'Comprehensive API for TradeTally mobile applications supporting both cloud and self-hosted deployments',
          contact: {
            name: 'TradeTally Support',
            url: 'https://tradetally.io',
            email: 'support@tradetally.io'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: baseUrl,
            description: 'Current server'
          },
          {
            url: 'https://api.tradetally.io/api/v1',
            description: 'TradeTally Cloud'
          }
        ],
        security: [
          {
            bearerAuth: []
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT access token for authentication'
            }
          },
          parameters: {
            deviceId: {
              name: 'X-Device-ID',
              in: 'header',
              description: 'Unique device identifier for multi-device support',
              required: false,
              schema: {
                type: 'string',
                format: 'uuid'
              }
            }
          },
          schemas: {
            Error: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                code: { type: 'string' },
                message: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' }
              }
            },
            User: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                username: { type: 'string' },
                fullName: { type: 'string' },
                role: { type: 'string', enum: ['user', 'admin', 'owner'] }
              }
            },
            Device: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                type: { type: 'string', enum: ['ios', 'android', 'web', 'desktop'] },
                model: { type: 'string' },
                isTrusted: { type: 'boolean' },
                lastActive: { type: 'string', format: 'date-time' },
                createdAt: { type: 'string', format: 'date-time' }
              }
            },
            Tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'integer' },
                tokenType: { type: 'string', enum: ['Bearer'] }
              }
            }
          }
        },
        paths: {
          '/server/info': {
            get: {
              summary: 'Get server information',
              description: 'Returns server configuration and capabilities for mobile app discovery and setup',
              operationId: 'getServerInfo',
              tags: ['Server Discovery'],
              responses: {
                200: {
                  description: 'Server information retrieved successfully',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          server: {
                            type: 'object',
                            properties: {
                              name: { type: 'string' },
                              version: { type: 'string' },
                              url: { type: 'string', format: 'uri' },
                              isCloud: { type: 'boolean' }
                            }
                          },
                          api: {
                            type: 'object',
                            properties: {
                              version: { type: 'string' },
                              baseUrl: { type: 'string' }
                            }
                          },
                          features: { type: 'object' },
                          mobile: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '/server/health': {
            get: {
              summary: 'Health check',
              description: 'Check if the API is healthy and ready for mobile apps',
              operationId: 'getHealth',
              tags: ['Server Discovery'],
              responses: {
                200: {
                  description: 'Server is healthy'
                },
                503: {
                  description: 'Server is unhealthy'
                }
              }
            }
          },
          '/auth/login/device': {
            post: {
              summary: 'Login with device registration',
              description: 'Authenticate user and register device for multi-device management',
              operationId: 'loginWithDevice',
              tags: ['Authentication'],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['email', 'password', 'deviceInfo'],
                      properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string' },
                        deviceInfo: {
                          type: 'object',
                          required: ['name', 'type'],
                          properties: {
                            name: { type: 'string' },
                            type: { type: 'string', enum: ['ios', 'android', 'web', 'desktop'] },
                            model: { type: 'string' },
                            fingerprint: { type: 'string' },
                            platformVersion: { type: 'string' },
                            appVersion: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                200: {
                  description: 'Login successful',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                          user: { $ref: '#/components/schemas/User' },
                          device: { $ref: '#/components/schemas/Device' },
                          tokens: { $ref: '#/components/schemas/Tokens' }
                        }
                      }
                    }
                  }
                },
                401: {
                  description: 'Invalid credentials',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Error' }
                    }
                  }
                }
              }
            }
          },
          '/auth/refresh': {
            post: {
              summary: 'Refresh access token',
              description: 'Obtain a new access token using a refresh token with automatic token rotation',
              operationId: 'refreshToken',
              tags: ['Authentication'],
              parameters: [
                { $ref: '#/components/parameters/deviceId' }
              ],
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
                  description: 'Token refreshed successfully',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                          tokens: { $ref: '#/components/schemas/Tokens' }
                        }
                      }
                    }
                  }
                },
                401: {
                  description: 'Invalid or expired refresh token',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Error' }
                    }
                  }
                }
              }
            }
          },
          '/devices': {
            get: {
              summary: 'List user devices',
              description: 'Get all registered devices for the authenticated user',
              operationId: 'getDevices',
              tags: ['Device Management'],
              security: [{ bearerAuth: [] }],
              responses: {
                200: {
                  description: 'Devices retrieved successfully',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          devices: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Device' }
                          },
                          totalCount: { type: 'integer' },
                          maxDevices: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            },
            post: {
              summary: 'Register new device',
              description: 'Register a new device for the authenticated user',
              operationId: 'registerDevice',
              tags: ['Device Management'],
              security: [{ bearerAuth: [] }],
              responses: {
                201: {
                  description: 'Device registered successfully'
                },
                429: {
                  description: 'Maximum number of devices reached'
                }
              }
            }
          },
          '/sync/full': {
            get: {
              summary: 'Full data sync',
              description: 'Download complete dataset for initial app setup',
              operationId: 'getFullSync',
              tags: ['Sync Operations'],
              security: [{ bearerAuth: [] }],
              responses: {
                200: {
                  description: 'Full sync data retrieved successfully'
                }
              }
            }
          },
          '/sync/delta': {
            get: {
              summary: 'Delta sync',
              description: 'Get incremental changes since last sync',
              operationId: 'getDeltaSync',
              tags: ['Sync Operations'],
              security: [{ bearerAuth: [] }],
              parameters: [
                {
                  name: 'since_version',
                  in: 'query',
                  description: 'Last sync version number',
                  schema: { type: 'integer', minimum: 0 }
                }
              ],
              responses: {
                200: {
                  description: 'Delta sync data retrieved successfully'
                }
              }
            },
            post: {
              summary: 'Upload changes',
              description: 'Push local changes to server',
              operationId: 'processDeltaSync',
              tags: ['Sync Operations'],
              security: [{ bearerAuth: [] }],
              responses: {
                200: {
                  description: 'Changes processed successfully'
                }
              }
            }
          }
        },
        tags: [
          {
            name: 'Server Discovery',
            description: 'Endpoints for mobile app server discovery and configuration'
          },
          {
            name: 'Authentication',
            description: 'Enhanced authentication with device management and refresh tokens'
          },
          {
            name: 'Device Management',
            description: 'Multi-device support and device lifecycle management'
          },
          {
            name: 'Sync Operations',
            description: 'Data synchronization for offline-capable mobile apps'
          },
          {
            name: 'Mobile Analytics',
            description: 'Analytics endpoints optimized for mobile displays'
          }
        ]
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get API documentation (placeholder)
   */
  async getAPIDocumentation(req, res, next) {
    try {
      res.json({
        documentation: {
          version: 'v1',
          base_url: '/api/v1',
          authentication: 'Bearer token required',
          rate_limits: '1000 requests per 15 minutes',
          mobile_headers: {
            'X-Device-ID': 'Required for device-specific operations',
            'User-Agent': 'Recommended for analytics and debugging'
          }
        },
        getting_started: {
          step1: 'Discover server: GET /.well-known/tradetally-config.json',
          step2: 'Register/Login: POST /api/v1/auth/login/device',
          step3: 'Make requests: Include Authorization: Bearer {token}',
          step4: 'Refresh tokens: POST /api/v1/auth/refresh when needed'
        },
        support: {
          documentation: 'https://docs.tradetally.io',
          github: 'https://github.com/tradetally/mobile-app',
          contact: 'support@tradetally.io'
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = serverController;