module.exports = {
  apps: [
    {
      name: 'tradetally-backend',
      script: './backend/src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      env_file: './backend/.env.production'
    }
  ]
};
