import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formEntryLinks } from '../src/lib/form-entry.ts';

const config = JSON.parse(
  readFileSync(
    new URL('../config/website.production.json', import.meta.url),
    'utf8',
  ),
);
const request = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
const response = await request(config.origin);
assert.equal(response.status, 200);
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
const html = await response.text();
assert.ok(html.includes(`data-lead-endpoint="${config.leadEndpoint}"`));
assert.ok(
  html.includes(`data-turnstile-site-key="${config.turnstileSiteKey}"`),
);
assert.ok(html.includes('Vi har modtaget din henvendelse.'));
assert.ok(!html.includes('Demoversion'));
assert.ok(html.includes('id="formular"'));
for (const link of formEntryLinks('/')) {
  for (const suffix of ['', '/', '?via=other&email=synthetic-test']) {
    const redirect = await request(new URL(link.path + suffix, config.origin), {
      redirect: 'manual',
    });
    assert.equal(redirect.status, 302, link.path + suffix);
    assert.equal(
      new URL(redirect.headers.get('location'), config.origin).href,
      new URL(link.destination, config.origin).href,
      link.path + suffix,
    );
  }
}
const assets = [
  ...html.matchAll(/(?:src|href)="([^"\s]*\/_astro\/[^"\s]+)"/g),
].map((match) => match[1]);
assert.ok(assets.some((path) => path.endsWith('.js')));
assert.ok(assets.some((path) => path.endsWith('.css')));
for (const path of new Set(assets)) {
  assert.ok(
    path.startsWith('/_astro/'),
    'Cloudflare website uses the root base path',
  );
  const remote = await request(new URL(path, config.origin));
  assert.equal(remote.status, 200, path);
  assert.deepEqual(
    Buffer.from(await remote.arrayBuffer()),
    readFileSync(new URL(`../dist${path}`, import.meta.url)),
    path,
  );
}
for (const [origin, status] of [
  [config.origin, 204],
  ['https://example.com', 403],
]) {
  const preflight = await request(config.leadEndpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,idempotency-key',
    },
  });
  assert.equal(preflight.status, status);
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    status === 204 ? origin : null,
  );
}
console.log(
  JSON.stringify({
    origin: config.origin,
    liveForm: true,
    deployedAssetsMatch: true,
    printedFormLinks: 'passed',
    allowedOrigin: 'passed',
    rejectedOrigin: 'passed',
    note: 'No enquiry is submitted by this check.',
  }),
);
