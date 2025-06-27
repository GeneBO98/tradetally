# TradeTally Docker Deployment Guide

Deploy TradeTally quickly using Docker and Docker Compose.

## Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+

### 1. Download Deployment Files

Create a new directory and download the required files:

```bash
mkdir tradetally
cd tradetally

# Download the production docker-compose file
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/trader-vue/main/docker-compose.production.yaml

# Download the environment template
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/trader-vue/main/.env.production.example

# Rename to .env
mv .env.production.example .env
```

### 2. Configure Environment

Edit the `.env` file with your settings:

```bash
nano .env  # or vim .env
```

**Important configurations:**
- `JWT_SECRET`: Change this to a secure random string
- `DB_PASSWORD`: Set a strong database password
- API keys (optional but recommended for full functionality)

### 3. Deploy

```bash
# Start the application
docker-compose -f docker-compose.production.yaml up -d

# Check status
docker-compose -f docker-compose.production.yaml ps

# View logs
docker-compose -f docker-compose.production.yaml logs -f app
```

### 4. Initialize Database (First Time Only)

The database will be automatically created. To verify:

```bash
# Check if database is ready
docker exec tradetally-db pg_isready -U trader -d tradetally

# If you need to manually run the schema (only if tables don't exist):
# docker exec -i tradetally-db psql -U trader -d tradetally < schema.sql
```

### 5. Access the Application

- **TradeTally**: http://localhost
- **Database Admin**: http://localhost:8080 (optional)

## Default Login

Create your first user account through the registration page, or use the demo account if available:
- Email: demo@example.com
- Password: DemoUser25

## Management Commands

### View Logs
```bash
docker-compose -f docker-compose.production.yaml logs -f app
docker-compose -f docker-compose.production.yaml logs -f postgres
```

### Update Application
```bash
# Pull latest image
docker-compose -f docker-compose.production.yaml pull app

# Restart application (preserves database)
docker-compose -f docker-compose.production.yaml up -d app
```

### Backup Database
```bash
docker exec tradetally-db pg_dump -U trader tradetally > tradetally_backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
docker exec -i tradetally-db psql -U trader tradetally < tradetally_backup.sql
```

### Stop Services
```bash
# Stop all services (preserves data)
docker-compose -f docker-compose.production.yaml down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose -f docker-compose.production.yaml down -v
```

## Directory Structure

After deployment, your directory should look like:
```
tradetally/
├── docker-compose.production.yaml
├── .env
├── logs/          (created automatically)
└── data/          (created automatically)
```

## Troubleshooting

### Application won't start
```bash
# Check logs
docker-compose -f docker-compose.production.yaml logs app

# Check database connection
docker exec tradetally-app ping postgres
```

### Database connection issues
```bash
# Check database status
docker-compose -f docker-compose.production.yaml ps postgres

# Check database logs
docker-compose -f docker-compose.production.yaml logs postgres
```

### Performance issues
- Ensure your server has at least 2GB RAM
- Check disk space for Docker volumes
- Monitor with: `docker stats`

## Security Notes

1. **Change default passwords** in `.env`
2. **Use a firewall** to restrict access to ports 5432 and 8080
3. **Set up SSL/TLS** with a reverse proxy like nginx for production
4. **Regular backups** of your database
5. **Keep Docker images updated**

## Support

For issues and support:
- GitHub Issues: [Your Repository URL]
- Documentation: [Your Documentation URL]

## API Keys (Optional)

For full CUSIP resolution functionality:

1. **OpenFIGI API**: https://www.openfigi.com/api
2. **Google Gemini API**: https://console.cloud.google.com/

Add these to your `.env` file as `OPENFIGI_API_KEY` and `GEMINI_API_KEY`.