import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// Build timestamp untuk version tracking
const buildTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19); // YYYY-MM-DD HH:MM:SS

export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __APP_VERSION__: JSON.stringify('1.0.0')
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@services': resolve(__dirname, 'src/services'),
      '@repositories': resolve(__dirname, 'src/repositories'),
      '@models': resolve(__dirname, 'src/models'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@config': resolve(__dirname, 'src/config'),
      '@router': resolve(__dirname, 'src/router'),
      '@styles': resolve(__dirname, 'src/styles')
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    // Performance budget — warn when chunks exceed these sizes (kB)
    chunkSizeWarningLimit: 500,
    cssCodeSplit: true,
    minify: 'esbuild',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching & code splitting
        manualChunks(id) {
          if (id.includes('node_modules/@vladmandic/face-api') || id.includes('node_modules/@tensorflow')) {
            return 'vendor-faceapi';
          }
          if (id.includes('node_modules/dexie') || id.includes('node_modules/dexie-react-hooks')) {
            return 'vendor-dexie';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/zod')) {
            return 'vendor-zod';
          }
          if (id.includes('src/repositories/index.ts') || id.includes('src/repositories/')) {
            return 'vendor-repositories';
          }
          if (id.includes('node_modules/')) {
            return 'vendor-other';
          }
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'icons/icon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-192.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
        'icons/favicon-32.png',
        'models/tiny_face_detector_model-weights_manifest.json',
        'models/face_landmark_68_model-weights_manifest.json',
        'models/face_recognition_model-weights_manifest.json'
      ],
      manifest: {
        name: 'ASWJA - Absensi Sholat Wajib Berjamaah',
        short_name: 'ASWJA',
        description: 'Absensi Sholat Wajib Berjamaah MAN Insan Cendekia Kota Palangkaraya',
        theme_color: '#0ea572',
        background_color: '#064e3b',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'id',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Model manifest JSON — StaleWhileRevalidate agar offline masih bisa
            urlPattern: /\/models\/.+\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'smartface-models-manifest',
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
            handler: 'NetworkFirst',
            options: {
              cacheName: 'smartface-models-binary',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'smartface-images',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'smartface-remote',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          },
          {
            // Sound files — CacheFirst untuk fast playback, cache 1 tahun
            urlPattern: /\/sounds\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'smartface-sounds',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: false,
        type: 'module'
      }
    })
  ]
});