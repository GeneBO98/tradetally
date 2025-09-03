# TradeTally - Trading Journal & Analytics Platform - Dominate With Data
## Try the DEMO
Visit [TradeTally](https://tradetally.io)

<img width="1340" alt="SCR-20250703-qdty" src="https://github.com/user-attachments/assets/c7281791-53f6-43c4-937d-ebc9c679f32f" />
<img width="1282" alt="SCR-20250703-qdvz" src="https://github.com/user-attachments/assets/9eadee5c-5b71-4d38-baf9-b335080d4cae" />
<img width="1336" alt="SCR-20250703-qeal" src="https://github.com/user-attachments/assets/6057c9a2-ac33-4aa1-8946-388628e6b8cc" />
<img width="1422" alt="SCR-20250709-mmbi" src="https://github.com/user-attachments/assets/55bb4503-1528-4c35-81ba-e100c6a58d9d" />
<img width="1285" alt="SCR-20250703-qeed" src="https://github.com/user-attachments/assets/801e3b90-d677-48c3-a685-622b6c31f6df" />
<img width="1335" alt="SCR-20250703-qegs" src="https://github.com/user-attachments/assets/d19ff676-dec3-4b72-a14f-a701a38c23ab" />
<img width="1357" alt="SCR-20250703-qeih" src="https://github.com/user-attachments/assets/10439cfa-1f29-4c1a-b5d8-0ed53255b50b" />

## Leaderboards and Achievements!
<img width="1301" height="1051" alt="SCR-20250829-oksw" src="https://github.com/user-attachments/assets/659c6bf8-4624-4cf1-bb27-0ec80a8dadc7" />
<img width="1320" height="924" alt="SCR-20250829-okwl" src="https://github.com/user-attachments/assets/ea2266fe-72ee-4722-99be-f29f3930bdf5" />
<img width="1319" height="1342" alt="SCR-20250829-okyl" src="https://github.com/user-attachments/assets/34ffa301-24a0-409d-8c37-08c11eb2f41d" />



A comprehensive trading journal and analytics platform built with Vue.js frontend and Node.js backend. Track your trades, analyze performance, and gain insights into your trading patterns across multiple brokers.

**Available as:**
- **SaaS Platform**: Fully hosted solution at [tradetally.io](https://tradetally.io) with subscription plans
- **Self-Hosted**: Free, open-source deployment with all Pro features included

**Try the Demo:**
- Username: demo@example.com
- Password: DemoUser25
## Mobile App (Available For Testing)
### Testflight
[Click here for the invitation](https://testflight.apple.com/join/11shUY3t)
## <i class="mdi mdi-rocket-launch"></i> Features

- **Multi-Broker Support**: Import trades from Lightspeed (confirmed), Charles Schwab (confirmed), ThinkorSwim (confirmed), Interactive Brokers, and E*TRADE
   - If you have issues with import or have a broker you want support for, please provide a sample .csv so that I can setup a parser for it. 
- **CUSIP Resolution**: Automatic conversion of CUSIP codes to ticker symbols using Finnhub API and Google Gemini AI
- **Real-time Market Data**: Live stock quotes and unrealized P&L tracking for open positions using Finnhub API
- **Trade Chart Visualization**: Interactive candlestick charts with entry/exit markers using Alpha Vantage API
- **AI-Powered Analytics**: Personalized trading recommendations using Google Gemini AI with sector performance analysis
- **Gamification & Leaderboards**: Track achievements, compete with peers, and level up your trading skills with P&L-based rankings
- **Behavioral Analytics**: Advanced trading psychology analysis including revenge trading detection and overconfidence tracking
- **Sector Performance Analysis**: Industry-based performance breakdown using Finnhub company profiles  
- **Comprehensive Analytics**: Dashboard with P&L tracking, win rates, performance metrics, and hold time analysis
- **Trading Profile Customization**: Configure your strategies, styles, and preferences for personalized AI recommendations
- **Registration Control**: Flexible user registration modes (open, admin approval, or disabled) for self-hosting
- **Trade Management**: Add, edit, and categorize trades with tags and strategies
- **Advanced Charts**: Performance analysis by hold time, day of week, price ranges, volume, and industry sectors
- **File Uploads**: Support for CSV imports with detailed validation and error reporting
- **Responsive Design**: Modern UI built with Vue 3 and Tailwind CSS with enhanced readability
- **Secure Authentication**: JWT-based user authentication and authorization with owner/admin roles

## <i class="mdi mdi-crown"></i> Subscription Tiers & SAAS Features

### Free Tier (Self-Hosted & SaaS)
**Self-Hosted Deployment:**
- **All Pro features included** - No limitations when self-hosting
- Complete access to real-time market data, AI analytics, and advanced features
- Perfect for personal use or small teams

**SaaS Free Tier:**
- Basic trade journaling and analytics
- Limited real-time data access
- Community support
- 14-day Pro trial for new users

### <i class="mdi mdi-star"></i> Pro Plan (SaaS Only - $19.99/month)

#### Advanced Market Data
- **Real-time Stock Quotes**: Live market data with unrealized P&L tracking for open positions
- **Enhanced Chart Data**: High-resolution candlestick charts with 1-minute precision using Finnhub
- **Extended API Limits**: Higher rate limits for real-time data and analysis

#### AI-Powered Analytics
- **Personalized Trading Recommendations**: Advanced AI analysis using chosen LLM
- **News Correlation Analysis**: Analyze how news events impact your trading performance
- **Sector Performance Insights**: Industry-based performance breakdown with actionable insights
- **Trading Psychology Analysis**: Advanced behavioral analytics and pattern recognition

#### Advanced Features
- **Stock Watchlists**: Create and manage custom watchlists with real-time price monitoring
- **Price Alerts**: Set custom price targets with push notifications
- **Advanced Charts**: Multiple chart types with technical indicators
- **Export & Analytics**: Enhanced data export capabilities and advanced reporting

#### Priority Support
- **Email Support**: Direct access to technical support team
- **Feature Requests**: Priority consideration for new feature requests
- **Beta Access**: Early access to new features and improvements

### Deployment Options

#### SaaS Deployment (tradetally.io)
- Fully managed hosting and maintenance
- Automatic updates and backups
- Subscription-based pricing model
- Built-in billing and user management
- Free tier available with Pro plan upgrades

#### Self-Hosted Deployment
- **All Pro features included for free**
- Complete control over your data
- No subscription fees or limitations (some data may require basic plan from Finnhub.io)
- Perfect for privacy-conscious users or teams
- Requires technical setup and maintenance

## <i class="mdi mdi-clipboard-list"></i> Prerequisites

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

## Docker

This image is available at https://hub.docker.com/r/potentialmidas/tradetally

You can read the deployment.md file for more details.


## <i class="mdi mdi-tools"></i> Installation Guide (From Source)

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
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tradetally_db
DB_USER=tradetally_user
DB_PASSWORD=your_secure_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
JWT_EXPIRE=7d

# Registration Control
# Controls who can sign up for the application
# Options: 'open' (default - anyone can sign up), 'approval' (admin must approve), 'disabled' (no signups)
REGISTRATION_MODE=open

# Email Configuration (Optional - for user registration/notifications)
# Leave these empty for self-hosted setups without email verification
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Authentication Configuration
# Set to 'true' for detailed error messages (helpful for self-hosted setups)
# Automatically enabled when email is not configured
DETAILED_AUTH_ERRORS=false

# Frontend URL
FRONTEND_URL=http://localhost:5173

# File Upload (50MB limit for large CSV files)
MAX_FILE_SIZE=52428800

# API Keys (Optional but recommended)
# Finnhub API Key - For real-time stock quotes, CUSIP resolution, and sector analysis
# Get your free API key at: https://finnhub.io/register
FINNHUB_API_KEY=your_finnhub_api_key

# Alpha Vantage API Key - For trade chart visualization
# Get your free API key at: https://www.alphavantage.co/support/#api-key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key

# AI Provider Configuration (Optional - can be configured in Settings page)
# Multiple AI providers supported: Google Gemini, Claude, OpenAI, Ollama, Custom
# Configure your preferred AI provider through the web interface Settings page
```

### Step 6: Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Copy environment configuration (optional)
cp .env.example .env
```

#### Frontend Environment Variables (Optional)

Create a `.env` file in the frontend directory to customize frontend behavior:

```env
# Set to 'false' to hide the donation button
VITE_SHOW_DONATION_BUTTON=true
```

## <i class="mdi mdi-key"></i> API Key Configuration

### Finnhub API (Primary - Recommended)

1. Visit [Finnhub.io](https://finnhub.io/register)
2. Sign up for a free account
3. Generate an API key from your dashboard
4. Add the key to your `.env` file as `FINNHUB_API_KEY`

**Features:**
- **Real-time stock quotes**: Live market data for open position tracking
- **CUSIP to ticker resolution**: Symbol search and identification
- **Rate limiting**: Built-in 30 calls/second rate limiting
- **Free tier**: 60 API calls/minute (sufficient for most use cases)
- **Consolidated API**: Single provider for both quotes and CUSIP resolution

### Alpha Vantage API (For Free Tier Chart Visualization)

1. Visit [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
2. Sign up for a free account
3. Generate an API key from your dashboard
4. Add the key to your `.env` file as `ALPHA_VANTAGE_API_KEY`

**Features:**
- **Interactive candlestick charts**: Visual trade analysis with entry/exit markers for free tier users
- **Historical market data**: Intraday and daily stock price data
- **Trade performance overlay**: Entry/exit indicators with P&L visualization
- **Free tier**: 25 API calls/day, 5 calls/minute (sufficient for basic chart analysis)
- **Smart caching**: Reduces API usage with intelligent data caching
- **Note**: Pro users get exclusive Finnhub access with no Alpha Vantage fallback

### OpenFIGI API (Recommended for CUSIP Resolution)

1. Visit [OpenFIGI](https://www.openfigi.com/)
2. Sign up for a free account (optional but recommended for higher rate limits)
3. Generate an API key from your account dashboard
4. Add the key to your `.env` file as `OPENFIGI_API_KEY`

**Features:**
- **Reliable CUSIP Resolution**: Bloomberg's official CUSIP-to-ticker mapping service
- **High Accuracy**: Industry-standard financial data without AI hallucinations  
- **Free Tier**: 25,000 requests per month without API key, unlimited with free account
- **Real Financial Data**: Actual securities database, not AI guesswork
- **Multiple Asset Types**: Stocks, bonds, options, and other securities

### ⚠️ AI CUSIP Resolution (Advanced Users Only)

AI CUSIP resolution is **disabled by default** due to reliability concerns. Enable only if you understand the limitations:

#### **Limitations & Warnings:**
- **❌ Unreliable Results**: AI models frequently return incorrect or duplicate ticker mappings
- **❌ Self-Hosted AI Issues**: Local models (Ollama, etc.) cannot access real financial databases
- **❌ Hallucination Risk**: AI may guess popular symbols (JPM, AAPL, MSFT) for unknown CUSIPs
- **❌ Data Integrity**: Incorrect mappings can corrupt your trade data permanently

#### **When AI CUSIP Resolution Might Work:**
- ✅ **Cloud-based AI only**: OpenAI, Google Gemini, Anthropic Claude (never self-hosted)
- ✅ **Manual verification**: You manually verify every AI-resolved CUSIP
- ✅ **Test environment**: You're testing and can afford incorrect data

#### **To Enable AI CUSIP Resolution:**
```env
# Only enable if you understand the risks and will verify results manually
ENABLE_AI_CUSIP_RESOLUTION=true
```

#### **Recommended Alternative:**
Instead of AI CUSIP resolution, use:
1. **OpenFIGI API** (reliable, free, industry standard)
2. **Manual mapping** through the import interface
3. **Broker-specific import formats** that include ticker symbols

### AI Provider Configuration (Optional - Settings Page)

AI features including personalized trading recommendations and sector analysis can be configured through the web interface:

1. **Navigate to Settings**: Go to the Settings page in TradeTally
2. **AI Provider Settings**: Configure your preferred AI provider
3. **Supported Providers**: Google Gemini, Anthropic Claude, OpenAI, Ollama, or Custom API
4. **No Manual Setup Required**: All configuration handled through the web interface

**AI Features Available:**
- **AI-powered trading recommendations**: Personalized analysis based on your trading profile and performance  
- **Sector performance analysis**: Industry-specific insights and recommendations
- **Trading pattern analysis**: AI identifies strengths, weaknesses, and improvement opportunities
- **CUSIP resolution backup**: AI-powered symbol resolution when Finnhub cannot resolve a CUSIP
- **Multiple Provider Support**: Choose from various AI providers or use your own custom API

### CUSIP Resolution & Market Data Priority

The system uses the following priority:

**For Real-time Quotes:**
1. **Finnhub API**: Primary source for live market data
2. **Cache**: Previously fetched quotes (1-minute cache)
3. **Fallback**: Display without real-time data if API unavailable

**For Chart Data:**
1. **Pro Users**: Finnhub Stock Candles API exclusively (150 calls/min, 1-minute precision)
2. **Free Users**: Alpha Vantage API (25 calls/day, limited precision)
3. **Cache**: Previously fetched chart data with intelligent caching

**For CUSIP Resolution:**
1. **Cache**: Previously resolved mappings (fastest)
2. **Finnhub**: Symbol search API (primary)
3. **OpenFIGI**: Bloomberg's free CUSIP-to-ticker API (reliable fallback)
4. **AI Fallback**: Optional, disabled by default (see AI CUSIP Resolution section below)
5. **Manual Entry**: User can manually add mappings through import interface

## <i class="mdi mdi-play"></i> Running the Application

### Development Mode

#### Start Backend Server

```bash
# In the backend directory
cd backend
npm run dev

# Server will start on http://localhost:3000
# API endpoints available at http://localhost:3000/api
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
NODE_ENV=production PORT=3000 npm start
```

## <i class="mdi mdi-chart-bar"></i> Supported Broker Formats

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

## <i class="mdi mdi-cellphone"></i> Push Notification Setup (iOS)

TradeTally supports real-time push notifications for price alerts and trade executions on iOS devices. This section is optional but recommended for mobile users.

### Prerequisites

- **Apple Developer Account** ($99/year) - Required for push notifications
- **Mobile app** - TradeTally iOS app installed on devices
- **Device tokens** - Users must register their devices through the mobile app

### Apple Push Notification Service (APNS) Setup

#### 1. Generate APNs Authentication Key

1. **Login to Apple Developer Portal**:
   - Go to [developer.apple.com](https://developer.apple.com)
   - Sign in with your Apple Developer account

2. **Create Push Notification Key**:
   - Navigate to **Certificates, Identifiers & Profiles**
   - Go to **Keys** section
   - Click **+** to create a new key
   - Name it "TradeTally Push Notifications"
   - Check **Apple Push Notifications service (APNs)**
   - Click **Continue** → **Register**

3. **Download Key File**:
   - Download the `.p8` file (e.g., `AuthKey_ABC123DEFG.p8`)
   - **Important**: Store this file securely - it cannot be re-downloaded
   - Note the **Key ID** (10-character string like `ABC123DEFG`)

4. **Get Team ID**:
   - In Apple Developer account, go to **Account** → **Membership**
   - Copy your **Team ID** (10-character string like `1234567890`)

#### 2. Configure Environment Variables

Add the following to your `.env` file:

```env
# Enable push notifications
ENABLE_PUSH_NOTIFICATIONS=true

# Apple Push Notification Service
APNS_KEY_ID=ABC123DEFG          # From step 3 above
APNS_TEAM_ID=1234567890         # From step 4 above
APNS_KEY_PATH=/path/to/keys/AuthKey_ABC123DEFG.p8
```

#### 3. Secure Key File Storage

**For Development:**
```bash
# Create secure directory
mkdir -p /path/to/tradetally/backend/keys
chmod 700 /path/to/tradetally/backend/keys

# Copy your .p8 file
cp ~/Downloads/AuthKey_ABC123DEFG.p8 /path/to/tradetally/backend/keys/
chmod 600 /path/to/tradetally/backend/keys/AuthKey_ABC123DEFG.p8
```

**For Production:**
```bash
# System-wide secure location
sudo mkdir -p /etc/tradetally/keys
sudo cp AuthKey_ABC123DEFG.p8 /etc/tradetally/keys/
sudo chmod 600 /etc/tradetally/keys/AuthKey_ABC123DEFG.p8
sudo chown tradetally:tradetally /etc/tradetally/keys/AuthKey_ABC123DEFG.p8

# Update .env to point to production location
APNS_KEY_PATH=/etc/tradetally/keys/AuthKey_ABC123DEFG.p8
```

#### 4. Security Best Practices

- **Never commit `.p8` files** to version control
- Add `*.p8` and `keys/` to your `.gitignore`
- Use environment variables for all sensitive data
- Restrict file permissions (600) on the key file
- Store keys outside web-accessible directories

#### 5. Testing Push Notifications

Use the test endpoint to verify setup:

```bash
# Test push notification (requires device token registration)
curl -X POST "http://localhost:3000/api/notifications/test-push" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Test notification from TradeTally"}'
```

### Features Enabled by Push Notifications

- **Price Alerts**: Instant notifications when price targets are hit
- **Trade Execution**: Notifications for successful trades
- **Portfolio Updates**: Real-time updates on position changes
- **Market Events**: Important market news and earnings announcements

### Troubleshooting

**Common Issues:**

1. **"APNS configuration incomplete"**: Verify all environment variables are set correctly
2. **"No active devices"**: Users must register device tokens through the mobile app
3. **"Push notification failed"**: Check APNS key file permissions and path
4. **"BadDeviceToken"**: Device tokens are automatically marked inactive and cleaned up

**Debug Logs:**
```bash
# Check backend logs for push notification status
tail -f backend.log | grep -i "push\|apns"
```

### Android Support (Future)

Android push notifications via Firebase Cloud Messaging (FCM) will be added in a future release. The infrastructure is prepared with the `FCM_SERVER_KEY` environment variable.

## <i class="mdi mdi-server"></i> Production Deployment

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
      PORT: 3000
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
        proxy_pass http://localhost:3000;
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

## <i class="mdi mdi-cog"></i> Configuration Options

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Backend server port | `3000` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | No |
| `DB_NAME` | Database name | - | Yes |
| `DB_USER` | Database user | - | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `JWT_EXPIRE` | JWT expiration time | `7d` | No |
| `EMAIL_HOST` | SMTP host | - | No* |
| `EMAIL_PORT` | SMTP port | `587` | No |
| `EMAIL_USER` | SMTP username | - | No* |
| `EMAIL_PASS` | SMTP password | - | No* |
| `DETAILED_AUTH_ERRORS` | Show specific auth errors | `false` | No |
| `FRONTEND_URL` | Frontend URL | `http://localhost:5173` | No |
| `MAX_FILE_SIZE` | Max upload size (bytes) | `52428800` (50MB) | No |
| `REGISTRATION_MODE` | Registration control | `open` | No |
| `FINNHUB_API_KEY` | Finnhub API key for quotes/CUSIP/sectors | - | No |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key for charts | - | No |
| `OPENFIGI_API_KEY` | OpenFIGI API key for reliable CUSIP resolution | - | No |
| `ENABLE_AI_CUSIP_RESOLUTION` | Enable AI CUSIP fallback (unreliable, disabled by default) | `false` | No |
| `ENABLE_PUSH_NOTIFICATIONS` | Enable mobile push notifications | `false` | No |
| `APNS_KEY_ID` | Apple Push Notification Key ID | - | No** |
| `APNS_TEAM_ID` | Apple Developer Team ID | - | No** |
| `APNS_KEY_PATH` | Path to Apple .p8 certificate file | - | No** |
| `FCM_SERVER_KEY` | Firebase Cloud Messaging server key | - | No** |

**Self-Hosted Configuration Notes:**
- Email settings marked with * are optional for self-hosted setups
- Push notification settings marked with ** are only required if enabling mobile push notifications
- **AI Provider Configuration**: All AI providers (Google Gemini, Claude, OpenAI, Ollama) are configured through the Settings page - no environment variables needed
- **AI CUSIP Resolution**: Disabled by default due to reliability issues. Only enable with cloud-based AI services and manual verification
- If email is not configured, users are automatically verified and can sign in immediately
- This makes TradeTally self-host friendly without requiring email setup
- Email verification will be enabled automatically if all email settings are provided
- `DETAILED_AUTH_ERRORS` automatically enables for self-hosted setups to show specific login error messages

## <i class="mdi mdi-chart-line"></i> Usage Guide

### Self-Hosted Setup (No Email Required)

For personal or small team use without email setup:

1. **Skip Email Configuration**: Leave `EMAIL_HOST`, `EMAIL_USER`, and `EMAIL_PASS` empty in your `.env` file
2. **Register Your Account**: Users will be automatically verified and can sign in immediately
3. **First User Becomes Admin**: The first registered user automatically gets admin privileges
4. **Ready to Use**: No email verification steps required

### Production Setup (With Email)

For larger deployments with email verification:

1. **Configure Email Settings**: Set all email variables in your `.env` file
2. **Email Verification**: New users must verify their email before signing in
3. **Enhanced Security**: Email-based password resets and notifications available

### Registration Control

TradeTally includes flexible registration control for different deployment scenarios:

#### Registration Modes

**Open Registration (Default)**
```env
REGISTRATION_MODE=open
```
- Anyone can sign up and immediately access the application
- Best for personal use or open communities
- No admin intervention required

**Admin Approval Required**
```env
REGISTRATION_MODE=approval
```
- Users can register but need admin approval before accessing the application
- Admins receive notifications of pending registrations
- Best for controlled access environments

**Registration Disabled**
```env
REGISTRATION_MODE=disabled
```
- No new registrations allowed
- Signup forms and buttons are hidden from the interface
- Best for closed systems or temporary registration freezes

#### Managing User Approvals

When `REGISTRATION_MODE=approval`, admins can approve pending users:

```bash
cd backend
node scripts/approve-user.js user@example.com
```

### First Run

1. **Create Admin Account**:
   - Navigate to `http://localhost:5173`
   - Click "Sign Up" and create your account (if registration is enabled)
   - Verify your email if email is configured (automatic if not configured)
   - First user automatically becomes admin

2. **Configure Trading Profile** (Optional but recommended):
   - Go to "Settings" → "Trading Profile"
   - Select your trading strategies (breakouts, momentum, scalping, etc.)
   - Choose your trading styles (day trading, swing trading, etc.)
   - Set your risk tolerance and experience level
   - Configure preferred sectors and markets
   - This enables personalized AI recommendations

3. **Import Your First Trades**:
   - Go to "Import" tab
   - Select your broker format
   - Upload your CSV file
   - Review and confirm the import

4. **View Analytics**:
   - Navigate to "Dashboard" for overview with real-time open positions
   - Visit "Analytics" for detailed metrics including:
     - Performance by hold time (< 1 min to 1+ months)
     - Performance by day of week
     - Performance by price ranges and volume
     - **Sector performance analysis** (automatically populated after import)
   - Use date range filters to analyze specific periods
   - Click "AI Recommendations" for personalized trading insights

### CUSIP Resolution

If your broker uses CUSIP codes instead of ticker symbols:

1. **During Import**: System automatically attempts to resolve CUSIPs
2. **Manual Resolution**: Go to Import tab → "Resolve Unresolved CUSIPs"
3. **Add Mappings**: Add custom CUSIP-to-ticker mappings in the import interface
4. **Delete Mappings**: Remove incorrect mappings if needed

### Admin Management

TradeTally includes a role-based admin system for site management:

#### Creating Admin Users

**First User Auto-Admin:**
The first user to register on a fresh TradeTally installation is automatically granted admin privileges. This ensures you always have an admin account to manage the system.

**Manual Admin Promotion:**
To promote additional users to admin status:

```bash
cd backend
node scripts/make-admin.js user@example.com
```

This will:
- Update the user's role to 'admin' in the database
- Show confirmation with user details
- Exit with an error if the user is not found

#### Admin Permissions

Admin users have the following additional capabilities:

**Trade Management:**
- Can delete any public trade (not just their own)
- Regular users can only delete their own trades
- Admin actions are properly logged and audited

**Security Features:**
- All admin permissions are validated server-side
- JWT tokens include user role for frontend permission checks
- Database constraints ensure only valid roles ('user' or 'admin')

**Visual Indicators:**
- Trash/delete icons appear next to public trades for authorized users
- Clear permission-based UI elements

#### Future Admin Features

The admin role system is designed to be extensible and can include:
- User management and moderation
- Site-wide settings configuration
- Advanced analytics and reporting
- Content moderation tools

#### Admin Security Notes

- Admin permissions are always checked server-side in middleware
- Role changes require direct database access (cannot be done through UI)
- All admin actions maintain full audit trails
- Regular users cannot elevate their own permissions

## <i class="mdi mdi-bug"></i> Troubleshooting

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
1. Check if `FINNHUB_API_KEY` is correctly set in backend `.env`
2. Verify internet connectivity
3. Check console logs for error messages
4. Ensure API key is in backend `.env`, not frontend
5. Try manual CUSIP mapping as fallback

#### Real-time Quotes Not Working
1. Ensure `FINNHUB_API_KEY` is set in backend `.env` file
2. Check that backend server is running on correct port (3000)
3. Verify frontend is proxying to correct backend port
4. Check browser console for API errors
5. Confirm ticker symbols are valid (not CUSIPs)

#### Email Verification Issues
**For Self-Hosted Setups (No Email Required):**
1. Leave `EMAIL_HOST`, `EMAIL_USER`, and `EMAIL_PASS` empty in `.env`
2. Users will be automatically verified and can sign in immediately
3. No email setup required - perfect for personal use

**For Production Setups (With Email):**
1. Ensure all email settings are configured in `.env`
2. Test email connectivity with your SMTP provider
3. Check firewall settings for SMTP port (usually 587 or 465)
4. For Gmail, use App Passwords instead of regular passwords

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

## <i class="mdi mdi-shield-lock"></i> Security Considerations

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

## <i class="mdi mdi-file-document"></i> License

This project is open source software.

## <i class="mdi mdi-help"></i> Support

For technical support or questions:

1. Check this README for common setup issues
2. Review the troubleshooting section
3. Check application logs for error messages
4. Ensure all prerequisites are properly installed

## <i class="mdi mdi-update"></i> Updates

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

## <i class="mdi mdi-trophy"></i> Gamification & Leaderboards

TradeTally includes a comprehensive gamification system to make trading analysis more engaging and competitive.

### Leaderboard Features

**P&L-Based Rankings**:
- **All-Time P&L Rankings**: Total profit/loss across all trades
- **Monthly P&L Rankings**: Profit/loss for the current active trading month
- **Weekly P&L Rankings**: Profit/loss for the current active trading week
- **Best Single Trade**: Highest profit from a single trade
- **Largest Loss**: Worst single trade by absolute loss
- **Most Consistent Trader**: Based on volume traded and average P&L consistency

**Privacy & Anonymity**:
- All leaderboards use anonymous usernames for privacy
- Real usernames are never displayed publicly
- Generated names maintain consistency per user

**View Options**:
- Overview with top 5 rankings per category
- "View All" functionality for complete leaderboard data
- Overall rank calculated as average across all categories
- Real-time updates with proper loading states

### Achievement System

**Progress Tracking**:
- XP-based achievement system with sortable progress
- Check for new achievements with toast notifications
- Achievements organized by XP gain (lowest to highest)
- Visual progress indicators and completion status

**Achievement Categories**:
- Trading milestones and profit targets
- Volume and consistency achievements
- Time-based trading streaks
- Portfolio performance benchmarks

### Behavioral Analytics

**Trading Psychology Analysis**:
- Revenge trading detection and alerts
- Overconfidence pattern identification
- Emotional trading indicators
- Risk management behavior tracking

**Performance Insights**:
- User-configurable statistics (average vs median)
- Dynamic calculation preferences with persistent settings
- Real-time metric updates based on preference
- Enhanced analytics with behavioral overlays

### Configuration

Control gamification features with environment variables:

```env
# Enable/disable all gamification features
ENABLE_GAMIFICATION=true

# Debug mode for development
DEBUG=false
```

**Migration Notes:**
- **SAAS Features**: Self-hosted deployments automatically get all Pro features for free
- Update your `.env` to include `REGISTRATION_MODE=open` for new registration control  
- Update your `.env` to include `ENABLE_GAMIFICATION=true` for leaderboard features
- Configure AI providers through Settings page for AI recommendations
- **CUSIP Resolution**: OpenFIGI API recommended for reliable CUSIP-to-ticker mapping
- **AI CUSIP Resolution**: Disabled by default - only enable with cloud AI services and manual verification
- Ensure `FINNHUB_API_KEY` is set for sector analysis and Pro chart features
- **No Billing Setup Required**: Self-hosted deployments work without any billing configuration
- Run database migrations for latest features:
  ```bash
  cd backend
  psql -U your_user -d your_db -f migrations/043_add_statistics_calculation_preference.sql
  psql -U your_user -d your_db -f migrations/044_update_leaderboards_to_pnl_based.sql
  psql -U your_user -d your_db -f migrations/045_add_admin_approved_column.sql
  psql -U your_user -d your_db -f migrations/046_add_trading_profile_fields.sql
  ```
- Restart both frontend and backend after update

---

**Note**: This README provides comprehensive setup instructions for TradeTally. Follow each section carefully and ensure all prerequisites are met before proceeding to the next step. For production deployments, pay special attention to the security and monitoring sections.

Feel free to [throw me a couple of bucks](https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD) if you got some use out of this.
