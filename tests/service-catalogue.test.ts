import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogueServices, services } from '../src/data/site.ts';

test('catalogue leads with building automation and places lamp installation sixth', () => {
  assert.deepEqual(
    catalogueServices.map(({ id, number }) => [id, number]),
    [
      ['bygningsautomatik', '01'],
      ['stikkontakter', '02'],
      ['smart-home', '03'],
      ['lysstyring-sensorer', '04'],
      ['hvidevarer', '05'],
      ['lampeopsaetning', '06'],
    ],
  );
});

test('display order preserves existing service-page bindings and enquiry choices', () => {
  assert.deepEqual(
    services.map(({ id }) => id),
    [
      'lampeopsaetning',
      'stikkontakter',
      'smart-home',
      'lysstyring-sensorer',
      'hvidevarer',
      'bygningsautomatik',
    ],
  );
  for (const service of services) {
    assert.equal(
      catalogueServices.find(({ id }) => id === service.id),
      service,
    );
  }
  assert.equal(catalogueServices[0].page, 'bygningsautomatik');
});
