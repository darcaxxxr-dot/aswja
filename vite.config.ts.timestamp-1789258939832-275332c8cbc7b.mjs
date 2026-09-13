// vite.config.ts
import { defineConfig } from "file:///C:/Users/user/Documents/workspace/smartfaceabsen/node_modules/vite/dist/node/index.js";
import { resolve } from "path";
import { VitePWA } from "file:///C:/Users/user/Documents/workspace/smartfaceabsen/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\user\\Documents\\workspace\\smartfaceabsen";
var buildTimestamp = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 19);
var vite_config_default = defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __APP_VERSION__: JSON.stringify("1.0.0")
  },
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "src"),
      "@components": resolve(__vite_injected_original_dirname, "src/components"),
      "@pages": resolve(__vite_injected_original_dirname, "src/pages"),
      "@services": resolve(__vite_injected_original_dirname, "src/services"),
      "@repositories": resolve(__vite_injected_original_dirname, "src/repositories"),
      "@models": resolve(__vite_injected_original_dirname, "src/models"),
      "@utils": resolve(__vite_injected_original_dirname, "src/utils"),
      "@config": resolve(__vite_injected_original_dirname, "src/config"),
      "@router": resolve(__vite_injected_original_dirname, "src/router"),
      "@styles": resolve(__vite_injected_original_dirname, "src/styles")
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
    // Performance budget — warn when chunks exceed these sizes (kB)
    chunkSizeWarningLimit: 500,
    cssCodeSplit: true,
    minify: "esbuild",
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching & code splitting
        manualChunks(id) {
          if (id.includes("node_modules/@vladmandic/face-api") || id.includes("node_modules/@tensorflow")) {
            return "vendor-faceapi";
          }
          if (id.includes("node_modules/dexie") || id.includes("node_modules/dexie-react-hooks")) {
            return "vendor-dexie";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/zod")) {
            return "vendor-zod";
          }
          if (id.includes("src/repositories/index.ts") || id.includes("src/repositories/")) {
            return "vendor-repositories";
          }
          if (id.includes("node_modules/")) {
            return "vendor-other";
          }
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "icons/icon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-192.png",
        "icons/icon-maskable-512.png",
        "icons/apple-touch-icon.png",
        "icons/favicon-32.png",
        "models/tiny_face_detector_model-weights_manifest.json",
        "models/face_landmark_68_model-weights_manifest.json",
        "models/face_recognition_model-weights_manifest.json"
      ],
      manifest: {
        name: "ASWJA - Absensi Sholat Wajib Berjamaah",
        short_name: "ASWJA",
        description: "Absensi Sholat Wajib Berjamaah MAN Insan Cendekia Kota Palangkaraya",
        theme_color: "#0ea572",
        background_color: "#064e3b",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        lang: "id",
        categories: ["education", "productivity"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Model manifest JSON — StaleWhileRevalidate agar offline masih bisa
            urlPattern: /\/models\/.+\.json$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "smartface-models-manifest",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Model binary shards (.bin) — NetworkFirst dengan cache fallback.
            // NetworkFirst memastikan kita selalu cek versi terbaru dari CDN;
            // kalau offline, fallback ke cache. TIDAK CacheFirst agar saat model
            // di-update di server, device langsung dapat versi baru tanpa stale data.
            urlPattern: /\/models\/.+\.bin$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "smartface-models-binary",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "smartface-images",
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.+/,
            handler: "CacheFirst",
            options: {
              cacheName: "smartface-remote",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          },
          {
            // Sound files — CacheFirst untuk fast playback, cache 1 tahun
            urlPattern: /\/sounds\/.+/,
            handler: "CacheFirst",
            options: {
              cacheName: "smartface-sounds",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: false,
        type: "module"
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvY3VtZW50c1xcXFx3b3Jrc3BhY2VcXFxcc21hcnRmYWNlYWJzZW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXHVzZXJcXFxcRG9jdW1lbnRzXFxcXHdvcmtzcGFjZVxcXFxzbWFydGZhY2VhYnNlblxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvdXNlci9Eb2N1bWVudHMvd29ya3NwYWNlL3NtYXJ0ZmFjZWFic2VuL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuLy8gQnVpbGQgdGltZXN0YW1wIHVudHVrIHZlcnNpb24gdHJhY2tpbmdcbmNvbnN0IGJ1aWxkVGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoJ1QnLCAnICcpLnN1YnN0cmluZygwLCAxOSk7IC8vIFlZWVktTU0tREQgSEg6TU06U1NcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgZGVmaW5lOiB7XG4gICAgX19CVUlMRF9USU1FU1RBTVBfXzogSlNPTi5zdHJpbmdpZnkoYnVpbGRUaW1lc3RhbXApLFxuICAgIF9fQVBQX1ZFUlNJT05fXzogSlNPTi5zdHJpbmdpZnkoJzEuMC4wJylcbiAgfSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjJyksXG4gICAgICAnQGNvbXBvbmVudHMnOiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9jb21wb25lbnRzJyksXG4gICAgICAnQHBhZ2VzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvcGFnZXMnKSxcbiAgICAgICdAc2VydmljZXMnOiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9zZXJ2aWNlcycpLFxuICAgICAgJ0ByZXBvc2l0b3JpZXMnOiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9yZXBvc2l0b3JpZXMnKSxcbiAgICAgICdAbW9kZWxzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvbW9kZWxzJyksXG4gICAgICAnQHV0aWxzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvdXRpbHMnKSxcbiAgICAgICdAY29uZmlnJzogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvY29uZmlnJyksXG4gICAgICAnQHJvdXRlcic6IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjL3JvdXRlcicpLFxuICAgICAgJ0BzdHlsZXMnOiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9zdHlsZXMnKVxuICAgIH1cbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogdHJ1ZSxcbiAgICBwb3J0OiA1MTczLFxuICAgIHN0cmljdFBvcnQ6IGZhbHNlXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiAnZXMyMDIwJyxcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxuICAgIC8vIFBlcmZvcm1hbmNlIGJ1ZGdldCBcdTIwMTQgd2FybiB3aGVuIGNodW5rcyBleGNlZWQgdGhlc2Ugc2l6ZXMgKGtCKVxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNTAwLFxuICAgIGNzc0NvZGVTcGxpdDogdHJ1ZSxcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcbiAgICByZXBvcnRDb21wcmVzc2VkU2l6ZTogdHJ1ZSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgLy8gU3BsaXQgdmVuZG9yIGNodW5rcyBmb3IgYmV0dGVyIGNhY2hpbmcgJiBjb2RlIHNwbGl0dGluZ1xuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9AdmxhZG1hbmRpYy9mYWNlLWFwaScpIHx8IGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvQHRlbnNvcmZsb3cnKSkge1xuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItZmFjZWFwaSc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL2RleGllJykgfHwgaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9kZXhpZS1yZWFjdC1ob29rcycpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1kZXhpZSc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL0BzdXBhYmFzZScpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1zdXBhYmFzZSc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3pvZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci16b2QnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3NyYy9yZXBvc2l0b3JpZXMvaW5kZXgudHMnKSB8fCBpZC5pbmNsdWRlcygnc3JjL3JlcG9zaXRvcmllcy8nKSkge1xuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItcmVwb3NpdG9yaWVzJztcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvJykpIHtcbiAgICAgICAgICAgIHJldHVybiAndmVuZG9yLW90aGVyJztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5qZWN0UmVnaXN0ZXI6ICdhdXRvJyxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcbiAgICAgICAgJ2ljb25zL2ljb24uc3ZnJyxcbiAgICAgICAgJ2ljb25zL2ljb24tMTkyLnBuZycsXG4gICAgICAgICdpY29ucy9pY29uLTUxMi5wbmcnLFxuICAgICAgICAnaWNvbnMvaWNvbi1tYXNrYWJsZS0xOTIucG5nJyxcbiAgICAgICAgJ2ljb25zL2ljb24tbWFza2FibGUtNTEyLnBuZycsXG4gICAgICAgICdpY29ucy9hcHBsZS10b3VjaC1pY29uLnBuZycsXG4gICAgICAgICdpY29ucy9mYXZpY29uLTMyLnBuZycsXG4gICAgICAgICdtb2RlbHMvdGlueV9mYWNlX2RldGVjdG9yX21vZGVsLXdlaWdodHNfbWFuaWZlc3QuanNvbicsXG4gICAgICAgICdtb2RlbHMvZmFjZV9sYW5kbWFya182OF9tb2RlbC13ZWlnaHRzX21hbmlmZXN0Lmpzb24nLFxuICAgICAgICAnbW9kZWxzL2ZhY2VfcmVjb2duaXRpb25fbW9kZWwtd2VpZ2h0c19tYW5pZmVzdC5qc29uJ1xuICAgICAgXSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdBU1dKQSAtIEFic2Vuc2kgU2hvbGF0IFdhamliIEJlcmphbWFhaCcsXG4gICAgICAgIHNob3J0X25hbWU6ICdBU1dKQScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWJzZW5zaSBTaG9sYXQgV2FqaWIgQmVyamFtYWFoIE1BTiBJbnNhbiBDZW5kZWtpYSBLb3RhIFBhbGFuZ2thcmF5YScsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzBlYTU3MicsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjMDY0ZTNiJyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3BvcnRyYWl0JyxcbiAgICAgICAgc2NvcGU6ICcvJyxcbiAgICAgICAgc3RhcnRfdXJsOiAnLycsXG4gICAgICAgIGxhbmc6ICdpZCcsXG4gICAgICAgIGNhdGVnb3JpZXM6IFsnZWR1Y2F0aW9uJywgJ3Byb2R1Y3Rpdml0eSddLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogJ2ljb25zL2ljb24tMTkyLnBuZycsXG4gICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXG4gICAgICAgICAgICBwdXJwb3NlOiAnYW55J1xuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnaWNvbnMvaWNvbi01MTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcbiAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6ICdpY29ucy9pY29uLW1hc2thYmxlLTE5Mi5wbmcnLFxuICAgICAgICAgICAgc2l6ZXM6ICcxOTJ4MTkyJyxcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxuICAgICAgICAgICAgcHVycG9zZTogJ21hc2thYmxlJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnaWNvbnMvaWNvbi1tYXNrYWJsZS01MTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcbiAgICAgICAgICAgIHB1cnBvc2U6ICdtYXNrYWJsZSdcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxzdmcscG5nLGljbyx3b2ZmMix3ZWJtYW5pZmVzdH0nXSxcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogJy9pbmRleC5odG1sJyxcbiAgICAgICAgY2xlYW51cE91dGRhdGVkQ2FjaGVzOiB0cnVlLFxuICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxuICAgICAgICBydW50aW1lQ2FjaGluZzogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIC8vIE1vZGVsIG1hbmlmZXN0IEpTT04gXHUyMDE0IFN0YWxlV2hpbGVSZXZhbGlkYXRlIGFnYXIgb2ZmbGluZSBtYXNpaCBiaXNhXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwvbW9kZWxzXFwvLitcXC5qc29uJC8sXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdzbWFydGZhY2UtbW9kZWxzLW1hbmlmZXN0JyxcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiA4LCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzMCB9LFxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gTW9kZWwgYmluYXJ5IHNoYXJkcyAoLmJpbikgXHUyMDE0IE5ldHdvcmtGaXJzdCBkZW5nYW4gY2FjaGUgZmFsbGJhY2suXG4gICAgICAgICAgICAvLyBOZXR3b3JrRmlyc3QgbWVtYXN0aWthbiBraXRhIHNlbGFsdSBjZWsgdmVyc2kgdGVyYmFydSBkYXJpIENETjtcbiAgICAgICAgICAgIC8vIGthbGF1IG9mZmxpbmUsIGZhbGxiYWNrIGtlIGNhY2hlLiBUSURBSyBDYWNoZUZpcnN0IGFnYXIgc2FhdCBtb2RlbFxuICAgICAgICAgICAgLy8gZGktdXBkYXRlIGRpIHNlcnZlciwgZGV2aWNlIGxhbmdzdW5nIGRhcGF0IHZlcnNpIGJhcnUgdGFucGEgc3RhbGUgZGF0YS5cbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9cXC9tb2RlbHNcXC8uK1xcLmJpbiQvLFxuICAgICAgICAgICAgaGFuZGxlcjogJ05ldHdvcmtGaXJzdCcsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3NtYXJ0ZmFjZS1tb2RlbHMtYmluYXJ5JyxcbiAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiAxMCxcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiA4LCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9cXC4oPzpwbmd8anBnfGpwZWd8c3ZnfGdpZnx3ZWJwfGljbykkLyxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdTdGFsZVdoaWxlUmV2YWxpZGF0ZScsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3NtYXJ0ZmFjZS1pbWFnZXMnLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogNjQsXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC9yYXdcXC5naXRodWJ1c2VyY29udGVudFxcLmNvbVxcLy4rLyxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc21hcnRmYWNlLXJlbW90ZScsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiA4LFxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDdcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gU291bmQgZmlsZXMgXHUyMDE0IENhY2hlRmlyc3QgdW50dWsgZmFzdCBwbGF5YmFjaywgY2FjaGUgMSB0YWh1blxuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcL3NvdW5kc1xcLy4rLyxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc21hcnRmYWNlLXNvdW5kcycsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMjAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIGRldk9wdGlvbnM6IHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgIHR5cGU6ICdtb2R1bGUnXG4gICAgICB9XG4gICAgfSlcbiAgXVxufSk7Il0sCiAgIm1hcHBpbmdzIjogIjtBQUE4VSxTQUFTLG9CQUFvQjtBQUMzVyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBRnhCLElBQU0sbUNBQW1DO0FBS3pDLElBQU0sa0JBQWlCLG9CQUFJLEtBQUssR0FBRSxZQUFZ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
