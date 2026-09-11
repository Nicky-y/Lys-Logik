import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Webhook } from 'svix';
import {
  MailJobSchema,
  downloadableAttachment,
  AttachmentSchema,
} from '../supabase/functions/_shared/contracts/mail.ts';
import { dispatchCustomerMail } from '../supabase/functions/_shared/application/customer-mail.ts';
import {
  createResendMail,
  limitedBytes,
} from '../supabase/functions/_shared/infrastructure/resend-mail.ts';
import { customerMailWebhook } from '../supabase/functions/_shared/http/mail-webhook.ts';
import {
  createMessageSender,
  type CustomerMailGateway,
} from '../operations/src/customer-mail.ts';
import { LeadIdSchema } from '../supabase/functions/_shared/contracts/operations.ts';
const id = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const job = MailJobSchema.parse({
  id,
  leaseId: id,
  payload: {
    from: 'Lys & Logik <sager@mail.lysoglogik.dk>',
    to: ['anna@example.com'],
    reply_to: 'sag+' + 'a'.repeat(32) + '@mail.lysoglogik.dk',
    subject: 'Din opgave',
    text: 'Hej Anna',
  },
});
test('transport retries have identical payload and idempotency key; failures are classified without treating an HTTP error as sent', async () => {
  const requests: RequestInit[] = [];
  const sender = createResendMail('fixture-key', async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    requests.push(init!);
    return Response.json({ id });
  });
  await sender.send(job);
  await sender.send(job);
  assert.equal(requests[0].body, requests[1].body);
  assert.deepEqual(requests[0].headers, requests[1].headers);
  for (const [code, state] of [
    [429, 'retry'],
    [500, 'retry'],
    [422, 'failed'],
    [409, 'review'],
  ] as const) {
    assert.equal(
      (
        await createResendMail('fixture', async () =>
          Response.json(
            { name: 'invalid_idempotent_request' },
            { status: code },
          ),
        ).send(job)
      ).state,
      state,
    );
  }
});
test('dispatcher persists an uncertain result as retry and leaves unfinished leases recoverable', async () => {
  const results: unknown[] = [];
  await dispatchCustomerMail(
    {
      claim: async () => [job],
      complete: async (_, r) => {
        results.push(r);
      },
    },
    async () => {
      throw new Error('timeout');
    },
  );
  assert.deepEqual(results, [{ state: 'retry' }]);
  await assert.rejects(
    () =>
      dispatchCustomerMail(
        {
          claim: async () => [job],
          complete: async () => {
            throw new Error('db unavailable');
          },
        },
        async () => ({ state: 'failed' }),
      ),
    /db unavailable/,
  );
});
test('webhook verifies raw signature and freshness before running any business operation', async () => {
  const secret =
    'whsec_' + Buffer.from('test-secret-for-webhooks').toString('base64');
  const verifier = new Webhook(secret);
  let calls = 0;
  const handler = customerMailWebhook(secret, async () => {
    calls++;
  });
  const raw = JSON.stringify({
    type: 'email.received',
    created_at: new Date().toISOString(),
    data: { email_id: id },
  });
  const now = new Date();
  const eventId = 'msg_fixture';
  const request = (payload = raw, date = now) =>
    new Request('https://example.com', {
      method: 'POST',
      body: payload,
      headers: {
        'svix-id': eventId,
        'svix-timestamp': String(Math.floor(date.getTime() / 1000)),
        'svix-signature': verifier.sign(eventId, date, raw),
      },
    });
  assert.equal((await handler(request())).status, 204);
  assert.equal(calls, 1);
  assert.equal((await handler(request(raw + ' '))).status, 400);
  assert.equal(
    (await handler(request(raw, new Date(Date.now() - 10 * 60000)))).status,
    400,
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await customerMailWebhook(secret, async () => {
        throw new Error('transient');
      })(request())
    ).status,
    503,
  );
});
test('incoming HTML is converted to text, addresses normalized and attachment metadata guarded', async () => {
  const incoming = createResendMail('fixture', async () =>
    Response.json({
      id,
      from: 'Anna <anna@example.com>',
      to: ['Lys <SAG+' + 'A'.repeat(32) + '@mail.lysoglogik.dk>'],
      subject: 'Re: Opdagelse',
      text: null,
      html: '<p>Hej <strong>jer</strong></p><script>bad()</script>',
      attachments: [],
    }),
  );
  const mail = await incoming.receive(job.id as any);
  assert.equal(mail.senderEmail, 'anna@example.com');
  assert.equal(mail.to[0], job.payload.reply_to);
  assert.ok(mail.body.includes('Hej jer'));
  assert.ok(!mail.body.includes('<strong>'));
  assert.ok(!mail.body.includes('bad()'));
  assert.equal(
    downloadableAttachment(
      AttachmentSchema.parse({
        id,
        filename: 'a.html',
        content_type: 'text/html',
        size: 10,
      }),
    ),
    false,
  );
  assert.equal(
    downloadableAttachment(
      AttachmentSchema.parse({
        id,
        filename: 'a.jpg',
        content_type: 'image/jpeg',
        size: 11 * 1024 * 1024,
      }),
    ),
    false,
  );
  await assert.rejects(
    () => limitedBytes(new Response('too long'), 2),
    /mail_too_large/,
  );
});
test('a lost acknowledgement preserves the logical message identity on retry', async () => {
  const sent: any[] = [];
  const gateway = {
    queue: async (message: any) => {
      sent.push(message);
      if (sent.length === 1) throw new Error('lost acknowledgement');
      return message.id;
    },
  } as CustomerMailGateway;
  const send = createMessageSender(gateway);
  const input = {
    leadId: LeadIdSchema.parse(id),
    subject: 'Emne',
    body: 'Besked',
  };
  await assert.rejects(() => send(input));
  await send(input);
  assert.equal(sent[0].id, sent[1].id);
  await send({ ...input, body: 'En ny besked' });
  assert.notEqual(sent[1].id, sent[2].id);
});
