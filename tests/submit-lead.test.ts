import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLeadSender } from '../src/lib/submit-lead.ts';
import { validLead, submissionKey } from './helpers/database.ts';

const reference = '19d43304-9a15-4398-8709-3f263241d184';
test('a lost acknowledgement reuses the same key and preserves the payload', async () => {
  const keys: string[] = [];
  let attempts = 0;
  const send = createLeadSender(
    'https://backend.example',
    async (_url, init) => {
      keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
      assert.deepEqual(JSON.parse(String(init?.body)).lead, validLead);
      if (++attempts === 1) throw new TypeError('network');
      return Response.json({ success: true, reference });
    },
    () => submissionKey,
  );
  await assert.rejects(
    send(validLead, 'first-token'),
    /oplysninger er bevaret/,
  );
  assert.equal((await send(validLead, 'fresh-token')).reference, reference);
  assert.deepEqual(keys, [submissionKey, submissionKey]);
});
test('a confirmed new enquiry gets a fresh submission key', async () => {
  const keys: string[] = [];
  let next = 0;
  const identity = [submissionKey, '755d91f3-d760-4faf-b659-7612d996a050'];
  const send = createLeadSender(
    'https://backend.example',
    async (_url, init) => {
      keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
      return Response.json({ success: true, reference });
    },
    () => identity[next++],
  );
  await send(validLead, 'token-1');
  await send(validLead, 'token-2');
  assert.deepEqual(keys, identity);
});
test('API failure or malformed success is never reported as a saved enquiry', async () => {
  for (const response of [
    Response.json({ success: true }, { status: 503 }),
    Response.json({ success: true }),
    Response.json({ success: true, reference: 'invalid' }),
  ]) {
    const send = createLeadSender(
      'https://backend.example',
      async () => response,
      () => submissionKey,
    );
    await assert.rejects(send(validLead, 'token'), /kunne ikke bekræfte/);
  }
});
test('concurrent button presses cannot start two network requests', async () => {
  let finish: (response: Response) => void = () => {};
  let calls = 0;
  const send = createLeadSender(
    'https://backend.example',
    async () => {
      calls++;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    },
    () => submissionKey,
  );
  const first = send(validLead, 'token');
  await assert.rejects(send(validLead, 'token'), /ved at blive sendt/);
  finish(Response.json({ success: true, reference }));
  await first;
  assert.equal(calls, 1);
});
