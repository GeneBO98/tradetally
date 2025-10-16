# TradeTally - Trading Journal & Analytics Platform

**Dominate With Data**

![TradeTally Dashboard](https://github.com/user-attachments/assets/c7281791-53f6-43c4-937d-ebc9c679f32f)

A comprehensive trading journal and analytics platform built with Vue.js frontend and Node.js backend. Track your trades, analyze performance, and gain insights into your trading patterns across multiple brokers.

## Quick Links

- **Live Demo**: [tradetally.io](https://tradetally.io)
- **Documentation**: [docs.tradetally.io](https://docs.tradetally.io)
- **Forum**: [forum.tradetally.io](https://forum.tradetally.io)
- **Docker Hub**: [potentialmidas/tradetally](https://hub.docker.com/r/potentialmidas/tradetally)
- **iOS TestFlight**: [Join the beta](https://testflight.apple.com/join/11shUY3t)

### Demo Account
- **Username**: demo@example.com
- **Password**: DemoUser25

## Deployment Options

### SaaS Platform
Fully hosted solution at [tradetally.io](https://tradetally.io) with subscription plans starting at $19.99/month.

### Self-Hosted
Free, open-source deployment with all Pro features included. Perfect for:
- Privacy-conscious users
- Personal or team use
- Complete control over your data
- No subscription fees

**Note**: For full feature access (real-time quotes, advanced charts, sector analysis), a [Finnhub.io Basic plan](https://finnhub.io/pricing) is required. Free tier available with limitations.

## Key Features

- **Multi-Broker Support** - Import trades from Lightspeed, Charles Schwab, ThinkorSwim, IBKR, E*TRADE
- **Real-time Market Data** - Live stock quotes and unrealized P&L tracking
- **AI-Powered Analytics** - Personalized trading recommendations
- **Advanced Charts** - Performance analysis by hold time, day of week, sector, and more
- **Trade Visualization** - Interactive candlestick charts with entry/exit markers
- **Gamification & Leaderboards** - Track achievements and compete with peers
- **Behavioral Analytics** - Revenge trading detection and overconfidence tracking
- **Mobile App** - iOS app available on TestFlight

## Technology Stack

**Backend**: Node.js, Express, PostgreSQL
**Frontend**: Vue.js 3, Tailwind CSS, Pinia
**APIs**: Finnhub, Alpha Vantage, various AI providers
**Infrastructure**: Docker, Nginx

## Getting Started

### Docker Deployment (Recommended)

See [Docker Deployment Guide](https://docs.tradetally.io/deployment/docker/) for detailed instructions.

```bash
# Pull and run the latest image
docker pull potentialmidas/tradetally:latest
docker run -d -p 80:80 potentialmidas/tradetally:latest
```

### From Source

See [Installation Guide](https://docs.tradetally.io/getting-started/installation/) for detailed instructions.

**Prerequisites**:
- Node.js (v14+)
- PostgreSQL (v16+)
- npm

```bash
# Clone repository
git clone https://github.com/GeneBO98/tradetally.git
cd tradetally

# Setup backend
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run migrate
npm run dev

# Setup frontend (in new terminal)
cd frontend
npm install
npm run dev
```

## Documentation

Comprehensive documentation is available at [docs.tradetally.io](https://docs.tradetally.io):

- [Installation Guide](https://docs.tradetally.io/getting-started/installation/)
- [Quick Start](https://docs.tradetally.io/getting-started/quick-start/)
- [API Configuration](https://docs.tradetally.io/getting-started/api-keys/)
- [Docker Deployment](https://docs.tradetally.io/deployment/docker/)
- [Importing Trades](https://docs.tradetally.io/usage/importing-trades/)
- [Dashboard Features](https://docs.tradetally.io/features/dashboard/)
- [Analytics Features](https://docs.tradetally.io/features/analytics/)

## Community & Support

- **Forum**: Join the [TradeTally Discourse](https://forum.tradetally.io)
- **GitHub Issues**: Report bugs or request features
- **Documentation**: [docs.tradetally.io](https://docs.tradetally.io)

**Note**: If you already have a TradeTally.io account, you can login to the Forum with those credentials.

## Screenshots

<img width="1282" alt="Analytics Dashboard" src="https://github.com/user-attachments/assets/9eadee5c-5b71-4d38-baf9-b335080d4cae" />
<img width="1336" alt="Trade List" src="https://github.com/user-attachments/assets/6057c9a2-ac33-4aa1-8946-388628e6b8cc" />
<img width="1301" alt="Leaderboards" src="https://github.com/user-attachments/assets/659c6bf8-4624-4cf1-bb27-0ec80a8dadc7" />
<img width="1320" alt="Achievements" src="https://github.com/user-attachments/assets/ea2266fe-72ee-4722-99be-f29f3930bdf5" />

## License

This project is open source software.

## Support Development

Feel free to [throw me a couple of bucks](https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD) if you got some use out of this.
