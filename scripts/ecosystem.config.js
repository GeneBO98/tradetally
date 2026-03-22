const env = {
  NODE_ENV: 'production',
  PORT: 3000,  // Using 3001 to avoid conflict with Docker on 3000
  POSTHOG_LOG_LEVEL: process.env.POSTHOG_LOG_LEVEL || 'info',
  DEBUG_POSTHOG: process.env.DEBUG_POSTHOG || 'true'
};

if (process.env.VITE_POSTHOG_KEY) {
  env.VITE_POSTHOG_KEY = process.env.VITE_POSTHOG_KEY;
}

if (process.env.VITE_POSTHOG_HOST) {
  env.VITE_POSTHOG_HOST = process.env.VITE_POSTHOG_HOST;
}

module.exports = {
  apps: [
    {
      name: 'tradetally-backend-native',
      cwd: '/home/docker-admin/tradetally/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env,
      error_file: '/home/docker-admin/tradetally/backend/logs/pm2-error.log',
      out_file: '/home/docker-admin/tradetally/backend/logs/pm2-out.log',
      log_file: '/home/docker-admin/tradetally/backend/logs/pm2-combined.log',
      time: true
    }
  ]
};
