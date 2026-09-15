import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import {
  operationsServerReady,
  stopOperationsServer,
} from './operations-server.ts';

export default async function setup() {
  await operationsServerReady;
  process.env.VITE_OPERATIONS_MODE = 'live';
  process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54327';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_fixture';
  let server;
  try {
    server = await createServer({
      configFile: fileURLToPath(
        new URL('../../operations/vite.config.ts', import.meta.url),
      ),
      cacheDir: fileURLToPath(
        new URL('../../node_modules/.vite-operations-tests', import.meta.url),
      ),
      server: { port: 5175, host: '127.0.0.1', strictPort: true },
    });
    await server.listen();
  } catch (error) {
    await server?.close();
    await stopOperationsServer();
    throw error;
  }
  return async () => {
    await server.close();
    await stopOperationsServer();
  };
}
