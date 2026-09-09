import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4331',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node tests/helpers/astro-server.ts 4331',
    url: 'http://127.0.0.1:4331',
    reuseExistingServer: false,
    env: {
      ASTRO_TELEMETRY_DISABLED: '1',
      PUBLIC_LEAD_ENDPOINT: '',
      PUBLIC_TURNSTILE_SITE_KEY: '',
    },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        channel: 'msedge',
      },
    },
  ],
});
