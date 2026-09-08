import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dashboardApiPlugin } from './scripts/dashboard-api.mjs'

export default defineConfig({
  root: 'web',
  plugins: [vue(), dashboardApiPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
      '@activity-registry': fileURLToPath(
        new URL('./src/game/config/grpc/json/activityRegistry.json', import.meta.url),
      ),
      '@protocol-version': fileURLToPath(
        new URL('./src/game/config/grpc/version.json', import.meta.url),
      ),
      '@automation-tasks': fileURLToPath(
        new URL('./src/game/config/automationTasks.json', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: '../dist-dashboard',
    emptyOutDir: true,
  },
})
