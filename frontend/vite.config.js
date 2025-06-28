import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        if (process.env.VITE_ANALYTICS_DOMAIN) {
          return html.replace(
            '</head>',
            `    <script
      src="${process.env.VITE_ANALYTICS_DOMAIN}/api/script.js"
      data-site-id="2"
      defer
    ></script>
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
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
})