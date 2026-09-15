import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Keep the test server in-process so teardown also works on Windows.
export default async function setup() {
  const previousMode = process.env.VITE_OPERATIONS_MODE;
  process.env.VITE_OPERATIONS_MODE = 'demo';
  const server = await createServer({
    configFile: fileURLToPath(
      new URL('../../operations/vite.config.ts', import.meta.url),
    ),
    cacheDir: fileURLToPath(
      new URL('../../node_modules/.vite-shell-tests', import.meta.url),
    ),
    server: { port: 5178, host: '127.0.0.1', strictPort: true },
  });
  await server.listen();
  return async () => {
    await server.close();
    if (previousMode === undefined) delete process.env.VITE_OPERATIONS_MODE;
    else process.env.VITE_OPERATIONS_MODE = previousMode;
  };
}
