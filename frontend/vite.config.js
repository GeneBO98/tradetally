import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

// Route view chunks are lazy-imported, so they're only discovered after the
// entry chunk downloads, parses, and the router matches — a serial waterfall
// hop that delays LCP on the first paint. LoginView is the landing target for
// `/` (the most-hit public URL), so we inject a <link rel="modulepreload"> for
// its hashed chunk to fetch it in parallel with the entry. The chunk is tiny
// (~4 KB gzip), so preloading it everywhere is a negligible cost on other pages.
const PRELOAD_VIEWS = ['/views/auth/LoginView.vue']

function preloadRouteChunks() {
  return {
    name: 'tradetally-preload-route-chunks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const tags = []
        for (const file of Object.values(ctx.bundle)) {
          if (
            file.type === 'chunk' &&
            file.facadeModuleId &&
            PRELOAD_VIEWS.some((view) => file.facadeModuleId.endsWith(view))
          ) {
            tags.push({
              tag: 'link',
              attrs: { rel: 'modulepreload', crossorigin: true, href: `/${file.fileName}` },
              injectTo: 'head'
            })
          }
        }
        return { html, tags }
      }
    }
  }
}

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
  build: {
    rollupOptions: {
      output: {
        // Pin large shared vendor deps to stable, explicitly named chunks so
        // they cache independently of app code and never get merged into a
        // route chunk.
        //
        // NOTE: Vite 8 bundles with Rolldown, and Rolldown's `manualChunks`
        // compat shim pulls each matched module's dependencies into the chunk
        // recursively (it dragged the whole Vue runtime into the draggable
        // chunk). Use the native `codeSplitting` groups API with
        // includeDependenciesRecursively: false to get classic Rollup
        // manualChunks semantics (only the matched modules move).
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'chart', test: /node_modules[\\/](chart\.js|@kurkle)[\\/]/ },
            { name: 'draggable', test: /node_modules[\\/](vuedraggable|sortablejs)[\\/]/ },
            { name: 'vendor-markdown', test: /node_modules[\\/](marked|dompurify)[\\/]/ },
            { name: 'lwcharts', test: /node_modules[\\/](lightweight-charts|fancy-canvas)[\\/]/ }
          ]
        }
      }
    }
  },
  plugins: [
    vue(),
    preloadRouteChunks(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // vuedraggable 4.1.0 points its package "module" field at a UMD bundle.
      // That bundle can trip strict self-hosted CSP because it is treated as eval-like
      // script code, so force Vite to consume the source ESM entry instead.
      'vuedraggable': fileURLToPath(new URL('./node_modules/vuedraggable/src/vuedraggable.js', import.meta.url))
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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    clearMocks: true,
    restoreMocks: true
  }
}})
