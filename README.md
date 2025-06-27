# TradeTally - Trading Journal & Analytics Platform
## Try the DEMO
Visit [TradeTally](https://tradetally.io)

A comprehensive trading journal and analytics platform built with Vue.js frontend and Node.js backend. Track your trades, analyze performance, and gain insights into your trading patterns across multiple brokers.

Login with:

Username: demo@example.com
Password: DemoUser25

## 🚀 Features

- **Multi-Broker Support**: Import trades from Lightspeed, Charles Schwab, ThinkorSwim, Interactive Brokers, and E*TRADE
- **CUSIP Resolution**: Automatic conversion of CUSIP codes to ticker symbols using OpenFIGI and Google Gemini AI
- **Real-time Analytics**: Dashboard with P&L tracking, win rates, and performance metrics
- **Trade Management**: Add, edit, and categorize trades with tags and strategies
- **File Uploads**: Support for CSV imports with detailed validation and error reporting
- **Responsive Design**: Modern UI built with Vue 3 and Tailwind CSS
- **Secure Authentication**: JWT-based user authentication and authorization

## 📋 Prerequisites

Before setting up TradeTally, ensure you have the following installed:

### Required Software

1. **Node.js** (v14.0.0 or higher)
2. **npm** (comes with Node.js)
3. **PostgreSQL** (v12 or higher)
4. **Git** (for cloning the repository)

### Operating System Support

- macOS (10.15+)
- Windows (10+)
- Linux (Ubuntu 18.04+, CentOS 7+)

## 🛠️ Installation Guide

### Step 1: Install Node.js and npm

#### On macOS (using Homebrew):
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and npm
brew install node
```

#### On Windows:
1. Download Node.js from [nodejs.org](https://nodejs.org/)
2. Run the installer and follow the setup wizard
3. Verify installation:
```cmd
node --version
npm --version
```

#### On Ubuntu/Debian:
```bash
# Update package index
sudo apt update

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 2: Install PostgreSQL

#### On macOS (using Homebrew):
```bash
# Install PostgreSQL
brew install postgresql

# Start PostgreSQL service
brew services start postgresql

# Create a database user (optional)
createuser --interactive
```

#### On Windows:
1. Download PostgreSQL from [postgresql.org](https://www.postgresql.org/download/windows/)
2. Run the installer and follow the setup wizard
3. Remember the password you set for the postgres user

#### On Ubuntu/Debian:
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Switch to postgres user and create a database user
sudo -u postgres createuser --interactive
```

### Step 3: Clone the Repository

```bash
# Clone the repository
git clone <repository-url>
cd trader-vue

# Repository structure should look like:
# trader-vue/
# ├── backend/
# ├── frontend/
# └── README.md
```

### Step 4: Database Setup

#### Create Database and User

```sql
-- Connect to PostgreSQL as superuser
sudo -u postgres psql

-- Create database
CREATE DATABASE tradetally_db;

-- Create user with password
CREATE USER tradetally_user WITH PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE tradetally_db TO tradetally_user;

-- Exit PostgreSQL
\q
```

#### Run Database Schema

```bash
# Navigate to backend directory
cd backend

# Connect to your database and run the schema
psql -h localhost -U tradetally_user -d tradetally_db -f src/utils/schema.sql
```

### Step 5: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env file with your configuration
nano .env
```

#### Configure Environment Variables

Edit the `.env` file with your specific values:

```env
NODE_ENV=development
PORT=5001

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tradetally_db
DB_USER=tradetally_user
DB_PASSWORD=your_secure_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
JWT_EXPIRE=7d

# Email Configuration (for user registration/notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Frontend URL
FRONTEND_URL=http://localhost:5173

# File Upload (50MB limit for large CSV files)
MAX_FILE_SIZE=52428800

# API Keys (Optional but recommended)
GEMINI_API_KEY=your_gemini_api_key
OPENFIGI_API_KEY=your_openfigi_api_key
```

### Step 6: Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install
```

## 🔑 API Key Configuration

### Google Gemini API (Recommended)

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Add the key to your `.env` file as `GEMINI_API_KEY`

**Features:**
- AI-powered CUSIP to ticker symbol resolution
- High accuracy for modern securities
- Free tier available with generous limits

### OpenFIGI API (Alternative/Backup)

1. Visit [OpenFIGI API](https://www.openfigi.com/api)
2. Sign up for a free account
3. Generate an API key
4. Add the key to your `.env` file as `OPENFIGI_API_KEY`

**Features:**
- Professional-grade financial identifier resolution
- Extensive database of securities
- Free tier: 100 requests per minute

### CUSIP Resolution Priority

The system uses the following priority for CUSIP lookups:

1. **Cache**: Previously resolved mappings (fastest)
2. **OpenFIGI**: If API key is provided (most reliable)
3. **Google Gemini**: AI-powered resolution (fallback)
4. **Manual Entry**: User can manually add mappings

## 🚀 Running the Application

### Development Mode

#### Start Backend Server

```bash
# In the backend directory
cd backend
npm run dev

# Server will start on http://localhost:5001
# API endpoints available at http://localhost:5001/api
```

#### Start Frontend Development Server

```bash
# In a new terminal, navigate to frontend directory
cd frontend
npm run dev

# Frontend will start on http://localhost:5173
```

### Production Mode

#### Build Frontend

```bash
cd frontend
npm run build
```

#### Start Backend in Production

```bash
cd backend
NODE_ENV=production npm start
```

## 📊 Supported Broker Formats

### Lightspeed Trader
- **Format**: CSV with transaction details
- **Features**: Full FIFO trade matching, commission tracking
- **Required Columns**: Symbol, Trade Date, Execution Time, Price, Qty, Side, Commission Amount

### Charles Schwab
- **Format**: CSV with completed trade data
- **Features**: Uses Schwab's calculated P&L, wash sale detection
- **Required Columns**: Symbol, Opened Date, Closed Date, Quantity, Cost Per Share, Proceeds Per Share, Gain/Loss ($)

### ThinkorSwim (TD Ameritrade)
- **Format**: Standard CSV export
- **Required Columns**: Symbol, Exec Time, Price, Qty, Side, Commission

### Interactive Brokers (IBKR)
- **Format**: Activity Statement CSV
- **Required Columns**: Symbol, DateTime, Price, Quantity, Commission

### E*TRADE
- **Format**: Transaction history CSV
- **Required Columns**: Symbol, Transaction Date, Price, Quantity, Transaction Type, Commission

## 🏗️ Production Deployment

### Environment Setup

1. **Server Requirements**:
   - Ubuntu 20.04+ or CentOS 8+
   - 2+ CPU cores
   - 4GB+ RAM
   - 20GB+ disk space

2. **Install Dependencies**:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install Nginx (for reverse proxy)
sudo apt install nginx

# Install PM2 (process manager)
sudo npm install -g pm2
```

### Database Configuration

```bash
# Create production database
sudo -u postgres createdb tradetally_prod
sudo -u postgres createuser --pwprompt tradetally_prod_user

# Run schema
psql -h localhost -U tradetally_prod_user -d tradetally_prod -f backend/src/utils/schema.sql
```

### Application Deployment

```bash
# Clone repository
git clone <repository-url> /var/www/tradetally
cd /var/www/tradetally

# Build frontend
cd frontend
npm install
npm run build

# Setup backend
cd ../backend
npm install --production

# Create production environment file
cp .env.example .env.production
# Edit with production values
```

### PM2 Process Management

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'tradetally-backend',
    script: 'src/server.js',
    cwd: '/var/www/tradetally/backend',
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    instances: 2,
    exec_mode: 'cluster',
    error_file: '/var/log/tradetally/error.log',
    out_file: '/var/log/tradetally/access.log',
    log_file: '/var/log/tradetally/combined.log'
  }]
};
```

Start the application:

```bash
# Create log directory
sudo mkdir -p /var/log/tradetally
sudo chown $USER:$USER /var/log/tradetally

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Nginx Configuration

Create `/etc/nginx/sites-available/tradetally`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend (serve built Vue.js app)
    location / {
        root /var/www/tradetally/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # File upload size limit
    client_max_body_size 50M;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/tradetally /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL Certificate (Production)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Monitoring & Logs

```bash
# View application logs
pm2 logs tradetally-backend

# Monitor application
pm2 monit

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Database logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

## 🔧 Configuration Options

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Backend server port | `5001` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | No |
| `DB_NAME` | Database name | - | Yes |
| `DB_USER` | Database user | - | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `JWT_EXPIRE` | JWT expiration time | `7d` | No |
| `EMAIL_HOST` | SMTP host | - | Yes |
| `EMAIL_PORT` | SMTP port | `587` | No |
| `EMAIL_USER` | SMTP username | - | Yes |
| `EMAIL_PASS` | SMTP password | - | Yes |
| `FRONTEND_URL` | Frontend URL | `http://localhost:5173` | No |
| `MAX_FILE_SIZE` | Max upload size (bytes) | `52428800` (50MB) | No |
| `GEMINI_API_KEY` | Google Gemini API key | - | No |
| `OPENFIGI_API_KEY` | OpenFIGI API key | - | No |

## 📈 Usage Guide

### First Run

1. **Create Admin Account**:
   - Navigate to `http://localhost:5173`
   - Click "Sign Up" and create your account
   - Verify your email if email is configured

2. **Import Your First Trades**:
   - Go to "Import" tab
   - Select your broker format
   - Upload your CSV file
   - Review and confirm the import

3. **View Analytics**:
   - Navigate to "Dashboard" for overview
   - Visit "Analytics" for detailed metrics
   - Use date range filters to analyze specific periods

### CUSIP Resolution

If your broker uses CUSIP codes instead of ticker symbols:

1. **During Import**: System automatically attempts to resolve CUSIPs
2. **Manual Resolution**: Go to Import tab → "Resolve Unresolved CUSIPs"
3. **Add Mappings**: Add custom CUSIP-to-ticker mappings in the import interface
4. **Delete Mappings**: Remove incorrect mappings if needed

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Error
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -h localhost -U tradetally_user -d tradetally_db -c "SELECT 1;"
```

#### Port Already in Use
```bash
# Find process using port 5001
lsof -i :5001

# Kill the process
kill -9 <PID>
```

#### NPM Installation Fails
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### CUSIP Resolution Not Working
1. Check if API keys are correctly set in `.env`
2. Verify internet connectivity
3. Check console logs for error messages
4. Try manual CUSIP mapping as fallback

### Performance Optimization

#### Database Optimization
```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM trades WHERE user_id = 'user-id';

-- Update statistics
ANALYZE;

-- Reindex if needed
REINDEX TABLE trades;
```

#### Backend Optimization
- Enable gzip compression in Nginx
- Use Redis for session storage (optional)
- Implement database connection pooling
- Monitor memory usage with `pm2 monit`

## 🔒 Security Considerations

### Production Security

1. **Environment Variables**: Never commit `.env` files to version control
2. **Database**: Use strong passwords and limit database user permissions
3. **JWT Secret**: Use a cryptographically secure random string (32+ characters)
4. **HTTPS**: Always use SSL certificates in production
5. **File Uploads**: Validate file types and implement virus scanning
6. **Rate Limiting**: Configure appropriate API rate limits
7. **Regular Updates**: Keep dependencies updated for security patches

### Backup Strategy

```bash
# Database backup
pg_dump -h localhost -U tradetally_user tradetally_db > backup_$(date +%Y%m%d).sql

# Restore database
psql -h localhost -U tradetally_user tradetally_db < backup_20240101.sql

# Backup CUSIP cache
cp backend/src/data/cusip_cache.json cusip_cache_backup_$(date +%Y%m%d).json
```

## 📝 License

This project is open source software.

## 🤝 Support

For technical support or questions:

1. Check this README for common setup issues
2. Review the troubleshooting section
3. Check application logs for error messages
4. Ensure all prerequisites are properly installed

## 🔄 Updates

To update TradeTally to the latest version:

```bash
# Pull latest changes
git pull origin main

# Update backend dependencies
cd backend
npm install

# Update frontend dependencies
cd ../frontend
npm install

# Rebuild frontend
npm run build

# Restart backend (if using PM2)
pm2 restart tradetally-backend
```

---

**Note**: This README provides comprehensive setup instructions for TradeTally. Follow each section carefully and ensure all prerequisites are met before proceeding to the next step. For production deployments, pay special attention to the security and monitoring sections.

Feel free to [throw me a couple of bucks](https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD) if you got some use out of this.