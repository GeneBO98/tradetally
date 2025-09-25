FROM node:20-alpine AS frontend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app/frontend

# Accept build arguments for PostHog
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

COPY frontend/package*.json ./
# Update npm to latest version to fix cross-spawn vulnerability
RUN npm install -g npm@latest
RUN npm install
COPY frontend/ ./

# Set environment variables for build
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

RUN npm run build

FROM node:20-alpine AS backend-builder
# Update packages to fix vulnerabilities  
RUN apk update && apk upgrade --no-cache
WORKDIR /app/backend

# Install build dependencies for Sharp and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    vips-dev \
    build-base

COPY backend/package*.json ./

# Update npm to latest version to fix cross-spawn vulnerability
RUN npm install -g npm@latest

# Install dependencies
RUN npm install --omit=dev

# Force reinstall Sharp with proper architecture detection
# This will automatically detect and build for the correct platform
RUN npm uninstall sharp && \
    npm install sharp --build-from-source

COPY backend/ ./

FROM node:20-alpine
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
    nginx \
    netcat-openbsd \
    vips \
    vips-dev \
    libc6-compat
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