import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = {
  ...process.env,
  XDG_CONFIG_HOME: fileURLToPath(
    new URL('../.npm-cache/wrangler-config', import.meta.url),
  ),
  WRANGLER_LOG_PATH: fileURLToPath(
    new URL('../.npm-cache/wrangler-logs', import.meta.url),
  ),
  WRANGLER_SEND_METRICS: 'false',
};
// Deploy root assets regardless of a caller's CI environment.
delete env.GITHUB_ACTIONS;
const run = (args) => {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(['scripts/build-website.mjs']);
mkdirSync(new URL('../.npm-cache/', import.meta.url), { recursive: true });
// Prevent Wrangler from loading website/.env.local and its server credentials.
writeFileSync(
  new URL('../.npm-cache/website-deploy.env', import.meta.url),
  '# Static website: no runtime environment variables.\n',
);
const args = [
  'node_modules/wrangler/bin/wrangler.js',
  'deploy',
  '--config',
  'wrangler.jsonc',
  '--env-file',
  '.npm-cache/website-deploy.env',
];
run([...args, '--dry-run']);
if (!process.argv.includes('--dry-run')) {
  run(args);
  run(['scripts/verify-website.mjs']);
}
