import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  createTestDatabase,
  validLead,
  submissionKey,
} from './helpers/database.ts';
import { MailJobSchema } from '../supabase/functions/_shared/contracts/mail.ts';
let db: PGlite;
let leadId: string;
const staff = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});
async function login() {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    staff,
  ]);
  await db.exec('set role authenticated');
}
beforeEach(async () => {
  await db.exec(
    'reset role; truncate public.leads,public.staff_members,auth.users,lys_private.mail_receipts,lys_private.mail_inbound cascade;',
  );
  await db.query('insert into auth.users(id) values($1)', [staff]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values($1,'Backoffice','backoffice')",
    [staff],
  );
  await db.query('select public.create_lead_submission($1,$2)', [
    submissionKey,
    JSON.stringify(validLead),
  ]);
  leadId = (await db.query<{ id: string }>('select id from public.leads'))
    .rows[0].id;
  await db.exec('update lys_private.mail_settings set enabled=true;');
  await login();
});
const queue = (
  id = randomUUID(),
  body = 'Tak for din henvendelse.',
  subject = 'Din opgave',
) =>
  db.query('select public.queue_customer_message($1,$2,$3,$4) id', [
    id,
    leadId,
    subject,
    body,
  ]);
async function claim() {
  await db.exec('reset role; set role service_role');
  return (
    await db.query<{ jobs: unknown[] }>(
      'select public.claim_customer_mail() jobs',
    )
  ).rows[0].jobs.map((v) => MailJobSchema.parse(v));
}
test('staff queue is immutable, derived from the customer, idempotent and independent of workflow version', async () => {
  const id = randomUUID();
  await queue(id);
  await queue(id);
  await assert.rejects(() => queue(id, 'Changed'), /message_conflict/);
  assert.equal(
    (await db.query('select * from public.lead_messages')).rows.length,
    1,
  );
  assert.equal(
    (await db.query<{ version: number }>('select version from public.leads'))
      .rows[0].version,
    1,
  );
  await assert.rejects(
    () => db.exec("update public.lead_messages set body='changed'"),
    /permission denied/,
  );
  const jobs = await claim();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.to[0], validLead.email);
  assert.match(
    jobs[0].payload.reply_to,
    /^sag\+[a-f0-9]{32}@mail\.lysoglogik\.dk$/,
  );
  await db.exec('reset role');
  await assert.rejects(
    () => db.exec("update public.lead_messages set body='changed'"),
    /immutable_message/,
  );
  assert.equal(
    (
      await db.query(
        "select * from lys_private.notification_outbox where kind='lead_received.customer' and state='pending'",
      )
    ).rows.length,
    1,
  );
});
test('disabled configuration, anonymous access, inactive staff, header injection and mail bursts fail closed', async () => {
  await assert.rejects(
    () => queue(randomUUID(), 'Body', 'Subject\r\nBcc: victim@example.com'),
    /invalid_message/,
  );
  await db.exec(
    'reset role; update lys_private.mail_settings set enabled=false',
  );
  await login();
  await assert.rejects(() => queue(), /mail_not_ready/);
  await db.exec(
    'reset role; update lys_private.mail_settings set enabled=true',
  );
  await login();
  for (let i = 0; i < 10; i++) await queue();
  await assert.rejects(() => queue(), /mail_rate_limit/);
  await db.exec('reset role; update public.staff_members set active=false');
  await login();
  assert.equal(
    (await db.query('select * from public.lead_messages')).rows.length,
    0,
  );
  await assert.rejects(() => queue(), /staff_required/);
  await db.exec('reset role; set role anon');
  await assert.rejects(() => queue(), /permission denied/);
});
test('leases fence late completion and retries keep identical transport evidence', async () => {
  await queue();
  const first = (await claim())[0];
  assert.equal((await claim()).length, 0);
  await db.exec(
    "reset role; update lys_private.mail_jobs set lease_until=now()-interval '1 minute'",
  );
  const second = (await claim())[0];
  assert.deepEqual(first.payload, second.payload);
  assert.notEqual(first.leaseId, second.leaseId);
  const complete = async (lease: string, result = 'accepted') =>
    (
      await db.query<{ ok: boolean }>(
        'select public.complete_customer_mail($1,$2,$3,$4) ok',
        [first.id, lease, result, randomUUID()],
      )
    ).rows[0].ok;
  assert.equal(await complete(first.leaseId), false);
  assert.equal(await complete(second.leaseId), true);
  assert.equal((await claim()).length, 0);
});
test('an ambiguous send is never automatically repeated beyond provider idempotency retention', async () => {
  await queue();
  await claim();
  await db.exec(
    "reset role; update lys_private.mail_jobs set first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 minute'",
  );
  assert.equal((await claim()).length, 0);
  await login();
  assert.equal(
    (
      await db.query<{ state: string }>(
        'select state from public.lead_messages',
      )
    ).rows[0].state,
    'review',
  );
});
test('delivery webhook can arrive before acknowledgement and cannot downgrade bounce evidence', async () => {
  await queue();
  const job = (await claim())[0];
  const provider = randomUUID();
  const event = (type: string) =>
    db.query('select public.record_customer_mail_delivery($1,$2,$3,now())', [
      randomUUID(),
      provider,
      type,
    ]);
  await event('email.delivered');
  await db.query("select public.complete_customer_mail($1,$2,'accepted',$3)", [
    job.id,
    job.leaseId,
    provider,
  ]);
  await login();
  assert.equal(
    (
      await db.query<{ state: string }>(
        'select state from public.lead_messages',
      )
    ).rows[0].state,
    'delivered',
  );
  await db.exec('reset role; set role service_role');
  await event('email.bounced');
  await event('email.delivered');
  await login();
  assert.equal(
    (
      await db.query<{ state: string }>(
        'select state from public.lead_messages',
      )
    ).rows[0].state,
    'bounced',
  );
});
test('reply routing deduplicates messages, retains unknown mail and authorizes attachments against the correct message', async () => {
  await queue();
  const job = (await claim())[0];
  const provider = randomUUID();
  const attachment = randomUUID();
  const mail = {
    from: 'Anna <anna@example.com>',
    senderEmail: 'anna@example.com',
    to: [job.payload.reply_to],
    subject: 'Re: Din opgave',
    body: 'Her er billedet.',
    attachments: [
      {
        id: attachment,
        filename: 'lampe.jpg',
        content_type: 'image/jpeg',
        size: 200,
      },
    ],
  };
  const receive = (p = provider, m = mail) =>
    db.query<{ id: string | null }>(
      'select public.receive_customer_mail($1,$2,now(),$3) id',
      [randomUUID(), p, JSON.stringify(m)],
    );
  const first = (await receive()).rows[0].id;
  assert.ok(first);
  assert.equal((await receive()).rows[0].id, first);
  assert.equal(
    (
      await receive(randomUUID(), {
        ...mail,
        to: ['unknown@mail.lysoglogik.dk'],
      })
    ).rows[0].id,
    null,
  );
  await login();
  assert.equal(
    (await db.query('select * from public.lead_messages')).rows.length,
    2,
  );
  const source = await db.query<{ id: string }>(
    'select public.customer_attachment_source($1,$2) id',
    [first, attachment],
  );
  assert.equal(source.rows[0].id, provider);
  await assert.rejects(
    () =>
      db.query('select public.customer_attachment_source($1,$2)', [
        job.id,
        attachment,
      ]),
    /attachment_not_found/,
  );
  await db.exec('reset role');
  assert.equal(
    (
      await db.query(
        "select * from lys_private.notification_outbox where kind='message_received.staff'",
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        'select * from lys_private.mail_inbound where message_id is null',
      )
    ).rows.length,
    1,
  );
});
test('a different sender is visibly flagged while preserving the routed customer reply', async () => {
  await queue();
  const job = (await claim())[0];
  await db.query('select public.receive_customer_mail($1,$2,now(),$3)', [
    randomUUID(),
    randomUUID(),
    JSON.stringify({
      from: 'other@example.com',
      senderEmail: 'other@example.com',
      to: [job.payload.reply_to],
      subject: 'Svar',
      body: 'Anden afsender',
      attachments: [],
    }),
  ]);
  await login();
  assert.equal(
    (
      await db.query<{ sender_matches_customer: boolean }>(
        "select sender_matches_customer from public.lead_messages where direction='inbound'",
      )
    ).rows[0].sender_matches_customer,
    false,
  );
});
