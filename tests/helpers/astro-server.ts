// Playwright owns this process. Use Astro's API so agent-aware CLI daemonization
// cannot detach the server or leave test environment settings on a preview server.
import { dev } from 'astro';

const port = Number(process.argv[2]);
if (![4331, 4322].includes(port)) throw new Error('Unexpected test port');
const server = await dev({
  server: { host: '127.0.0.1', port },
  // A retained preview can use different form settings. Do not let its dependency
  // optimisation invalidate modules and reload a browser in the middle of a test.
  vite: { cacheDir: `node_modules/.vite-tests-${port}` },
  logLevel: 'warn',
});
process.on('SIGTERM', () => {
  void server.stop().then(() => process.exit(0));
});
