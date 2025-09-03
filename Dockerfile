FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Accept build arguments for PostHog
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# Set environment variables for build
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

RUN npm run build

FROM node:18-alpine AS backend-builder
WORKDIR /app/backend

# Install build dependencies for Sharp and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    vips-dev

COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Remove existing Sharp and install for correct platform
RUN rm -rf node_modules/sharp
RUN npm install --os=linux --libc=musl --cpu=arm64 sharp

COPY backend/ ./

FROM node:18-alpine
RUN apk add --no-cache \
    nginx \
    netcat-openbsd \
    vips
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