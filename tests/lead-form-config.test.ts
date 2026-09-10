import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveLeadFormConfig } from '../src/lib/lead-form-config.ts';

const valid = {
  development: false,
  endpoint: 'https://elydnshkxcwlmbdmtpys.supabase.co/functions/v1/create-lead',
  siteKey: '0x4AAAAAAEslNMfqqO2vHaTk',
};
test('production cannot silently ship a demo or partial configuration', () => {
  assert.throws(() => resolveLeadFormConfig({ development: false }));
  assert.throws(() => resolveLeadFormConfig({ ...valid, siteKey: '' }));
  assert.throws(() => resolveLeadFormConfig({ ...valid, endpoint: '' }));
  assert.equal(resolveLeadFormConfig(valid).live, true);
});
test('production rejects test keys and unsafe endpoints', () => {
  for (const endpoint of [
    'http://localhost/create-lead',
    'https://user:pass@example.com/lead',
    'https://example.com/lead?secret=x',
    'https://example.com/lead#fragment',
  ])
    assert.throws(() => resolveLeadFormConfig({ ...valid, endpoint }));
  for (const siteKey of [
    'local-widget-fixture',
    '1x00000000000000000000AA',
    '',
  ])
    assert.throws(() => resolveLeadFormConfig({ ...valid, siteKey }));
});
test('local development supports an isolated demo or local intake fixture', () => {
  assert.equal(resolveLeadFormConfig({ development: true }).live, false);
  assert.equal(
    resolveLeadFormConfig({
      development: true,
      endpoint: 'http://127.0.0.1:54325/create-lead',
      siteKey: 'local-widget-fixture',
    }).live,
    true,
  );
  assert.throws(() =>
    resolveLeadFormConfig({ development: true, endpoint: valid.endpoint }),
  );
});
