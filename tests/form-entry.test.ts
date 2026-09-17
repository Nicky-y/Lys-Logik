import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formEntryCampaign, formEntryLinks } from '../src/lib/form-entry.ts';

test('printed links have fixed local destinations for both deployment bases', () => {
  for (const base of ['/', '/Lys-Logik', '/Lys-Logik/']) {
    const root = base.replace(/\/?$/, '/');
    assert.deepEqual(formEntryLinks(base), ['qr', 'visitkort'].map((source) => ({
      source,
      path: `${root}${source}/formular`,
      destination: `${root}?via=${source}#formular`,
    })));
  }
});

test('campaign fields contain only known source constants, never URL or form data', () => {
  for (const base of ['/', '/Lys-Logik/']) {
    for (const source of ['qr', 'visitkort']) {
      assert.deepEqual(formEntryCampaign(
        `https://example.test${base}?via=${source}&email=private&service=private&utm_source=private#private`, base,
      ), {
        campaign_source: source,
        campaign_medium: 'qr',
        campaign_name: 'kontaktformular',
      });
    }
  }
});

test('unknown, duplicate and off-route sources do not produce campaign attribution', () => {
  for (const path of [
    '/', '/?via=', '/?via=VISITKORT', '/?via=visitkort%20', '/?via=private%40example.test',
    '/?via=visitkort&via=qr', '/?via=visitkort&via=visitkort', '/?via=__proto__',
    '/?utm_source=visitkort', '/services/smart-home/?via=visitkort',
    '/customer/private/?via=visitkort',
  ]) {
    assert.deepEqual(formEntryCampaign(`https://example.test${path}`, '/'), {}, path);
  }
  assert.deepEqual(formEntryCampaign('https://example.test/?via=qr', '/Lys-Logik/'), {});
});
