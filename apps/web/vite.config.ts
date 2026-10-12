import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const apiTarget = process.env.API_URL ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': apiTarget } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    // Several agents run suites side by side on one machine, so each run takes a few cores, not all of them
    // (CI has a runner to itself). The longer timeout is for a busy machine, not slow code.
    maxWorkers: process.env.CI ? undefined : 4,
    testTimeout: 10_000,
    // Loading the app and its pages before a file's first test (see `useMockServer`) can take a while when busy.
    hookTimeout: 30_000,
  },
})
