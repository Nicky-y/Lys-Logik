import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  let offline = false;
  const caches = {
    async keys() {
      return [...stores.keys()];
    },
    async delete(key: string) {
      return stores.delete(key);
    },
    async open(key: string) {
      if (!stores.has(key)) stores.set(key, new Map());
      const entries = stores.get(key)!;
      return {
        async addAll(paths: string[]) {
          for (const path of paths) entries.set(path, new Response(path));
        },
        async match(path: string) {
          return entries.get(path)?.clone();
        },
      };
    },
  };
  runInNewContext(
    readFileSync(
      new URL('../operations/service-worker.js', import.meta.url),
      'utf8',
    ),
    {
      self: {
        location: { origin: 'https://app.example' },
        clients: { claim: async () => {} },
        addEventListener: (name: string, fn: (e: any) => void) => {
          handlers[name] = fn;
        },
      },
      caches,
      URL,
      Response,
      fetch: async (request: { url: string }) => {
        fetched.push(request.url);
        if (offline) throw new Error('offline');
        return new Response('network');
      },
    },
  );
  return {
    stores,
    fetched,
    caches,
    setOffline: () => {
      offline = true;
    },
    async lifecycle(name: string) {
      let completion: Promise<void> | undefined;
      handlers[name]({
        waitUntil: (p: Promise<void>) => {
          completion = p;
        },
      });
      await completion;
    },
    async fetch(url: string, mode = 'cors', method = 'GET') {
      let response: Promise<Response> | undefined;
      handlers.fetch({
        request: { url, mode, method },
        respondWith: (p: Promise<Response>) => {
          response = p;
        },
      });
      return response ? await response : undefined;
    },
  };
}

test('offline cache contains only public fallback and icon, never API or auth responses', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.deepEqual([...sw.stores.values()][0].keys().toArray(), [
    '/offline.html',
    '/icons/app-v12-192.png',
  ]);
  for (const url of [
    'https://database.example/auth/v1/token',
    'https://database.example/rest/v1/leads',
    'https://app.example/api/leads',
    'https://app.example/icons/app-v12-192.png?token=secret',
  ]) {
    assert.equal(await sw.fetch(url), undefined);
  }
  assert.equal(
    await sw.fetch('https://app.example/', 'navigate', 'POST'),
    undefined,
  );
  assert.equal(sw.fetched.length, 0);
});

test('navigation uses the network and falls back without caching a logged-in page', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.equal(
    await (await sw.fetch('https://app.example/', 'navigate'))?.text(),
    'network',
  );
  sw.setOffline();
  assert.equal(
    await (await sw.fetch('https://app.example/', 'navigate'))?.text(),
    '/offline.html',
  );
  assert.equal([...sw.stores.values()][0].has('/'), false);
});

test('activation removes only old caches owned by this app', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  await sw.caches.open('lys-logik-offline-old');
  await sw.caches.open('unrelated-cache');
  await sw.lifecycle('activate');
  assert.equal(sw.stores.has('lys-logik-offline-old'), false);
  assert.equal(sw.stores.has('unrelated-cache'), true);
  assert.equal(sw.stores.size, 2);
});

test('manifest has a stable identity, standalone launch and required icon sizes', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../operations/public/manifest.webmanifest', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/#/pipeline');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(
      (entry: any) =>
        entry.sizes === `${size}x${size}` && entry.purpose === 'any',
    );
    assert.ok(icon);
    const png = readFileSync(
      new URL(`../operations/public${icon.src}`, import.meta.url),
    );
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const maskable = manifest.icons.find((entry: any) => entry.purpose === 'maskable');
  assert.ok(maskable);
  const png = readFileSync(new URL(`../operations/public${maskable.src}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 2, 'Android maskable icon has an opaque RGB background');
  for (const file of ['index.html', 'public/offline.html', 'src/pwa.tsx', 'service-worker.js']) {
    const source = readFileSync(new URL(`../operations/${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes(manifest.icons[0].src), `${file} uses the current app icon`);
  }
});
