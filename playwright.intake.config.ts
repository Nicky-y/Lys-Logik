import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-intake',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: 'node tests/helpers/intake-server.ts',
      url: 'http://127.0.0.1:54325/health',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/helpers/astro-server.ts 4322',
      url: 'http://127.0.0.1:4322',
      reuseExistingServer: false,
      env: {
        ASTRO_TELEMETRY_DISABLED: '1',
        PUBLIC_LEAD_ENDPOINT: 'http://127.0.0.1:54325/create-lead',
        PUBLIC_TURNSTILE_SITE_KEY: 'local-widget-fixture',
      },
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
