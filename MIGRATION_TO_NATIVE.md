# Migration Guide: Docker to Native Services

This guide will help you migrate TradeTally from Docker containers to running natively with Node.js and PostgreSQL as system services.

## Prerequisites

- Ubuntu/Debian-based Linux system (or adjust commands for your OS)
- Node.js 20+ installed
- PostgreSQL 15+ installed
- Nginx installed
- PM2 or systemd for process management
- Root or sudo access

## Step 1: Export Data from Docker

### 1.1 Export PostgreSQL Database

First, create a backup of your PostgreSQL database from the Docker container:

```bash
# Create backup directory
mkdir -p ~/tradetally-migration

# Export the database from Docker
docker exec tradetally-db-dev pg_dump -U trader -d tradetally > ~/tradetally-migration/tradetally_backup.sql

# Export users and roles (if custom)
docker exec tradetally-db-dev pg_dumpall -U trader --roles-only > ~/tradetally-migration/roles_backup.sql

# Copy any uploaded files from Docker volumes
docker cp tradetally-app-dev:/app/backend/src/data ~/tradetally-migration/app_data
docker cp tradetally-app-dev:/app/backend/src/logs ~/tradetally-migration/app_logs
```

### 1.2 Export Environment Variables

Save your current environment configuration:

```bash
# Copy your .env file
cp .env ~/tradetally-migration/.env.backup

# Export Docker environment (for reference)
docker exec tradetally-app-dev env > ~/tradetally-migration/docker_env.txt
```

## Step 2: Install Native Services

### 2.1 Install PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-15 postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.2 Install Node.js 20

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### 2.3 Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 2.4 Install Nginx

```bash
sudo apt install nginx
sudo systemctl enable nginx
```

## Step 3: Configure PostgreSQL

### 3.1 Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE USER trader WITH PASSWORD 'your_secure_password';
CREATE DATABASE tradetally OWNER trader;
GRANT ALL PRIVILEGES ON DATABASE tradetally TO trader;
\q
```

### 3.2 Import Data

```bash
# Import the database backup
sudo -u postgres psql tradetally < ~/tradetally-migration/tradetally_backup.sql

# Set proper ownership
sudo -u postgres psql -c "ALTER DATABASE tradetally OWNER TO trader;"
sudo -u postgres psql -d tradetally -c "REASSIGN OWNED BY postgres TO trader;"
```

### 3.3 Configure PostgreSQL Access

Edit PostgreSQL configuration:

```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Add this line for local connections:
local   tradetally      trader                                  md5
host    tradetally      trader          127.0.0.1/32            md5
host    tradetally      trader          ::1/128                 md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

## Step 4: Set Up TradeTally Application

### 4.1 Prepare Application Directory

```bash
# Create application directory
sudo mkdir -p /opt/tradetally
sudo chown $USER:$USER /opt/tradetally

# Clone or copy your application
cp -r ~/Projects/tradetally/* /opt/tradetally/

# Restore data and logs
cp -r ~/tradetally-migration/app_data /opt/tradetally/backend/src/
cp -r ~/tradetally-migration/app_logs /opt/tradetally/backend/src/
```

### 4.2 Install Dependencies

```bash
# Backend dependencies
cd /opt/tradetally/backend
npm install --production

# Frontend build
cd /opt/tradetally/frontend
npm install
npm run build
```

### 4.3 Configure Environment

Create production environment file:

```bash
# Create .env file
nano /opt/tradetally/backend/.env
```

Add the following (adjust values as needed):

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=trader
DB_PASSWORD=your_secure_password
DB_NAME=tradetally

# Application Configuration
NODE_ENV=production
PORT=3000

# Security
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# API Keys (if applicable)
FINNHUB_API_KEY=your_key
ALPHA_VANTAGE_API_KEY=your_key
GEMINI_API_KEY=your_key

# Frontend URL
FRONTEND_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com

# Registration Mode
REGISTRATION_MODE=open
```

## Step 5: Set Up Process Management

### 5.1 Using PM2 (Recommended)

Create PM2 ecosystem file:

```bash
nano /opt/tradetally/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'tradetally-backend',
    script: '/opt/tradetally/backend/src/server.js',
    cwd: '/opt/tradetally/backend',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/opt/tradetally/backend/src/logs/pm2-error.log',
    out_file: '/opt/tradetally/backend/src/logs/pm2-out.log',
    log_file: '/opt/tradetally/backend/src/logs/pm2-combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

Start the application:

```bash
# Start with PM2
cd /opt/tradetally
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup systemd
# Follow the command it outputs
```

### 5.2 Alternative: Using Systemd

Create systemd service file:

```bash
sudo nano /etc/systemd/system/tradetally.service
```

```ini
[Unit]
Description=TradeTally Trading Journal Application
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/tradetally/backend
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=/opt/tradetally/backend/.env
ExecStartPre=/usr/bin/npm run migrate
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=append:/opt/tradetally/backend/src/logs/systemd.log
StandardError=append:/opt/tradetally/backend/src/logs/systemd-error.log

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tradetally
sudo systemctl start tradetally
sudo systemctl status tradetally
```

## Step 6: Configure Nginx

### 6.1 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/tradetally
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Configuration (use certbot for Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend files
    root /opt/tradetally/frontend/dist;
    index index.html;

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # File upload limits
        client_max_body_size 52M;
    }

    # Frontend routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### 6.2 Enable the Site

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tradetally /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 6.3 Set Up SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is set up automatically
```

## Step 7: Run Database Migrations

```bash
cd /opt/tradetally/backend
npm run migrate
```

## Step 8: Set Up Monitoring and Maintenance

### 8.1 Log Rotation

Create logrotate configuration:

```bash
sudo nano /etc/logrotate.d/tradetally
```

```
/opt/tradetally/backend/src/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 8.2 Database Backup Script

Create backup script:

```bash
nano /opt/tradetally/scripts/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/tradetally"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="tradetally"
DB_USER="trader"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U $DB_USER -d $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/db_backup_$DATE.sql

# Remove old backups (keep last 30 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Backup uploaded files
tar -czf $BACKUP_DIR/files_backup_$DATE.tar.gz /opt/tradetally/backend/src/data/

echo "Backup completed: $DATE"
```

Make it executable and add to crontab:

```bash
chmod +x /opt/tradetally/scripts/backup.sh

# Add to crontab (runs daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/tradetally/scripts/backup.sh") | crontab -
```

## Step 9: Verify Migration

### 9.1 Check Services

```bash
# Check backend
curl http://localhost:3000/api/health

# Check PostgreSQL
sudo -u postgres psql -c "\l" | grep tradetally

# Check PM2 status
pm2 status

# Check Nginx
sudo systemctl status nginx
```

### 9.2 Test Application

1. Access your application at https://your-domain.com
2. Log in with existing credentials
3. Verify all trades and data are present
4. Test creating/updating trades
5. Check file uploads work

## Step 10: Clean Up Docker (Optional)

Once you've verified everything is working:

```bash
# Stop Docker containers
docker-compose -f docker-compose.dev.yaml down

# Remove Docker volumes (ONLY after confirming data is migrated!)
docker volume rm tradetally_postgres_data_dev

# Remove Docker images (optional)
docker rmi tradetally-app:latest
```

## Rollback Plan

If issues occur, you can rollback to Docker:

```bash
# Stop native services
pm2 stop all
sudo systemctl stop postgresql

# Restart Docker
docker-compose -f docker-compose.dev.yaml up -d
```

## Performance Tuning

### PostgreSQL Tuning

Edit `/etc/postgresql/15/main/postgresql.conf`:

```conf
# Memory
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB

# Connections
max_connections = 100

# Checkpoint
checkpoint_completion_target = 0.9
wal_buffers = 16MB
```

### Node.js Tuning

In PM2 config, adjust:
- `instances`: Number of CPU cores
- `max_memory_restart`: Based on available RAM
- `node_args`: Heap size configuration

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```bash
   sudo chown -R www-data:www-data /opt/tradetally/backend/src/data
   sudo chown -R www-data:www-data /opt/tradetally/backend/src/logs
   ```

2. **Database Connection Issues**
   - Check PostgreSQL is running: `sudo systemctl status postgresql`
   - Verify credentials in `.env`
   - Check `pg_hba.conf` settings

3. **Port Already in Use**
   ```bash
   # Find process using port 3000
   sudo lsof -i :3000
   # Kill if needed
   sudo kill -9 <PID>
   ```

4. **PM2 Issues**
   ```bash
   pm2 logs tradetally-backend
   pm2 restart tradetally-backend
   ```

## Monitoring Commands

```bash
# View backend logs
pm2 logs tradetally-backend

# Monitor resources
pm2 monit

# Database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'tradetally';"

# Nginx access logs
tail -f /var/log/nginx/access.log
```