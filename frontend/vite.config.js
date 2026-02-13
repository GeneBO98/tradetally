import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    vue(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        if (env.VITE_ANALYTICS_DOMAIN && env.VITE_ANALYTICS_SITE_ID) {
          // Add Subresource Integrity (SRI) for analytics script
          // Note: If the analytics script is updated, this hash will need to be recalculated
          // Calculate with: curl -s <script-url> | openssl dgst -sha384 -binary | openssl base64 -A
          const analyticsIntegrity = env.VITE_ANALYTICS_DOMAIN.includes('whitenov.com') 
            ? 'sha384-vd7RUW9z55aysdFc92pxoSXb9ZIyYcFjYuXMbB3PRkP9CHeRN39PSn7+ZWQM4V+b'
            : null; // Add other domains' hashes as needed
          
          const integrityAttr = analyticsIntegrity 
            ? ` integrity="${analyticsIntegrity}" crossorigin="anonymous"`
            : '';
          
          return html.replace(
            '</head>',
            `    <script src="${env.VITE_ANALYTICS_DOMAIN}/api/script.js" data-site-id="${env.VITE_ANALYTICS_SITE_ID}" defer${integrityAttr}></script>
  </head>`
          )
        }
        return html
      }
    }
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: process.env.NODE_ENV === 'development' ? ['dev.tradetally.io'] : 'auto',
    proxy: {
      '/api': {
        // Extract base URL from VITE_API_URL (remove /api suffix if present)
        target: (env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, ''),
        changeOrigin: true,
        // Configure proxy for SSE (Server-Sent Events) support
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            // Disable buffering for SSE endpoints to allow real-time streaming
            if (req.url?.includes('/notifications/stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
              proxyRes.headers['cache-control'] = 'no-cache';
            }
          });
        }
      }
    }
  }
}})