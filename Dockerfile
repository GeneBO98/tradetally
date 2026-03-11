FROM node:20-alpine3.21 AS frontend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app/frontend
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY frontend/package*.json ./
# Use lockfile-based installs for deterministic CI builds.
RUN npm ci --no-audit --no-fund
COPY frontend/ ./

# Set VITE_API_URL to use relative path for Nginx proxy
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# PromoteKit affiliate tracking (optional)
ARG VITE_PROMOTEKIT_ID
ENV VITE_PROMOTEKIT_ID=${VITE_PROMOTEKIT_ID}

RUN npm run build

FROM node:20-alpine3.21 AS backend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app/backend
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# Install build dependencies for native modules (excluding vips-dev to avoid Sharp build issues)
RUN apk add --no-cache --no-scripts \
    python3 \
    make \
    g++ \
    libc6-compat \
    build-base

COPY backend/package*.json ./

# Install node-gyp globally for native module builds.
RUN npm install -g node-gyp

# Install dependencies
# Sharp will automatically download prebuilt binaries for Alpine Linux
# Set environment variable to ensure Sharp uses prebuilt binaries
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN npm ci --omit=dev --no-audit --no-fund

COPY backend/ ./

FROM node:20-alpine3.21
# Update packages to fix vulnerabilities
# Create nginx user/group and directories manually since --no-scripts skips post-install scripts
# Note: vips is NOT needed here - Sharp uses bundled libvips via SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN apk update && apk upgrade --no-cache && \
    addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/lib/nginx -s /sbin/nologin -G nginx -g nginx nginx && \
    apk add --no-cache --no-scripts \
    nginx \
    netcat-openbsd \
    libc6-compat && \
    mkdir -p /run/nginx /var/lib/nginx /var/lib/nginx/tmp /var/log/nginx && \
    chown -R nginx:nginx /run/nginx /var/lib/nginx /var/log/nginx
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend
COPY --from=backend-builder /app/backend ./backend

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /app/start.sh
COPY docker/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/start.sh /app/docker-entrypoint.sh

EXPOSE 80 3000
CMD ["/app/start.sh"]
