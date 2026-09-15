import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e-shell',
  outputDir: join(tmpdir(), 'lys-logik-shell-results'),
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:5178',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  globalSetup: './tests/helpers/shell-setup.mjs',
});
