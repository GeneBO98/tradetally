const os = require('os');
const db = require('../../config/database');
const packageInfo = require('../../../package.json');
const {
  buildV1OpenApiSpec,
  getDocumentationMetadata,
  getPublicCapabilities,
  getPublicEndpoints,
  getPublicFeatures
} = require('../../config/openapi/v1');

async function getPublicConfigRows() {
  const result = await db.query(`
    SELECT key, value, description
    FROM instance_config
    WHERE is_public = true
    ORDER BY key
  `);

  const flat = {};
  const detailed = {};

  for (const row of result.rows) {
    flat[row.key] = row.value;
    detailed[row.key] = {
      value: row.value,
      description: row.description
    };
  }

  return { flat, detailed };
}

const serverController = {
  async getServerInfo(req, res, next) {
    try {
      const { flat } = await getPublicConfigRows();
      const origin = `${req.protocol}://${req.get('host')}`;
      const instanceUrl = process.env.INSTANCE_URL || flat.instance_url || origin;

      res.json({
        server: {
          name: flat.instance_name || 'TradeTally',
          version: 'v1',
          url: instanceUrl,
          isCloud: req.get('host')?.includes('tradetally.io') || false,
          timestamp: new Date().toISOString()
        },
        api: {
          version: 'v1',
          baseUrl: '/api/v1',
          endpoints: getPublicEndpoints('/api/v1')
        },
        features: getPublicFeatures(),
        mobile: flat.mobile_config || {
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

  async getServerConfig(req, res, next) {
    try {
      const { detailed } = await getPublicConfigRows();
      res.json({ config: detailed });
    } catch (error) {
      next(error);
    }
  },

  async getFeatures(req, res, next) {
    try {
      res.json({ features: getPublicFeatures() });
    } catch (error) {
      next(error);
    }
  },

  async getVersion(req, res, next) {
    try {
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
        capabilities: getPublicCapabilities()
      });
    } catch (error) {
      next(error);
    }
  },

  async checkForUpdates(req, res, next) {
    try {
      const versionService = require('../../services/versionService');
      const result = await versionService.checkForUpdates();
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getCapabilities(req, res, next) {
    try {
      res.json({ capabilities: getPublicCapabilities() });
    } catch (error) {
      next(error);
    }
  },

  async getEndpoints(req, res, next) {
    try {
      res.json({
        baseUrl: '/api/v1',
        endpoints: getPublicEndpoints('/api/v1')
      });
    } catch (error) {
      next(error);
    }
  },

  async getHealth(req, res, next) {
    try {
      const dbResult = await db.query('SELECT 1 as health');
      res.json({
        status: dbResult.rows.length > 0 ? 'OK' : 'DEGRADED',
        api: 'v1',
        database: dbResult.rows.length > 0 ? 'connected' : 'unavailable',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  },

  async getStatus(req, res, next) {
    try {
      const [usersResult, devicesResult, tradesResult] = await Promise.all([
        db.query('SELECT COUNT(*)::integer AS total FROM users'),
        db.query('SELECT COUNT(*)::integer AS total FROM devices'),
        db.query('SELECT COUNT(*)::integer AS total FROM trades')
      ]);

      res.json({
        status: 'OK',
        version: packageInfo.version,
        stats: {
          users: usersResult.rows[0]?.total || 0,
          devices: devicesResult.rows[0]?.total || 0,
          trades: tradesResult.rows[0]?.total || 0
        },
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  },

  async getMetrics(req, res, next) {
    try {
      const memory = process.memoryUsage();
      res.json({
        metrics: {
          uptime_seconds: Math.round(process.uptime()),
          memory: {
            rss: memory.rss,
            heap_total: memory.heapTotal,
            heap_used: memory.heapUsed,
            external: memory.external
          },
          cpu_count: os.cpus().length,
          node_version: process.version
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getMobileConfig(req, res, next) {
    try {
      const { flat } = await getPublicConfigRows();
      res.json({
        mobile: flat.mobile_config || {
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

  async getMobileRequirements(req, res, next) {
    try {
      res.json({
        requirements: {
          minimum_version: '1.0.0',
          recommended_version: '1.0.0',
          request_headers: ['Authorization', 'X-Request-ID'],
          unsupported_features: ['offline_sync', 'conflict_resolution', 'websockets']
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getWellKnownConfig(req, res, next) {
    try {
      const { flat } = await getPublicConfigRows();
      const origin = `${req.protocol}://${req.get('host')}`;
      const instanceUrl = process.env.INSTANCE_URL || flat.instance_url || origin;

      res.json({
        name: flat.instance_name || 'TradeTally',
        api: {
          version: 'v1',
          base_url: '/api/v1',
          openapi_url: `${instanceUrl}/.well-known/openapi.json`,
          documentation_url: `${instanceUrl}/.well-known/api-docs.json`
        },
        features: getPublicFeatures(),
        server: {
          name: flat.instance_name || 'TradeTally',
          url: instanceUrl,
          isCloud: req.get('host')?.includes('tradetally.io') || false,
          discovery_version: '2.0'
        },
        discovery: {
          timestamp: new Date().toISOString(),
          ttl: 3600
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getOpenAPISpec(req, res, next) {
    try {
      const origin = process.env.INSTANCE_URL || `${req.protocol}://${req.get('host')}`;
      res.json(buildV1OpenApiSpec(origin));
    } catch (error) {
      next(error);
    }
  },

  async getAPIDocumentation(req, res, next) {
    try {
      const origin = process.env.INSTANCE_URL || `${req.protocol}://${req.get('host')}`;
      res.json(getDocumentationMetadata(origin));
    } catch (error) {
      next(error);
    }
  }
};

module.exports = serverController;
