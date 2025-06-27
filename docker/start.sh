#!/bin/sh

# Start backend
cd /app/backend && node src/server.js &

# Wait for backend to start
sleep 3

# Start nginx
nginx -g "daemon off;"