import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
  plugins: [
    vue(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        if (env.VITE_ANALYTICS_DOMAIN && env.VITE_ANALYTICS_SITE_ID) {
          return html.replace(
            '</head>',
            `    <script src="${env.VITE_ANALYTICS_DOMAIN}/api/script.js" data-site-id="${env.VITE_ANALYTICS_SITE_ID}" defer></script>
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
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
}})