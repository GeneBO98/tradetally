FROM node:20-alpine AS frontend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app/frontend

COPY frontend/package*.json ./
# Update npm to latest version to fix cross-spawn vulnerability
RUN npm install -g npm@latest
RUN npm install
COPY frontend/ ./

RUN npm run build

FROM node:20-alpine AS backend-builder
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache
WORKDIR /app/backend

# Install build dependencies for native modules (excluding vips-dev to avoid Sharp build issues)
RUN apk add --no-cache --no-scripts \
    python3 \
    make \
    g++ \
    libc6-compat \
    build-base

COPY backend/package*.json ./

# Update npm and install node-gyp globally for native module builds
RUN npm install -g npm@latest node-gyp

# Install dependencies
# Sharp will automatically download prebuilt binaries for Alpine Linux
# Set environment variable to ensure Sharp uses prebuilt binaries
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN npm install --omit=dev

COPY backend/ ./

FROM node:20-alpine
# Update packages to fix vulnerabilities
# Create nginx user/group manually since --no-scripts skips post-install scripts
RUN apk update && apk upgrade --no-cache && \
    addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/lib/nginx -s /sbin/nologin -G nginx -g nginx nginx && \
    apk add --no-cache --no-scripts \
    nginx \
    netcat-openbsd \
    vips \
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