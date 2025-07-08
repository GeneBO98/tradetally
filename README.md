# TradeTally - Trading Journal & Analytics Platform - Dominate With Data
## Try the DEMO
Visit [TradeTally](https://tradetally.io)

<img width="1340" alt="SCR-20250703-qdty" src="https://github.com/user-attachments/assets/c7281791-53f6-43c4-937d-ebc9c679f32f" />
<img width="1282" alt="SCR-20250703-qdvz" src="https://github.com/user-attachments/assets/9eadee5c-5b71-4d38-baf9-b335080d4cae" />
<img width="1336" alt="SCR-20250703-qeal" src="https://github.com/user-attachments/assets/6057c9a2-ac33-4aa1-8946-388628e6b8cc" />
<img width="1416" alt="SCR-20250703-qech" src="https://github.com/user-attachments/assets/d7e35549-46ef-4e6a-b878-e47fd1ae08ba" />
<img width="1285" alt="SCR-20250703-qeed" src="https://github.com/user-attachments/assets/801e3b90-d677-48c3-a685-622b6c31f6df" />
<img width="1335" alt="SCR-20250703-qegs" src="https://github.com/user-attachments/assets/d19ff676-dec3-4b72-a14f-a701a38c23ab" />
<img width="1357" alt="SCR-20250703-qeih" src="https://github.com/user-attachments/assets/10439cfa-1f29-4c1a-b5d8-0ed53255b50b" />

A comprehensive trading journal and analytics platform built with Vue.js frontend and Node.js backend. Track your trades, analyze performance, and gain insights into your trading patterns across multiple brokers.

Login with:

Username: demo@example.com
Password: DemoUser25
## Mobile App (Available For Testing)
### Testflight
[Click here for the invitation](https://testflight.apple.com/join/11shUY3t)
## 🚀 Features

- **Multi-Broker Support**: Import trades from Lightspeed (confirmed), Charles Schwab (confirmed), ThinkorSwim (confirmed), Interactive Brokers, and E*TRADE
   - If you have issues with import or have a broker you want support for, please provide a sample .csv so that I can setup a parser for it. 
- **CUSIP Resolution**: Automatic conversion of CUSIP codes to ticker symbols using Finnhub API and Google Gemini AI
- **Real-time Market Data**: Live stock quotes and unrealized P&L tracking for open positions using Finnhub API
- **Trade Chart Visualization**: Interactive candlestick charts with entry/exit markers using Alpha Vantage API
- **AI-Powered Analytics**: Personalized trading recommendations using Google Gemini AI with sector performance analysis
- **Sector Performance Analysis**: Industry-based performance breakdown using Finnhub company profiles
- **Comprehensive Analytics**: Dashboard with P&L tracking, win rates, performance metrics, and hold time analysis
- **Trading Profile Customization**: Configure your strategies, styles, and preferences for personalized AI recommendations
- **Registration Control**: Flexible user registration modes (open, admin approval, or disabled) for self-hosting
- **Trade Management**: Add, edit, and categorize trades with tags and strategies
- **Advanced Charts**: Performance analysis by hold time, day of week, price ranges, volume, and industry sectors
- **File Uploads**: Support for CSV imports with detailed validation and error reporting
- **Responsive Design**: Modern UI built with Vue 3 and Tailwind CSS with enhanced readability
- **Secure Authentication**: JWT-based user authentication and authorization with owner/admin roles

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

## Docker

This image is available at https://hub.docker.com/r/potentialmidas/tradetally

You can read the deployment.md file for more details.


## 🛠️ Installation Guide (From Source)

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

# Google Gemini API Key - For AI-powered trading recommendations and CUSIP resolution
# Get your free API key at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key
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

## 🔑 API Key Configuration

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

### Alpha Vantage API (For Trade Chart Visualization)

1. Visit [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
2. Sign up for a free account
3. Generate an API key from your dashboard
4. Add the key to your `.env` file as `ALPHA_VANTAGE_API_KEY`

**Features:**
- **Interactive candlestick charts**: Visual trade analysis with entry/exit markers
- **Historical market data**: Intraday and daily stock price data
- **Trade performance overlay**: Entry/exit indicators with P&L visualization
- **Free tier**: 25 API calls/day, 5 calls/minute (sufficient for chart analysis)
- **Smart caching**: Reduces API usage with intelligent data caching

### Google Gemini API (AI Recommendations & CUSIP Resolution)

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Add the key to your `.env` file as `GEMINI_API_KEY`

**Features:**
- **AI-powered trading recommendations**: Personalized analysis based on your trading profile and performance
- **Sector performance analysis**: Industry-specific insights and recommendations
- **Trading pattern analysis**: AI identifies strengths, weaknesses, and improvement opportunities
- **CUSIP resolution backup**: AI-powered symbol resolution when Finnhub cannot resolve a CUSIP
- **Free tier available**: Generous limits for AI analysis and recommendations
- **Personalized insights**: Compares your trading performance vs stated preferences

### CUSIP Resolution & Market Data Priority

The system uses the following priority:

**For Real-time Quotes:**
1. **Finnhub API**: Primary source for live market data
2. **Cache**: Previously fetched quotes (1-minute cache)
3. **Fallback**: Display without real-time data if API unavailable

**For CUSIP Resolution:**
1. **Cache**: Previously resolved mappings (fastest)
2. **Finnhub**: Symbol search API (primary)
3. **Google Gemini**: AI-powered resolution (fallback)
4. **Manual Entry**: User can manually add mappings

## 🚀 Running the Application

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

## 🔧 Configuration Options

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
| `GEMINI_API_KEY` | Google Gemini API key for AI recommendations | - | No |

**Self-Hosted Configuration Notes:**
- Email settings marked with * are optional for self-hosted setups
- If email is not configured, users are automatically verified and can sign in immediately
- This makes TradeTally self-host friendly without requiring email setup
- Email verification will be enabled automatically if all email settings are provided
- `DETAILED_AUTH_ERRORS` automatically enables for self-hosted setups to show specific login error messages

## 📈 Usage Guide

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

### Recent Updates

**v2.3.0 - AI-Powered Analytics & Sector Analysis**
- **AI Trading Recommendations**: Personalized trading insights using Google Gemini AI
- **Sector Performance Analysis**: Industry-based performance breakdown with Finnhub company profiles
- **Trading Profile Customization**: Configure your strategies, styles, and preferences for personalized AI
- **Registration Control System**: Flexible user registration modes (open, approval, disabled) for self-hosting
- **Enhanced Analytics UI**: Improved readability with better typography and spacing
- **Sector-based Insights**: Compare your performance across different industries and sectors
- **Progressive Loading**: Analytics page loads immediately while sector data loads in background

**v2.2.0 - Enhanced User Experience**
- **Improved Import Process**: Better error handling and validation for CSV imports
- **Real-time Dashboard Updates**: Live market data integration with automatic refresh
- **Performance Optimizations**: Faster page loads and reduced API usage
- **Mobile Responsiveness**: Enhanced mobile and tablet experience

**v2.1.0 - Market Data Integration**
- **Finnhub API Integration**: Replaced OpenFIGI with Finnhub for consolidated market data
- **Real-time Quotes**: Live stock quotes for open positions with unrealized P&L
- **Enhanced CUSIP Resolution**: Improved symbol resolution using Finnhub's search API
- **Hold Time Analytics**: New chart showing performance by hold time periods
- **Rate Limiting**: Built-in 30 calls/second rate limiting for Finnhub API
- **Port Change**: Backend now runs on port 3000 (update your configs)
- **Owner Role**: First user becomes owner with enhanced permissions

**v1.1.2 - Trade Chart Visualization**
- **Interactive Candlestick Charts**: Visual trade analysis with entry/exit markers using TradingView's lightweight-charts
- **Alpha Vantage Integration**: Historical market data for chart visualization (25 calls/day free tier)
- **Trade Performance Overlay**: Entry/exit price lines with P&L visualization and color coding
- **Short Position P&L Fix**: Corrected profit/loss calculations for short positions
- **Smart Caching**: Intelligent data caching to reduce API usage
- **Chart Controls**: On-demand chart loading to conserve API calls

**Migration Notes:**
- Update your `.env` to include `REGISTRATION_MODE=open` for new registration control
- Update your `.env` to include `GEMINI_API_KEY` for AI recommendations
- Ensure `FINNHUB_API_KEY` is set for sector analysis
- Run database migrations for trading profile features:
  ```bash
  cd backend
  psql -U your_user -d your_db -f migrations/add_admin_approved_column.sql
  psql -U your_user -d your_db -f migrations/add_trading_profile_fields.sql
  ```
- Restart both frontend and backend after update

---

**Note**: This README provides comprehensive setup instructions for TradeTally. Follow each section carefully and ensure all prerequisites are met before proceeding to the next step. For production deployments, pay special attention to the security and monitoring sections.

Feel free to [throw me a couple of bucks](https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD) if you got some use out of this.
