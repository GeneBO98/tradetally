#!/bin/sh

# Function to inject analytics script at runtime
inject_analytics() {
    if [ -n "$VITE_ANALYTICS_DOMAIN" ] && [ -n "$VITE_ANALYTICS_SITE_ID" ]; then
        echo "Injecting analytics script: $VITE_ANALYTICS_DOMAIN with site ID $VITE_ANALYTICS_SITE_ID"
        
        # Find all HTML files and inject analytics script
        find /usr/share/nginx/html -name "*.html" -type f | while read file; do
            if ! grep -q "data-site-id=\"$VITE_ANALYTICS_SITE_ID\"" "$file"; then
                sed -i "s|</head>|    <script src=\"$VITE_ANALYTICS_DOMAIN/api/script.js\" data-site-id=\"$VITE_ANALYTICS_SITE_ID\" defer></script>\n  </head>|g" "$file"
                echo "Analytics injected into $file"
            fi
        done
    else
        echo "Analytics not configured - VITE_ANALYTICS_DOMAIN or VITE_ANALYTICS_SITE_ID missing"
    fi
}

# Inject analytics script at startup
inject_analytics

# Start backend
cd /app/backend && node src/server.js &

# Wait for backend to start
sleep 3

# Start nginx
nginx -g "daemon off;"