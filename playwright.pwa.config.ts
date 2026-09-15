import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export default defineConfig({
  testDir: './tests/e2e-pwa',
  workers: 1,
  reporter: 'list',
  outputDir: join(tmpdir(), 'lys-logik-pwa-results'),
  use: {
    baseURL: 'http://127.0.0.1:5176',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  globalSetup: './tests/helpers/pwa-setup.mjs',
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
    { name: 'android', use: { ...devices['Pixel 7'], channel: 'msedge' } },
  ],
});
