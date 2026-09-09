import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run from the app directory so Wrangler never loads the website's server secrets.
const root = fileURLToPath(new URL('.', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
    ),
    ...process.argv.slice(2),
    '--config',
    'wrangler.jsonc',
    '--env-file',
    '.env.local',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: fileURLToPath(
        new URL('../.npm-cache/wrangler-config', import.meta.url),
      ),
      WRANGLER_LOG_PATH: fileURLToPath(
        new URL('../.npm-cache/wrangler-logs', import.meta.url),
      ),
      WRANGLER_SEND_METRICS: 'false',
    },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
