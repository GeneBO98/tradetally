# TradeTally Docker Deployment Guide

Self-host TradeTally with Docker Compose. The stack is two containers: the app (frontend + API) and PostgreSQL 16.

## Image Tags

| Tag | Purpose |
|-----|---------|
| `latest` | Stable release (recommended) |
| `X.Y.Z` | Pinned version that never changes |
| `nightly` | Untested development build |

## Quick Start

### Prerequisites
- Docker Engine 20.10+ with the Docker Compose v2 plugin (`docker compose`)
- 2 GB RAM minimum

### 1. Download Deployment Files

```bash
mkdir tradetally
cd tradetally

curl -O https://raw.githubusercontent.com/GeneBO98/tradetally/refs/heads/main/docker-compose.yaml
curl -O https://raw.githubusercontent.com/GeneBO98/tradetally/main/.env.example
mv .env.example .env
```

### 2. Configure Environment

Edit `.env` and set at least these values:

| Variable | What to set |
|----------|-------------|
| `DB_PASSWORD` | A strong database password |
| `JWT_SECRET` | A long random string, e.g. output of `openssl rand -hex 32` |
| `FRONTEND_URL` | The exact URL you will open in your browser, e.g. `http://localhost:8080`, `http://192.168.1.50:8080`, or `https://trades.example.com`. Requests from any other origin are rejected. |
| `BROKER_ENCRYPTION_KEY` | Required only for broker sync (Schwab, IBKR, etc.). Generate with `openssl rand -hex 32` |

Set `DB_PASSWORD` before the first start. PostgreSQL only applies it when the database volume is first created.

Everything else is optional. See [Optional Configuration](#optional-configuration).

### 3. Start TradeTally

```bash
docker compose up -d
docker compose ps
docker compose logs -f app
```

Database migrations run automatically on startup (`RUN_MIGRATIONS=true`). No manual schema step is needed.

### 4. Create Your Account

Open http://localhost:8080 (or your `FRONTEND_URL`) and register. **The first account registered becomes the admin.** If email is not configured, accounts are active immediately without email verification.

Use `REGISTRATION_MODE` to control sign-ups after that: `open` (default), `approval` (admin approves new users), or `disabled`.

## Optional Configuration

**Market data and AI:**

| Variable | Used for | Get a key |
|----------|----------|-----------|
| `FINNHUB_API_KEY` | Quotes, company data, CUSIP resolution | https://finnhub.io/dashboard |
| `ALPHA_VANTAGE_API_KEY` | Trade charts (daily candles on the free tier) | https://www.alphavantage.co/support/#api-key |
| `OPENFIGI_API_KEY` | CUSIP to ticker resolution | https://www.openfigi.com/api |
| `GEMINI_API_KEY` | Server-wide default AI key (users can also add their own in Settings) | https://aistudio.google.com/apikey |

**Email (SMTP):** set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM`. All of host, user, and pass must be set or email stays disabled.

**Mobile app / extra origins:** add comma-separated origins to `CORS_ORIGINS`.

**Background services:** each scheduler can be turned off with its `ENABLE_*` flag (for example `ENABLE_PRICE_MONITORING=false`) to reduce resource usage.

After changing `.env`, apply it with `docker compose up -d`.

## Management Commands

### Update
```bash
docker compose pull
docker compose up -d
```

### Logs
```bash
docker compose logs -f app
docker compose logs -f postgres
```

### Backup Database
```bash
docker exec tradetally-db pg_dump -U trader tradetally > tradetally_backup_$(date +%Y%m%d).sql
```

### Restore Database
Restore into an empty database (for example, a fresh install before registering any account):
```bash
docker exec -i tradetally-db psql -U trader tradetally < tradetally_backup.sql
```

### Stop
```bash
# Stop containers (data is kept)
docker compose down

# Stop and delete the database volume (WARNING: deletes all data)
docker compose down -v
```

## Where Data Lives

```
tradetally/
├── docker-compose.yaml
├── .env
└── backend/            (created on first start)
    ├── src/logs/       application logs
    ├── src/data/       app data files
    └── uploads/        uploaded images and attachments
```

The database is stored in the `postgres_data` Docker volume.

## Troubleshooting

**"Origin is not allowed" / login or registration fails:** `FRONTEND_URL` does not match the URL in your browser's address bar (scheme, host, and port must all match). Fix it in `.env` and run `docker compose up -d`.

**App won't start:**
```bash
docker compose logs app
docker compose ps postgres
docker exec tradetally-db pg_isready -U trader -d tradetally
```

**`DB_PASSWORD must be set` / `JWT_SECRET must be set`:** the variable is missing from `.env`, or `.env` is not in the same directory as `docker-compose.yaml`.

**Database authentication failed after changing `DB_PASSWORD`:** the password is fixed when the volume is created. Change it back, or change it inside PostgreSQL with `ALTER USER`.

## Security Notes

1. Change `DB_PASSWORD` and `JWT_SECRET` from the template values.
2. Put TradeTally behind a reverse proxy with TLS (Caddy, nginx, Traefik) for anything beyond local use, and set `FRONTEND_URL` to the HTTPS URL.
3. Only port 8080 is published. PostgreSQL is not exposed outside the Docker network.
4. Back up the database regularly and keep the image updated.

## Support

- GitHub: https://github.com/GeneBO98/tradetally
- Issues: https://github.com/GeneBO98/tradetally/issues
