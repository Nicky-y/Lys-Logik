import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

// Verify the actual production artifact for both Cloudflare and the legacy Pages target.
const dist = new URL('../../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', dist), 'utf8');

test('lamp service route has its own metadata and base-aware navigation and assets', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const lamp = readFileSync(
    new URL('services/lampeopsaetning/index.html', dist),
    'utf8',
  );
  assert.match(lamp, /<title>Lampeopsætning i Storkøbenhavn/);
  assert.equal([...lamp.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`href="${base}services/lampeopsaetning/"`));
  assert.ok(lamp.includes(`href="${base}?service=lampeopsaetning#kontakt"`));
  assert.ok(lamp.includes(`href="${base}#ydelser"`));
  assert.ok(lamp.includes(`src="${base}images/lighting-960.webp"`));
  assert.ok(lamp.includes('Op til 4 timers gratis arbejde'));
  assert.ok(!lamp.includes('425 kr'));
  const assets = [
    ...lamp.matchAll(/(?:src|href)="([^"\s]*\/_astro\/[^"\s]+)"/g),
  ];
  for (const [, path] of assets) {
    assert.ok(path.startsWith(`${base}_astro/`), path);
    assert.ok(existsSync(new URL(path.slice(base.length), dist)), path);
  }
});

test('pilot offer and payment terms consistently specify four hours', () => {
  assert.ok(html.includes('Op til 4 timers arbejde.'));
  assert.ok(html.includes('op til 4 timers arbejde uden beregning'));
  assert.ok(
    html.includes('Arbejde ud over de 4 timer kræver en særskilt aftale.'),
  );
  assert.doesNotMatch(html, /(?:8|otte)\s+timer(?:s)?\b/i);
});

test('production ships the live form with the production endpoint and real widget', () => {
  assert.match(
    html,
    /data-lead-endpoint="https:\/\/elydnshkxcwlmbdmtpys\.supabase\.co\/functions\/v1\/create-lead"/,
  );
  assert.match(html, /data-turnstile-site-key="0x4AAAAAAEslNMfqqO2vHaTk"/);
  assert.ok(html.includes('Send din henvendelse'));
  assert.ok(html.includes('Vi har modtaget din henvendelse.'));
  assert.match(html, /id="lead-reference"/);
  assert.ok(html.includes('Cloudflare'));
  assert.ok(html.includes('Turnstile-sikkerhedskontrollen'));
  assert.ok(html.includes('kontakt@lysoglogik.dk'));
  assert.ok(!html.includes('hej@lysoglogik.example'));
  assert.ok(!html.includes('Privatliv &amp; prototype'));
  assert.ok(!html.includes('Demoversion'));
  assert.ok(!html.includes('Intet er sendt eller gemt'));
  assert.match(html, /<fieldset\b[^>]*id="form-fields"[^>]*disabled/);
});

test('all five catalogue images ship under the deployment base', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const catalogue = html.match(
    /<section\b[^>]*id="ydelser"[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(catalogue, 'service catalogue is rendered');
  const images = [...catalogue.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)];
  assert.equal(images.length, 5);
  assert.equal(new Set(images.map((image) => image[1])).size, 5);
  for (const [tag, path] of images) {
    assert.ok(path.startsWith(`${base}images/`), path);
    assert.ok(existsSync(new URL(path.slice(base.length), dist)), path);
    assert.match(tag, /width="960"/);
    assert.match(tag, /height="640"/);
    assert.match(tag, /loading="lazy"/);
  }
});

test('production JS and CSS resolve within the deployment base and exist in the artifact', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  assert.ok(html.includes(`href="${base}images/favicon-v19.png"`));
  assert.ok(existsSync(new URL('images/favicon-v19.png', dist)));
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"\s]*\/_astro\/[^"\s]+)"/g),
  ].map((match) => match[1]);
  assert.ok(
    assets.some((path) => path.endsWith('.js')),
    'form JavaScript is emitted',
  );
  assert.ok(
    assets.some((path) => path.endsWith('.css')),
    'styles are emitted',
  );
  for (const path of assets) {
    assert.ok(path.startsWith(`${base}_astro/`), path);
    assert.ok(existsSync(new URL(path.slice(base.length), dist)), path);
  }
});
