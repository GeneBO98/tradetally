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
      env: {
        NODE_ENV: 'production',
        PORT: 3000  // Using 3001 to avoid conflict with Docker on 3000
      },
      error_file: '/home/docker-admin/tradetally/backend/logs/pm2-error.log',
      out_file: '/home/docker-admin/tradetally/backend/logs/pm2-out.log',
      log_file: '/home/docker-admin/tradetally/backend/logs/pm2-combined.log',
      time: true
    }
  ]
};
