import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const exposeDevServer = env.VITE_DEV_SERVER_EXPOSE === 'true'
  const devHost = exposeDevServer ? true : (env.VITE_DEV_HOST || '127.0.0.1')
  const configuredAllowedHosts = env.VITE_DEV_ALLOWED_HOSTS
    ? env.VITE_DEV_ALLOWED_HOSTS.split(',').map(host => host.trim()).filter(Boolean)
    : []
  const allowedHosts = Array.from(new Set([
    '127.0.0.1',
    'localhost',
    '[::1]',
    'dev.tradetally.io',
    env.VITE_DEV_HOST,
    ...configuredAllowedHosts
  ].filter(Boolean)))

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: devHost,
    strictPort: true,
    cors: false,
    allowedHosts,
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
