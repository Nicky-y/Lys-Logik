import assert from 'node:assert/strict';
import test from 'node:test';
import { readSupabaseServerKey } from '../supabase/functions/_shared/infrastructure/server-key.ts';

test('selects the configured named secret, including a non-default project key', () => {
  assert.equal(
    readSupabaseServerKey(
      JSON.stringify({ default_v1: 'sb_secret_fixture_v1' }),
      'default_v1',
    ),
    'sb_secret_fixture_v1',
  );
  assert.equal(
    readSupabaseServerKey(
      JSON.stringify({ default: 'sb_secret_fixture_default' }),
    ),
    'sb_secret_fixture_default',
  );
});

test('does not silently use another secret when the configured name is absent', () => {
  assert.throws(() =>
    readSupabaseServerKey(JSON.stringify({ other: 'sb_secret_fixture' })),
  );
  assert.throws(() => readSupabaseServerKey(undefined));
});

test('rejects invalid dictionaries, inherited properties and non-secret values', () => {
  for (const value of ['null', '[]', '"text"', '{invalid']) {
    assert.throws(() => readSupabaseServerKey(value));
  }
  assert.throws(() => readSupabaseServerKey('{}', 'toString'));
  for (const key of [
    '',
    null,
    42,
    'sb_publishable_fixture',
    'sb_secret_fixture\n',
  ]) {
    assert.throws(() =>
      readSupabaseServerKey(JSON.stringify({ default: key })),
    );
  }
});
