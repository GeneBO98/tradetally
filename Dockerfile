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

# Install build dependencies for Sharp and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    vips-dev \
    build-base

COPY backend/package*.json ./

# Update npm and install node-gyp globally for native module builds
RUN npm install -g npm@latest node-gyp

# Install dependencies
# Sharp will automatically download prebuilt binaries for Alpine Linux
RUN npm install --omit=dev

# Rebuild Sharp to ensure it's compiled for the correct architecture
RUN npm rebuild sharp

COPY backend/ ./

FROM node:20-alpine
# Update packages to fix vulnerabilities
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
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