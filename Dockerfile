FROM node:20-alpine3.21 AS frontend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

RUN npm install -g pnpm@10.13.1

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/package.json
# Use lockfile-based installs for deterministic CI builds.
RUN pnpm install --filter tradetally-frontend --frozen-lockfile
COPY frontend/ ./frontend

# Set VITE_API_URL to use relative path for Nginx proxy
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# PromoteKit affiliate tracking (optional)
ARG VITE_PROMOTEKIT_ID
ENV VITE_PROMOTEKIT_ID=${VITE_PROMOTEKIT_ID}

RUN pnpm --dir frontend run build

FROM node:20-alpine3.21 AS backend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app
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

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/package.json

# Install pnpm and node-gyp globally for native module builds.
RUN npm install -g pnpm@10.13.1 node-gyp

# Install dependencies
# Sharp will automatically download prebuilt binaries for Alpine Linux
# Set environment variable to ensure Sharp uses prebuilt binaries
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN pnpm install --filter tradetally-backend --prod --frozen-lockfile

COPY backend/ ./backend
RUN pnpm deploy --filter tradetally-backend --prod --legacy /prod/backend

FROM node:20-alpine3.21
# Update packages to fix vulnerabilities
# Note: vips is NOT needed here - Sharp uses bundled libvips via SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
    nginx \
    netcat-openbsd \
    libc6-compat \
    su-exec && \
    mkdir -p /run/nginx /var/lib/nginx /var/lib/nginx/tmp /var/log/nginx && \
    chown -R nginx:nginx /run/nginx /var/lib/nginx /var/log/nginx
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend
COPY --from=backend-builder /prod/backend ./backend

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /app/start.sh
COPY docker/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/start.sh /app/docker-entrypoint.sh

# Create non-root user for the Node.js backend process
# Note: nginx master process requires root to bind port 80, but worker processes
# run as the 'nginx' user. The Node.js backend is started as 'appuser' in start.sh.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

EXPOSE 80 3000
CMD ["/app/start.sh"]
