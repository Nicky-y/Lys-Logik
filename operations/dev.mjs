import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const demo = process.argv.includes('--demo');
if (demo) process.env.VITE_OPERATIONS_MODE = 'demo';
const server = await createServer({
  configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  server: { port: demo ? 5174 : 5173 },
});
await server.listen();
server.printUrls();
process.on('SIGTERM', () => void server.close().then(() => process.exit(0)));
