# TradeTally - Trading Journal & Analytics Platform

**Dominate With Data**

<img width="1269" height="1258" alt="SCR-20251016-iosj" src="https://github.com/user-attachments/assets/ce052bdd-f149-4041-b759-3c0f47c926e0" />

A comprehensive trading journal and analytics platform built with Vue.js frontend and Node.js backend. Track your trades, analyze performance, and gain insights into your trading patterns across multiple brokers.

## Quick Links

- **Live Demo**: [tradetally.io](https://tradetally.io)
- **Documentation**: [docs.tradetally.io](https://docs.tradetally.io)
- **Forum**: [forum.tradetally.io](https://forum.tradetally.io)
- **iOS TestFlight**: [Join the beta](https://testflight.apple.com/join/11shUY3t)
- **Docker Hub**: [potentialmidas/tradetally](https://hub.docker.com/r/potentialmidas/tradetally)

### Demo Account
- **Username**: demo@example.com
- **Password**: DemoUser25

## Major Features

### Trading Journal & Analysis
- **Multi-Broker Support** - Import trades from Lightspeed, Charles Schwab, ThinkorSwim, IBKR, E*TRADE, ProjectX
- **Options & Futures Trading** - Full support for options and futures contracts with specialized analytics
- **Real-time Market Data** - Live stock quotes and unrealized P&L tracking
- **Trade Visualization** - Interactive candlestick charts with entry/exit markers

### Analytics & Insights
- **AI-Powered Analytics** - Personalized trading recommendations powered by Google Gemini
- **Advanced Charts** - Performance analysis by hold time, day of week, sector, and more
- **Behavioral Analytics** - Revenge trading detection and overconfidence tracking (Pro)
- **Health Tracking** - Correlate sleep, heart rate, and other health metrics with trading performance (Pro)

### Markets & Alerts
- **Watchlists** - Track favorite stocks with real-time prices and news (Pro)
- **Price Alerts** - Email and browser notifications for price targets (Pro)
- **News Integration** - Automatic news enrichment for traded symbols
- **Earnings Tracking** - Monitor upcoming earnings for watchlist symbols (Pro)

### Community & Gamification
- **Leaderboards** - Track achievements and compete with peers
- **Public Trades** - Share trades and learn from the community
- **Achievements System** - Unlock badges and track milestones
- **Forum Integration** - Join discussions at [forum.tradetally.io](https://forum.tradetally.io)

### Mobile App
- **iOS App** - Native iOS application available on [TestFlight](https://testflight.apple.com/join/11shUY3t)
- Full feature parity with web application
- Optimized mobile trading journal experience

## Deployment Options

### SaaS Platform
Fully hosted solution at [tradetally.io](https://tradetally.io) with subscription at $8.00/month or $80/year.

### Self-Hosted
Free, open-source deployment with all Pro features included. Perfect for:
- Privacy-conscious users
- Personal or team use
- Complete control over your data
- No subscription fees

**Note**: For full feature access (real-time quotes, advanced charts, sector analysis), a [Finnhub.io Basic plan](https://finnhub.io/pricing) is required. Free tier available with limitations.

## Technology Stack

**Backend**: Node.js, Express, PostgreSQL
**Frontend**: Vue.js 3, Tailwind CSS, Pinia
**APIs**: Finnhub, Alpha Vantage, Google Gemini
**Infrastructure**: Docker, Nginx

## Getting Started

For detailed installation and setup instructions, visit the [documentation site](https://docs.tradetally.io).

### Quick Start with Docker

```bash
docker pull potentialmidas/tradetally:latest
docker run -d -p 80:80 potentialmidas/tradetally:latest
```

See the [Docker Deployment Guide](https://docs.tradetally.io/deployment/docker/) for production setup.

## Documentation

Comprehensive documentation is available at [docs.tradetally.io](https://docs.tradetally.io):

- [Installation Guide](https://docs.tradetally.io/getting-started/installation/)
- [Quick Start](https://docs.tradetally.io/getting-started/quick-start/)
- [API Configuration](https://docs.tradetally.io/getting-started/api-keys/)
- [Docker Deployment](https://docs.tradetally.io/deployment/docker/)
- [Importing Trades](https://docs.tradetally.io/usage/importing-trades/)
- [Feature Guides](https://docs.tradetally.io/features/)

## Community & Support

- **Forum**: Join the [TradeTally Discourse](https://forum.tradetally.io) - If you have a TradeTally.io account, you can login with those credentials
- **GitHub Issues**: Report bugs or request features
- **Documentation**: [docs.tradetally.io](https://docs.tradetally.io)
- **iOS TestFlight**: [Join the beta](https://testflight.apple.com/join/11shUY3t)

## Screenshots

<img width="1258" height="1083" alt="SCR-20251016-ioxa" src="https://github.com/user-attachments/assets/7da7b48d-ae9e-4eb7-9002-d95e4fa56ee4" />
<img width="1251" height="618" alt="SCR-20251016-iouv" src="https://github.com/user-attachments/assets/d1e5d4d7-4eb2-4f7e-9067-a80e4fda7bdd" />
<img width="1315" height="1107" alt="SCR-20251016-ioph" src="https://github.com/user-attachments/assets/08f7b939-0b61-4a85-ae69-330b30e81f72" />
<img width="1251" height="750" alt="SCR-20251016-ioqu" src="https://github.com/user-attachments/assets/564abda5-50c5-4ad7-90fd-4e923b2d5d09" />
<img width="1257" height="765" alt="SCR-20251016-inwc" src="https://github.com/user-attachments/assets/9e7697b5-39e2-4982-899b-ed5f4a781a30" />
<img width="1249" height="1320" alt="SCR-20251016-inyh" src="https://github.com/user-attachments/assets/55d893dd-fd82-49a4-9340-2496945e0844" />
<img width="1243" height="664" alt="SCR-20251016-iohf" src="https://github.com/user-attachments/assets/d0593bdd-e9d0-4d77-86bd-eda7b7c25e71" />
<img width="1242" height="867" alt="SCR-20251016-ioih" src="https://github.com/user-attachments/assets/8139d229-c1a8-4889-a7e1-2ab598611f24" />
<img width="1232" height="954" alt="SCR-20251016-iolb" src="https://github.com/user-attachments/assets/19be38eb-c2fa-40a4-843d-b38a5a1129cd" />
<img width="1301" alt="Leaderboards" src="https://github.com/user-attachments/assets/659c6bf8-4624-4cf1-bb27-0ec80a8dadc7" />
<img width="1320" alt="Achievements" src="https://github.com/user-attachments/assets/ea2266fe-72ee-4722-99be-f29f3930bdf5" />

## License

This project is open source software.

## Support Development

Feel free to [throw me a couple of bucks](https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD) if you got some use out of this.
