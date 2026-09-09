import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54327';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_fixture';
process.env.VITE_OPERATIONS_MODE = 'live';
const server = await createServer({
  configFile: 'operations/vite.config.ts',
  server: { port: 5175, host: '127.0.0.1', strictPort: true },
});
await server.listen();
server.printUrls();
process.on('SIGTERM', () => void server.close().then(() => process.exit(0)));
