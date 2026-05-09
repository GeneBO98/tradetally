#!/bin/bash

set -euo pipefail

echo "[DEPLOY] TradeTally Quick Deploy Script"
echo "======================================="

REPO_RAW_URL="https://raw.githubusercontent.com/GeneBO98/tradetally/refs/heads/main"
ENV_TEMPLATE_URL="https://raw.githubusercontent.com/GeneBO98/tradetally/main/.env.example"
DEPLOY_DIR="${TRADETALLY_DEPLOY_DIR:-tradetally-deployment}"

if ! command -v docker > /dev/null 2>&1; then
    echo "[ERROR] Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker daemon is not running." >&2
    exit 1
fi

if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "[ERROR] Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "[OK] Docker is installed"
echo "[OK] Docker Compose is installed"

if [ -d "$DEPLOY_DIR" ]; then
    echo "[INFO] Using existing deployment directory: $DEPLOY_DIR"
else
    echo "[INFO] Creating deployment directory: $DEPLOY_DIR"
    mkdir -p "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"
DEPLOY_PATH="$(pwd)"

download_file() {
    local url="$1"
    local output="$2"

    if ! curl -fsSL "$url" -o "$output"; then
        echo "[ERROR] Failed to download $url"
        exit 1
    fi
}

set_env_value() {
    local key="$1"
    local value="$2"
    local escaped

    escaped=$(printf '%s' "$value" | sed 's/[&|]/\\&/g')

    if grep -q "^${key}=" .env; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" .env
        rm -f .env.bak
    else
        printf '\n%s=%s\n' "$key" "$value" >> .env
    fi
}

get_env_value() {
    local key="$1"
    grep -E "^${key}=" .env | tail -1 | cut -d= -f2-
}

is_placeholder_value() {
    local value="$1"

    case "$value" in
        ""|your_*|https://your-domain.com|*your-domain.com*|sk_test_*|pk_test_*|whsec_*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

generate_secret() {
    local bytes="$1"

    if command -v openssl > /dev/null 2>&1; then
        openssl rand -hex "$bytes"
    else
        date "+%s%N" | shasum -a 256 | awk '{print $1}'
    fi
}

prompt_env() {
    local key="$1"
    local prompt="$2"
    local default_value="$3"
    local current_value
    local input

    current_value="$(get_env_value "$key" || true)"
    if ! is_placeholder_value "$current_value"; then
        default_value="$current_value"
    fi

    if [ -n "$default_value" ]; then
        read -r -p "$prompt [$default_value]: " input
        input="${input:-$default_value}"
    else
        read -r -p "$prompt: " input
    fi

    set_env_value "$key" "$input"
}

blank_placeholder() {
    local key="$1"
    local current_value

    current_value="$(get_env_value "$key" || true)"
    if is_placeholder_value "$current_value"; then
        set_env_value "$key" ""
    fi
}

echo "[INFO] Downloading deployment files..."
download_file "$REPO_RAW_URL/docker-compose.yaml" docker-compose.yaml
download_file "$ENV_TEMPLATE_URL" .env.example

if [ ! -f .env ]; then
    echo "[CONFIG] Creating .env from template"
    cp .env.example .env
else
    echo "[CONFIG] Keeping existing .env"
fi

if [ "$(get_env_value DB_PASSWORD || true)" = "trader_password" ] || [ -z "$(get_env_value DB_PASSWORD || true)" ]; then
    set_env_value "DB_PASSWORD" "$(generate_secret 16)"
    echo "[SECURITY] Generated DB_PASSWORD"
fi

case "$(get_env_value JWT_SECRET || true)" in
    ""|your_super_secret_jwt_key_change_this_in_production|your_super_secure_jwt_secret_key_change_this_in_production)
        set_env_value "JWT_SECRET" "$(generate_secret 32)"
        echo "[SECURITY] Generated JWT_SECRET"
        ;;
esac

if [ -z "$(get_env_value BROKER_ENCRYPTION_KEY || true)" ]; then
    set_env_value "BROKER_ENCRYPTION_KEY" "$(generate_secret 32)"
    echo "[SECURITY] Generated BROKER_ENCRYPTION_KEY for broker sync"
fi

echo ""
echo "[CONFIG] Deployment settings"
prompt_env "INSTANCE_URL" "Public TradeTally URL" "http://localhost:8080"
if is_placeholder_value "$(get_env_value APP_URL || true)"; then
    set_env_value "APP_URL" "$(get_env_value INSTANCE_URL)"
fi
if is_placeholder_value "$(get_env_value BASE_URL || true)"; then
    set_env_value "BASE_URL" "$(get_env_value INSTANCE_URL)"
fi
prompt_env "FRONTEND_URL" "Frontend URL for CORS" "$(get_env_value INSTANCE_URL)"
prompt_env "CORS_ORIGINS" "Additional CORS origins, comma-separated" "$(get_env_value FRONTEND_URL)"
prompt_env "VITE_API_URL" "Browser API URL" "$(get_env_value INSTANCE_URL | sed 's:/*$::')/api"
prompt_env "REGISTRATION_MODE" "Registration mode: open, approval, or disabled" "open"
prompt_env "TZ" "Server timezone" "UTC"

echo ""
echo "[CONFIG] Optional API keys. Press Enter to leave blank."
prompt_env "FINNHUB_API_KEY" "Finnhub API key" ""
prompt_env "ALPHA_VANTAGE_API_KEY" "Alpha Vantage API key" ""
prompt_env "OPENFIGI_API_KEY" "OpenFIGI API key" ""
prompt_env "GEMINI_API_KEY" "Gemini API key" ""

blank_placeholder "FINNHUB_API_KEY"
blank_placeholder "ALPHA_VANTAGE_API_KEY"
blank_placeholder "OPENFIGI_API_KEY"
blank_placeholder "GEMINI_API_KEY"
blank_placeholder "STRIPE_SECRET_KEY"
blank_placeholder "STRIPE_PUBLISHABLE_KEY"
blank_placeholder "STRIPE_WEBHOOK_SECRET"

mkdir -p backend/src/logs backend/src/data backend/uploads

echo ""
echo "[DEPLOY] Pulling images..."
$DOCKER_COMPOSE pull

echo "[DEPLOY] Starting TradeTally..."
$DOCKER_COMPOSE up -d

echo -n "[WAIT] Waiting for application container..."
until [ "$(docker inspect -f '{{.State.Running}}' tradetally-app 2>/dev/null || echo false)" = "true" ]; do
    echo -n "."
    sleep 1
done
echo " running"

echo ""
echo "[SUCCESS] TradeTally deployment complete"
echo ""
echo "[INFO] Access your application:"
echo "   TradeTally: $(get_env_value INSTANCE_URL)"
echo ""
echo "[INFO] Create your first user account from the registration page."
echo ""
echo "[COMMANDS] Useful commands:"
echo "   cd $DEPLOY_PATH"
echo "   View logs: $DOCKER_COMPOSE logs -f"
echo "   Stop: $DOCKER_COMPOSE down"
echo "   Update: $DOCKER_COMPOSE pull && $DOCKER_COMPOSE up -d"
echo ""
