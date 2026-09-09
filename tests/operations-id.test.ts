import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomId } from '../operations/src/random-id.ts';
import { CommandIdSchema } from '../supabase/functions/_shared/contracts/operations.ts';

test('local HTTP preview can create valid command IDs without crypto.randomUUID', () => {
  for (const value of [0, 255]) {
    const source = {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(value),
    } as Pick<Crypto, 'getRandomValues'>;
    const id = CommandIdSchema.parse(randomId(source));
    assert.equal(id[14], '4');
    assert.match(id[19], /[89ab]/);
    assert.equal(
      id,
      value === 0
        ? '00000000-0000-4000-8000-000000000000'
        : 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
  }
});

test('ID generation fails rather than falling back to predictable randomness', () => {
  const source = {
    getRandomValues: () => {
      throw new Error('random source unavailable');
    },
  };
  assert.throws(() => randomId(source), /random source unavailable/);
});
