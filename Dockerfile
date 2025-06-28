FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# Accept build arguments for analytics
ARG VITE_ANALYTICS_DOMAIN
ARG VITE_ANALYTICS_SITE_ID
ARG VITE_API_URL

# Set environment variables for build
ENV VITE_ANALYTICS_DOMAIN=$VITE_ANALYTICS_DOMAIN
ENV VITE_ANALYTICS_SITE_ID=$VITE_ANALYTICS_SITE_ID
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./

FROM node:18-alpine
RUN apk add --no-cache nginx
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend
COPY --from=backend-builder /app/backend ./backend

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80 3000
CMD ["/app/start.sh"]