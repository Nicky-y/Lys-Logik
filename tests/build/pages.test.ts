import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

// Verify the actual production artifact for both Cloudflare and the legacy Pages target.
const dist = new URL('../../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', dist), 'utf8');

test('printed form links ship HTTP redirects and portable fallback pages', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const redirects = readFileSync(new URL('_redirects', dist), 'utf8').trim().split('\n');
  assert.equal(redirects.length, 4);
  for (const source of ['qr', 'visitkort']) {
    const destination = `${base}?via=${source}#formular`;
    for (const slash of ['', '/']) {
      // Cloudflare serves at root; the legacy Pages host uses the HTML fallback.
      assert.ok(redirects.includes(`/${source}/formular${slash} /?via=${source}#formular 302`));
    }
    const fallback = readFileSync(new URL(`${source}/formular/index.html`, dist), 'utf8');
    assert.match(fallback, /http-equiv="refresh"/);
    assert.ok(fallback.includes(destination));
    assert.ok(!fallback.includes('googletagmanager.com'));
  }
  assert.match(html, /id="formular" class="form-card"/);
});

test('contact section reuses responsive hero artwork with deployment-safe paths', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const section = html.match(/<section id="kontakt"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.ok(section.includes('class="contact-background" aria-hidden="true"'));
  assert.ok(section.includes(`src="${base}images/hero.webp"`));
  assert.ok(
    section.includes(
      `srcset="${base}images/hero-960.webp 960w, ${base}images/hero.webp 1536w"`,
    ),
  );
  assert.ok(section.includes('loading="lazy"'));
  for (const path of ['images/hero.webp', 'images/hero-960.webp']) {
    assert.ok(existsSync(new URL(path, dist)));
  }
});

test('building automation has a complete service route and uses the supported enquiry contract', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const automation = readFileSync(
    new URL('services/bygningsautomatik/index.html', dist),
    'utf8',
  );
  assert.match(automation, /<title>Bygningsautomatik i Storkøbenhavn/);
  assert.equal([...automation.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`href="${base}services/bygningsautomatik/"`));
  assert.ok(
    automation.includes(
      `src="${base}images/service-bygningsautomatik-v2.webp"`,
    ),
  );
  assert.ok(
    automation.includes(`href="${base}?service=bygningsautomatik#kontakt"`),
  );
  assert.ok(!automation.includes('topic=bygningsautomatik'));
  assert.ok(html.includes('value="bygningsautomatik"'));
  assert.ok(
    automation.includes(
      'Vi udfører kun arbejde, der ikke kræver autorisation.',
    ),
  );
  assert.ok(automation.includes('Op til 4 timers gratis arbejde'));
  assert.ok(
    automation.includes(
      'https://www.bygningsreglementet.dk/tekniske-bestemmelser/11/krav/295_296/',
    ),
  );
  for (const section of ['help', 'scope', 'process', 'price', 'faq', 'end']) {
    assert.ok(automation.includes(`id="${section}-title"`));
  }
});

test('appliance route preserves contact context and limits the offer to electrical plug connection', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const appliance = readFileSync(
    new URL('services/hvidevarer/index.html', dist),
    'utf8',
  );
  assert.match(
    appliance,
    /<title>Tilslutning af hvidevarer med stikprop i Storkøbenhavn/,
  );
  assert.equal([...appliance.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`href="${base}services/hvidevarer/"`));
  assert.ok(appliance.includes(`href="${base}?service=hvidevarer#kontakt"`));
  assert.ok(
    appliance.includes(`src="${base}images/service-hvidevarer-v1.webp"`),
  );
  assert.ok(appliance.includes('Vi udfører ikke fast tilslutning i en dåse'));
  assert.ok(
    appliance.includes('Her tilbyder vi alene den elektriske tilslutning.'),
  );
  assert.ok(appliance.includes('Op til 4 timers gratis arbejde'));
  assert.ok(!appliance.includes('425 kr'));
});

test('lighting control route preserves the sensor enquiry choice and existing-installation scope', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const lighting = readFileSync(
    new URL('services/lysstyring/index.html', dist),
    'utf8',
  );
  assert.match(lighting, /<title>Lysstyring og sensorer i Storkøbenhavn/);
  assert.equal([...lighting.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`href="${base}services/lysstyring/"`));
  assert.ok(
    lighting.includes(`href="${base}?service=lysstyring-sensorer#kontakt"`),
  );
  assert.ok(lighting.includes(`src="${base}images/smart-home-960.webp"`));
  assert.ok(
    lighting.includes(
      'Nye afbryderplaceringer og større indgreb er ikke omfattet.',
    ),
  );
  assert.ok(lighting.includes('Op til 4 timers gratis arbejde'));
  assert.ok(!lighting.includes('425 kr'));
});

test('smart-home page ships with bounded configuration services and matching contact context', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const smartHome = readFileSync(
    new URL('services/smart-home/index.html', dist),
    'utf8',
  );
  assert.match(smartHome, /<title>Smart-home opsætning i Storkøbenhavn/);
  assert.equal([...smartHome.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`href="${base}services/smart-home/"`));
  assert.ok(smartHome.includes(`href="${base}?service=smart-home#kontakt"`));
  assert.ok(
    smartHome.includes(`src="${base}images/service-smart-home-v1.webp"`),
  );
  assert.ok(smartHome.includes('Vi monterer ikke indbyggede relæer'));
  assert.ok(smartHome.includes('Op til 4 timers gratis arbejde'));
  assert.ok(!smartHome.includes('425 kr'));
});

test('socket service page ships with its own scope and the matching contact choice', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const socket = readFileSync(
    new URL('services/stikkontakter/index.html', dist),
    'utf8',
  );
  assert.match(socket, /<title>Udskiftning af stikkontakter i Storkøbenhavn/);
  assert.equal([...socket.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`href="${base}services/stikkontakter/"`));
  assert.ok(socket.includes(`href="${base}?service=stikkontakter#kontakt"`));
  assert.ok(
    socket.includes(`src="${base}images/service-stikkontakter-v1.webp"`),
  );
  assert.ok(socket.includes('Op til 4 timers gratis arbejde'));
  assert.ok(socket.includes('250 V'));
  assert.ok(socket.includes('IP20'));
  assert.ok(socket.includes('30 mA'));
  assert.ok(!socket.includes('425 kr'));
});

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
  const pilot = html.match(/<section id="pilot"[\s\S]*?<\/section>/)?.[0];
  assert.ok(pilot);
  const text = pilot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Op til 4 timers arbejde/);
  assert.match(text, /0 kr\. i arbejdsløn/);
  assert.match(text, /3 udvalgte projekter/);
  assert.match(text, /Materialer og evt\. lejeudstyr/);
  assert.match(text, /efter aftale med dig.*referencecase/);
  assert.match(text, /Beskriv din opgave/);
  assert.doesNotMatch(text, /Pilotønsket markeres i formularen/);
  assert.doesNotMatch(text, /Skriv “pilotprojekt”/);
  assert.ok(html.includes('op til 4 timers arbejde uden beregning'));
  assert.ok(
    html.includes('Arbejde ud over de 4 timer kræver en særskilt aftale.'),
  );
  assert.doesNotMatch(html, /(?:8|otte)\s+timer(?:s)?\b/i);
});

test('production ships the live form with the production endpoint and real widget', () => {
  const form = html.match(/<form\b[^>]*id="enquiry-form"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form);
  assert.doesNotMatch(form, /pilotRequested|pilot-choice/);
  assert.ok(form.includes('Send en uforpligtende henvendelse'));
  assert.ok(form.includes('pris og omfang aftales'));
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

test('all six catalogue images ship under the deployment base', () => {
  const base = process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik/' : '/';
  const catalogue = html.match(
    /<section\b[^>]*id="ydelser"[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(catalogue, 'service catalogue is rendered');
  assert.ok(
    catalogue
      .replace(/\s+/g, ' ')
      .includes(
        'Fra den gode belysning til de små smarte detaljer. Vi finder en løsning, der giver mening for dig.',
      ),
  );
  assert.equal([...catalogue.matchAll(/aria-label="Læs mere:/g)].length, 6);
  assert.ok(catalogue.includes('aria-label="Læs om Bygningsautomatik"'));
  assert.ok(!catalogue.includes('/services/null/'));
  assert.ok(!catalogue.includes('Udforsk service'));
  const images = [...catalogue.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)];
  assert.equal(images.length, 6);
  assert.equal(new Set(images.map((image) => image[1])).size, 6);
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
