import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoPushController } from '../operations/src/demo-push.ts';

test('notification preview toggles in memory and is isolated between demo sessions', async () => {
  const first = createDemoPushController();
  const second = createDemoPushController();
  assert.equal(await first.active(), false);
  await first.enable();
  assert.equal(await first.active(), true);
  assert.equal(await second.active(), false);
  await first.disable();
  assert.equal(await first.active(), false);
});
