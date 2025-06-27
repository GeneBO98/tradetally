# Multi-stage build for Vue.js frontend and Node.js backend

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Build backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy backend source code
COPY backend/ ./

# Stage 3: Production image
FROM node:18-alpine

# Install nginx for serving frontend
RUN apk add --no-cache nginx

# Create app directory
WORKDIR /app

# Copy nginx configuration
RUN mkdir -p /etc/nginx/conf.d
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend from builder
COPY --from=backend-builder /app/backend ./backend

# Create nginx configuration
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location /api { \
        proxy_pass http://localhost:3000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Create startup script
RUN echo '#!/bin/sh \
\n# Start backend \
\ncd /app/backend && node src/server.js & \
\n# Start nginx \
\nnginx -g "daemon off;"' > /app/start.sh && \
chmod +x /app/start.sh

# Expose ports
EXPOSE 80 3000

# Start both services
CMD ["/app/start.sh"]