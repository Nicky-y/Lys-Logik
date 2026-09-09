import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e-operations',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: 'node tests/helpers/operations-server.ts',
      url: 'http://127.0.0.1:54327/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'node tests/helpers/operations-vite.mjs',
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
    { name: 'android', use: { ...devices['Pixel 7'], channel: 'msedge' } },
  ],
});
