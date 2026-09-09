import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54327';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_fixture';
process.env.VITE_OPERATIONS_MODE = 'live';
const root = resolve('.npm-cache/pwa-dist');
await build({
  configFile: 'operations/vite.config.ts',
  build: { outDir: root },
});
const headers = (await readFile('operations/public/_headers', 'utf8'))
  .split('\n')
  .slice(1)
  .filter((line) => line.trim())
  .map((line) => {
    const split = line.indexOf(':');
    return [
      line.slice(0, split).trim(),
      line
        .slice(split + 1)
        .trim()
        .replace(
          'https://elydnshkxcwlmbdmtpys.supabase.co',
          'http://127.0.0.1:54327',
        ),
    ];
  });
let release = 0;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/_test/release' && req.method === 'POST') {
    release++;
    res.writeHead(204);
    res.end();
    return;
  }
  // Match the production host's canonical redirect for .html assets.
  if (path === '/offline.html') {
    res.writeHead(308, { Location: '/offline' });
    res.end();
    return;
  }
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path === '/offline' ? '/offline.html' : path));
  if (
    !file.startsWith(
      root + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'),
    )
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    let bytes = await readFile(file);
    if (path === '/sw.js' && release)
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            /lys-logik-offline-([a-f0-9]+)/,
            `lys-logik-offline-test${release}`,
          ),
      );
    res.writeHead(200, {
      ...Object.fromEntries(headers),
      'Content-Type':
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.webmanifest': 'application/manifest+json',
          '.woff2': 'font/woff2',
        }[extname(file)] || 'application/octet-stream',
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(5176, '127.0.0.1');
process.on('SIGTERM', () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
