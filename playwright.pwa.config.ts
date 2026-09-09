import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e-pwa',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5176',
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
      command: 'node tests/helpers/pwa-server.mjs',
      url: 'http://127.0.0.1:5176',
      reuseExistingServer: false,
      timeout: 60000,
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
