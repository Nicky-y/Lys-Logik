import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoCustomerMail } from '../operations/src/demo-mail.ts';
import { LeadIdSchema } from '../supabase/functions/_shared/contracts/operations.ts';
import { ComposeMessageSchema } from '../supabase/functions/_shared/contracts/mail.ts';

test('demo sends stay in memory, are idempotent and remain on the case even when customers share an email', async (context) => {
  const network = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected external request');
  });
  const first = LeadIdSchema.parse('1054ed20-67f4-4ff8-bd50-b423d7b11baf');
  const second = LeadIdSchema.parse('ec421bef-f031-4416-9f30-21871b4c7d30');
  const gateway = createDemoCustomerMail(
    [first, second].map((id) => ({
      id,
      name: 'Testkunde',
      email: 'customer@example.com',
      created_at: '2026-09-15T10:00:00Z',
    })),
  );
  const draft = ComposeMessageSchema.parse({
    id: 'c6d771c8-1242-4c22-8ab5-000000000001',
    leadId: first,
    subject: 'Test',
    body: 'Besked på første sag.',
  });
  assert.equal(await gateway.enabled(), true);
  assert.equal(await gateway.queue(draft), draft.id);
  assert.equal(await gateway.queue(draft), draft.id);
  const firstMessages = await gateway.list(first, 0);
  assert.equal(firstMessages.length, 2);
  assert.equal(firstMessages[0].body, draft.body);
  assert.equal(firstMessages[0].state, 'queued');
  assert.equal((await gateway.list(second, 0)).length, 1);
  assert.deepEqual(await gateway.list(first, 50), []);
  await assert.rejects(() =>
    gateway.queue({ ...draft, body: 'Andet indhold.' }),
  );
  await assert.rejects(() =>
    gateway.attachment(draft.id, 'c6d771c8-1242-4c22-8ab5-000000000099'),
  );
  firstMessages[0].body = 'Lokal manipulation';
  assert.equal((await gateway.list(first, 0))[0].body, draft.body);
  assert.equal(network.mock.callCount(), 0);
});
