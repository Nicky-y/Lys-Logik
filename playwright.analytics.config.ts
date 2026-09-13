import { defineConfig, devices } from '@playwright/test';

// Production HTML served by test routes; no dev server or real analytics traffic.
export default defineConfig({
  testDir: './tests/e2e-analytics',
  workers: 2,
  reporter: 'list',
  use: { channel: 'msedge', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
