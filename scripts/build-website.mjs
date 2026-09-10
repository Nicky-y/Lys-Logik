import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(
  readFileSync(
    new URL('../config/website.production.json', import.meta.url),
    'utf8',
  ),
);
// These are public browser values. Administration credentials are never needed to build.
const env = {
  ...process.env,
  ASTRO_TELEMETRY_DISABLED: '1',
  PUBLIC_LEAD_ENDPOINT: config.leadEndpoint,
  PUBLIC_TURNSTILE_SITE_KEY: config.turnstileSiteKey,
};
for (const args of [
  ['node_modules/astro/bin/astro.mjs', 'check'],
  ['node_modules/astro/bin/astro.mjs', 'build'],
  ['--test', 'tests/build/pages.test.ts'],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
