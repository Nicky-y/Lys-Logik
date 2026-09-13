import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readChoice,
  encodeChoice,
  CONSENT_LIFETIME,
  pageLocation,
} from '../src/lib/analytics-consent.ts';

test('consent decisions expire at a deterministic boundary', () => {
  const now = 1_800_000_000_000;
  for (const choice of ['granted', 'denied'] as const) {
    const raw = encodeChoice(choice, now);
    assert.equal(readChoice(raw, now), choice);
    assert.equal(readChoice(raw, now + CONSENT_LIFETIME - 1), choice);
    assert.equal(readChoice(raw, now + CONSENT_LIFETIME), null);
    assert.equal(readChoice(raw, now - 1), null);
  }
});

test('missing, malformed and unsupported consent fail closed', () => {
  for (const raw of [
    null,
    '',
    '{',
    'null',
    'true',
    '[]',
    '{}',
    '{"version":2,"choice":"granted","at":1}',
    '{"version":1,"choice":"yes","at":1}',
    '{"version":1,"choice":"granted","at":"1"}',
  ]) {
    assert.equal(readChoice(raw, 100), null);
  }
});

test('only known routes survive page-location sanitization, including legacy Pages', () => {
  for (const base of ['/', '/Lys-Logik/']) {
    const origin = 'https://example.test';
    assert.equal(
      pageLocation(
        `${origin}${base}services/smart-home/?email=private#phone`,
        base,
      ),
      `${origin}${base}services/smart-home/`,
    );
    for (const path of [
      'customer/alice/',
      'services/%61lice/',
      'private@example.test',
    ]) {
      assert.equal(
        pageLocation(`${origin}${base}${path}?secret=value`, base),
        `${origin}${base}`,
      );
    }
  }
});
