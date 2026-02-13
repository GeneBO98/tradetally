// vite.config.js
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "file:///home/docker-admin/tradetally/frontend/node_modules/vite/dist/node/index.js";
import vue from "file:///home/docker-admin/tradetally/frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";

// package.json
var package_default = {
  name: "tradetally-frontend",
  version: "2.1.7",
  private: true,
  type: "module",
  scripts: {
    dev: "vite",
    build: "vite build",
    preview: "vite preview"
  },
  dependencies: {
    "@heroicons/vue": "^2.0.18",
    "@mdi/js": "^7.4.47",
    "@stripe/stripe-js": "^2.4.0",
    axios: "^1.13.2",
    "chart.js": "^4.5.1",
    "date-fns": "^2.30.0",
    "lightweight-charts": "^4.2.1",
    marked: "^16.4.2",
    papaparse: "^5.4.1",
    pinia: "^2.1.7",
    vue: "^3.5.26",
    "vue-chartjs": "^5.2.0",
    "vue-router": "^4.6.4",
    vuedraggable: "^4.1.0"
  },
  devDependencies: {
    "@vitejs/plugin-vue": "^5.2.4",
    autoprefixer: "^10.4.16",
    postcss: "^8.4.31",
    tailwindcss: "^3.3.5",
    vite: "^5.4.19"
  }
};

// vite.config.js
var __vite_injected_original_import_meta_url = "file:///home/docker-admin/tradetally/frontend/vite.config.js";
var vite_config_default = defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      __APP_VERSION__: JSON.stringify(package_default.version)
    },
    plugins: [
      vue(),
      {
        name: "html-transform",
        transformIndexHtml(html) {
          if (env.VITE_ANALYTICS_DOMAIN && env.VITE_ANALYTICS_SITE_ID) {
            const analyticsIntegrity = env.VITE_ANALYTICS_DOMAIN.includes("whitenov.com") ? "sha384-vd7RUW9z55aysdFc92pxoSXb9ZIyYcFjYuXMbB3PRkP9CHeRN39PSn7+ZWQM4V+b" : null;
            const integrityAttr = analyticsIntegrity ? ` integrity="${analyticsIntegrity}" crossorigin="anonymous"` : "";
            return html.replace(
              "</head>",
              `    <script src="${env.VITE_ANALYTICS_DOMAIN}/api/script.js" data-site-id="${env.VITE_ANALYTICS_SITE_ID}" defer${integrityAttr}></script>
  </head>`
            );
          }
          return html;
        }
      }
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
      }
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: process.env.NODE_ENV === "development" ? ["dev.tradetally.io"] : "auto",
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          // Configure proxy for SSE (Server-Sent Events) support
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes, req) => {
              if (req.url?.includes("/notifications/stream")) {
                proxyRes.headers["x-accel-buffering"] = "no";
                proxyRes.headers["cache-control"] = "no-cache";
              }
            });
          }
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiLCAicGFja2FnZS5qc29uIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvZG9ja2VyLWFkbWluL3RyYWRldGFsbHkvZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL2RvY2tlci1hZG1pbi90cmFkZXRhbGx5L2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL2RvY2tlci1hZG1pbi90cmFkZXRhbGx5L2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnXG5pbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgcGtnIGZyb20gJy4vcGFja2FnZS5qc29uJ1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgY29tbWFuZCwgbW9kZSB9KSA9PiB7XG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpXG5cbiAgcmV0dXJuIHtcbiAgZGVmaW5lOiB7XG4gICAgX19BUFBfVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeShwa2cudmVyc2lvbilcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHZ1ZSgpLFxuICAgIHtcbiAgICAgIG5hbWU6ICdodG1sLXRyYW5zZm9ybScsXG4gICAgICB0cmFuc2Zvcm1JbmRleEh0bWwoaHRtbCkge1xuICAgICAgICBpZiAoZW52LlZJVEVfQU5BTFlUSUNTX0RPTUFJTiAmJiBlbnYuVklURV9BTkFMWVRJQ1NfU0lURV9JRCkge1xuICAgICAgICAgIC8vIEFkZCBTdWJyZXNvdXJjZSBJbnRlZ3JpdHkgKFNSSSkgZm9yIGFuYWx5dGljcyBzY3JpcHRcbiAgICAgICAgICAvLyBOb3RlOiBJZiB0aGUgYW5hbHl0aWNzIHNjcmlwdCBpcyB1cGRhdGVkLCB0aGlzIGhhc2ggd2lsbCBuZWVkIHRvIGJlIHJlY2FsY3VsYXRlZFxuICAgICAgICAgIC8vIENhbGN1bGF0ZSB3aXRoOiBjdXJsIC1zIDxzY3JpcHQtdXJsPiB8IG9wZW5zc2wgZGdzdCAtc2hhMzg0IC1iaW5hcnkgfCBvcGVuc3NsIGJhc2U2NCAtQVxuICAgICAgICAgIGNvbnN0IGFuYWx5dGljc0ludGVncml0eSA9IGVudi5WSVRFX0FOQUxZVElDU19ET01BSU4uaW5jbHVkZXMoJ3doaXRlbm92LmNvbScpIFxuICAgICAgICAgICAgPyAnc2hhMzg0LXZkN1JVVzl6NTVheXNkRmM5MnB4b1NYYjlaSXlZY0ZqWXVYTWJCM1BSa1A5Q0hlUk4zOVBTbjcrWldRTTRWK2InXG4gICAgICAgICAgICA6IG51bGw7IC8vIEFkZCBvdGhlciBkb21haW5zJyBoYXNoZXMgYXMgbmVlZGVkXG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgaW50ZWdyaXR5QXR0ciA9IGFuYWx5dGljc0ludGVncml0eSBcbiAgICAgICAgICAgID8gYCBpbnRlZ3JpdHk9XCIke2FuYWx5dGljc0ludGVncml0eX1cIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiYFxuICAgICAgICAgICAgOiAnJztcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gaHRtbC5yZXBsYWNlKFxuICAgICAgICAgICAgJzwvaGVhZD4nLFxuICAgICAgICAgICAgYCAgICA8c2NyaXB0IHNyYz1cIiR7ZW52LlZJVEVfQU5BTFlUSUNTX0RPTUFJTn0vYXBpL3NjcmlwdC5qc1wiIGRhdGEtc2l0ZS1pZD1cIiR7ZW52LlZJVEVfQU5BTFlUSUNTX1NJVEVfSUR9XCIgZGVmZXIke2ludGVncml0eUF0dHJ9Pjwvc2NyaXB0PlxuICA8L2hlYWQ+YFxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaHRtbFxuICAgICAgfVxuICAgIH1cbiAgXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9zcmMnLCBpbXBvcnQubWV0YS51cmwpKVxuICAgIH1cbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBob3N0OiB0cnVlLFxuICAgIGFsbG93ZWRIb3N0czogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdkZXZlbG9wbWVudCcgPyBbJ2Rldi50cmFkZXRhbGx5LmlvJ10gOiAnYXV0bycsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIC8vIENvbmZpZ3VyZSBwcm94eSBmb3IgU1NFIChTZXJ2ZXItU2VudCBFdmVudHMpIHN1cHBvcnRcbiAgICAgICAgY29uZmlndXJlOiAocHJveHkpID0+IHtcbiAgICAgICAgICBwcm94eS5vbigncHJveHlSZXMnLCAocHJveHlSZXMsIHJlcSkgPT4ge1xuICAgICAgICAgICAgLy8gRGlzYWJsZSBidWZmZXJpbmcgZm9yIFNTRSBlbmRwb2ludHMgdG8gYWxsb3cgcmVhbC10aW1lIHN0cmVhbWluZ1xuICAgICAgICAgICAgaWYgKHJlcS51cmw/LmluY2x1ZGVzKCcvbm90aWZpY2F0aW9ucy9zdHJlYW0nKSkge1xuICAgICAgICAgICAgICBwcm94eVJlcy5oZWFkZXJzWyd4LWFjY2VsLWJ1ZmZlcmluZyddID0gJ25vJztcbiAgICAgICAgICAgICAgcHJveHlSZXMuaGVhZGVyc1snY2FjaGUtY29udHJvbCddID0gJ25vLWNhY2hlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufX0pIiwgIntcbiAgXCJuYW1lXCI6IFwidHJhZGV0YWxseS1mcm9udGVuZFwiLFxuICBcInZlcnNpb25cIjogXCIyLjEuN1wiLFxuICBcInByaXZhdGVcIjogdHJ1ZSxcbiAgXCJ0eXBlXCI6IFwibW9kdWxlXCIsXG4gIFwic2NyaXB0c1wiOiB7XG4gICAgXCJkZXZcIjogXCJ2aXRlXCIsXG4gICAgXCJidWlsZFwiOiBcInZpdGUgYnVpbGRcIixcbiAgICBcInByZXZpZXdcIjogXCJ2aXRlIHByZXZpZXdcIlxuICB9LFxuICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJAaGVyb2ljb25zL3Z1ZVwiOiBcIl4yLjAuMThcIixcbiAgICBcIkBtZGkvanNcIjogXCJeNy40LjQ3XCIsXG4gICAgXCJAc3RyaXBlL3N0cmlwZS1qc1wiOiBcIl4yLjQuMFwiLFxuICAgIFwiYXhpb3NcIjogXCJeMS4xMy4yXCIsXG4gICAgXCJjaGFydC5qc1wiOiBcIl40LjUuMVwiLFxuICAgIFwiZGF0ZS1mbnNcIjogXCJeMi4zMC4wXCIsXG4gICAgXCJsaWdodHdlaWdodC1jaGFydHNcIjogXCJeNC4yLjFcIixcbiAgICBcIm1hcmtlZFwiOiBcIl4xNi40LjJcIixcbiAgICBcInBhcGFwYXJzZVwiOiBcIl41LjQuMVwiLFxuICAgIFwicGluaWFcIjogXCJeMi4xLjdcIixcbiAgICBcInZ1ZVwiOiBcIl4zLjUuMjZcIixcbiAgICBcInZ1ZS1jaGFydGpzXCI6IFwiXjUuMi4wXCIsXG4gICAgXCJ2dWUtcm91dGVyXCI6IFwiXjQuNi40XCIsXG4gICAgXCJ2dWVkcmFnZ2FibGVcIjogXCJeNC4xLjBcIlxuICB9LFxuICBcImRldkRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJAdml0ZWpzL3BsdWdpbi12dWVcIjogXCJeNS4yLjRcIixcbiAgICBcImF1dG9wcmVmaXhlclwiOiBcIl4xMC40LjE2XCIsXG4gICAgXCJwb3N0Y3NzXCI6IFwiXjguNC4zMVwiLFxuICAgIFwidGFpbHdpbmRjc3NcIjogXCJeMy4zLjVcIixcbiAg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
